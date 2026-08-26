/**
 * जनतरंग पथदूत — ePaper upload engine (Apps Script Web App)
 * -----------------------------------------------------------------
 * Deploy this as a Web App ("Execute as: Me", "Who has access: Only myself")
 * and you get a private page where you drag in the day's PDF, pick the date,
 * and hit publish. It:
 *
 *   1. uploads the PDF straight from your browser to the Drive folder
 *      (resumable upload, so size is not a problem and you get a progress bar)
 *   2. pushes it to GitHub as epapers/YYYY-MM-DD.pdf
 *   3. rewrites data/editions.json so the site shows it
 *
 * Shares CONFIG and the GitHub helpers with Code.gs — both files live in the
 * same Apps Script project, so they share one global scope.
 *
 * Retention (deleting editions past 30 days) is handled by the 15-minute
 * trigger in Code.gs, not here.
 */

/* ================== WEB APP ================== */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Upload')
    .setTitle('जनतरंग पथदूत — ePaper Upload')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Everything the page needs on load. */
function getBootstrap() {
  var manifest = [];
  var err = null;
  try {
    manifest = readManifest();
  } catch (e) {
    err = String(e.message || e);
  }

  return {
    today       : isoDate(new Date()),
    folderId    : CONFIG.DRIVE_FOLDER_ID,
    siteUrl     : 'https://' + CONFIG.GITHUB_OWNER + '.github.io/',
    repo        : CONFIG.GITHUB_OWNER + '/' + CONFIG.GITHUB_REPO,
    retention   : CONFIG.RETENTION_DAYS,
    tokenSet    : !!props().getProperty('GITHUB_TOKEN'),
    error       : err,
    editions    : manifest.slice(0, 12).map(function (e) {
      return { date: e.date, size: e.size || 0 };
    })
  };
}

/**
 * Hands the browser a short-lived OAuth token so it can upload straight to
 * Drive. Same token the script itself uses — the web app is private to you.
 */
function getUploadToken() {
  return {
    token   : ScriptApp.getOAuthToken(),
    folderId: CONFIG.DRIVE_FOLDER_ID
  };
}

/* ================== PUBLISH ================== */

/**
 * Publishes a PDF that is already sitting in Drive.
 * @param {string} fileId  Drive file id
 * @param {string} dateStr YYYY-MM-DD
 */
function publishFromDrive(fileId, dateStr) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('एक और अपलोड चल रहा है, कृपया कुछ सेकंड बाद प्रयास करें। (Another publish is in progress.)');

  try {
    assertDate(dateStr);

    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();

    if (file.getMimeType() !== 'application/pdf' && !/\.pdf$/i.test(file.getName())) {
      throw new Error('यह फ़ाइल PDF नहीं है। (Not a PDF.)');
    }

    var bytes = blob.getBytes();
    if (bytes.length > 90 * 1024 * 1024) {
      throw new Error('PDF ' + mb(bytes.length) + ' MB का है — GitHub की सीमा 100 MB है।');
    }

    // Tidy name in the Drive archive so the folder stays browsable.
    try { file.setName('Jantarang-Pathdoot-' + dateStr + '.pdf'); } catch (e) {}

    var manifest = readManifest();
    var existed = manifest.some(function (e) { return e.date === dateStr; });

    var path = CONFIG.PDF_DIR + '/' + dateStr + '.pdf';
    putFile(path, Utilities.base64Encode(bytes),
            'ePaper: ' + dateStr + (existed ? ' (replaced)' : ''));

    // Rebuild the manifest with this edition at the right place.
    manifest = manifest.filter(function (e) { return e.date !== dateStr; });
    manifest.push({
      date    : dateStr,
      file    : path,
      size    : bytes.length,
      driveId : fileId,
      added   : new Date().toISOString()
    });
    manifest.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    writeManifest(manifest);

    // Tell the timed sync this file is already handled.
    var processed = readProcessed();
    processed[fileId] = dateStr;
    writeProcessed(processed, manifest);

    return {
      ok      : true,
      date    : dateStr,
      size    : bytes.length,
      replaced: existed,
      siteUrl : 'https://' + CONFIG.GITHUB_OWNER + '.github.io/',
      editions: manifest.slice(0, 12).map(function (e) { return { date: e.date, size: e.size || 0 }; })
    };

  } finally {
    lock.releaseLock();
  }
}

/**
 * Fallback path for browsers where the direct-to-Drive upload is blocked:
 * the file comes through Apps Script as base64 instead. Fine for small PDFs.
 */
function publishFromBase64(b64, filename, dateStr) {
  assertDate(dateStr);

  var bytes = Utilities.base64Decode(b64);
  var blob  = Utilities.newBlob(bytes, 'application/pdf',
                                'Jantarang-Pathdoot-' + dateStr + '.pdf');

  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  var file   = folder.createFile(blob);

  return publishFromDrive(file.getId(), dateStr);
}

/** Removes an edition from the site. The Drive copy is left untouched. */
function unpublish(dateStr) {
  assertDate(dateStr);

  var manifest = readManifest();
  var entry = null;
  manifest.forEach(function (e) { if (e.date === dateStr) entry = e; });
  if (!entry) throw new Error('यह अंक सूची में नहीं मिला। (Edition not in the manifest.)');

  deleteFile(entry.file, 'Remove ePaper ' + dateStr + ' from the site');

  manifest = manifest.filter(function (e) { return e.date !== dateStr; });
  writeManifest(manifest);

  return {
    ok      : true,
    date    : dateStr,
    editions: manifest.slice(0, 12).map(function (e) { return { date: e.date, size: e.size || 0 }; })
  };
}

/* ================== HELPERS ================== */

function assertDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) {
    throw new Error('तिथि सही नहीं है। (Date must be YYYY-MM-DD.)');
  }
  var parts = String(d).split('-').map(Number);
  var dt = new Date(parts[0], parts[1] - 1, parts[2]);
  if (dt.getFullYear() !== parts[0] || dt.getMonth() !== parts[1] - 1 || dt.getDate() !== parts[2]) {
    throw new Error('ऐसी कोई तिथि नहीं है। (Not a real date.)');
  }
}
