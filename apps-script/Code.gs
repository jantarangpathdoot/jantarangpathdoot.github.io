/**
 * जनतरंग पथदूत — Drive ➜ GitHub Pages sync
 * -----------------------------------------------------------------
 * WHAT IT DOES (runs on a timer, every 15 min):
 *   1. Scans the Drive folder (and its sub-folders, incl. the Google
 *      Form "File responses" folder) for new PDFs.
 *   2. Works out the edition date from the filename, else the upload date.
 *   3. Pushes each PDF into the GitHub repo at epapers/YYYY-MM-DD.pdf
 *   4. Rewrites data/editions.json so the site picks it up.
 *   5. Deletes editions older than RETENTION_DAYS from GitHub
 *      (Google Drive keeps the full archive — nothing is deleted there).
 *
 * ONE-TIME SETUP — see SETUP.md in the repo. Short version:
 *   Project Settings ➜ Script properties ➜ add  GITHUB_TOKEN = <your PAT>
 *   Then run  setUp()  once and authorise it.
 */

/* ================== CONFIG ================== */

var CONFIG = {
  DRIVE_FOLDER_ID : '1-fZ1mgUNIcjjdwlTQuD0Sv1zwA7SMrqP',
  GITHUB_OWNER    : 'jantarangpathdoot',
  GITHUB_REPO     : 'jantarangpathdoot.github.io',
  GITHUB_BRANCH   : 'main',

  PDF_DIR         : 'epapers',
  MANIFEST_PATH   : 'data/editions.json',

  RETENTION_DAYS  : 30,          // keep this many days of PDFs on GitHub
  MAX_PER_RUN     : 5,           // safety valve per execution
  TIMEZONE        : 'Asia/Kolkata',

  NOTIFY_EMAIL    : ''           // optional: email address for failure alerts
};

/* ================== ENTRY POINTS ================== */

/** Run ONCE by hand to authorise and install the 15-minute trigger. */
function setUp() {
  var token = props().getProperty('GITHUB_TOKEN');
  if (!token) {
    throw new Error(
      'GITHUB_TOKEN is not set.\n' +
      'Project Settings ➜ Script properties ➜ Add property\n' +
      '  Property: GITHUB_TOKEN   Value: <your GitHub personal access token>'
    );
  }

  // Remove any previous copies of our trigger so we never double-install.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncDriveToGitHub') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('syncDriveToGitHub').timeBased().everyMinutes(15).create();

  // Touch Drive + GitHub now so the consent screen covers both.
  DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID).getName();
  gh('GET', 'repos/' + CONFIG.GITHUB_OWNER + '/' + CONFIG.GITHUB_REPO, null, [200]);

  Logger.log('Setup complete. Trigger installed — syncing every 15 minutes.');
  syncDriveToGitHub();
}

/** Optional: attach to the Form's "on form submit" trigger for instant publishing. */
function onFormSubmit() {
  Utilities.sleep(4000);   // let Drive finish writing the upload
  syncDriveToGitHub();
}

/** The main job. Safe to run by hand at any time. */
function syncDriveToGitHub() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log('Another sync is already running — skipping this pass.');
    return;
  }

  try {
    var manifest  = readManifest();
    var byDate    = {};
    manifest.forEach(function (e) { byDate[e.date] = e; });

    var processed = readProcessed();
    var files     = collectPdfs(DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID), 0);

    // Oldest first, so a backlog publishes in chronological order.
    files.sort(function (a, b) { return a.created - b.created; });

    var added = 0, changed = false;

    for (var i = 0; i < files.length && added < CONFIG.MAX_PER_RUN; i++) {
      var f = files[i];
      if (processed[f.id]) continue;

      var date = editionDate(f.name, f.created);
      var path = CONFIG.PDF_DIR + '/' + date + '.pdf';

      try {
        var blob  = DriveApp.getFileById(f.id).getBlob();
        var bytes = blob.getBytes();

        if (bytes.length > 90 * 1024 * 1024) {
          throw new Error('PDF is ' + mb(bytes.length) + ' MB — over GitHub\'s 100 MB file limit.');
        }

        putFile(path, Utilities.base64Encode(bytes),
                'ePaper: ' + date + (byDate[date] ? ' (updated)' : ''));

        byDate[date] = {
          date     : date,
          file     : path,
          size     : bytes.length,
          driveId  : f.id,
          added    : new Date().toISOString()
        };

        processed[f.id] = date;
        added++; changed = true;
        Logger.log('Published ' + date + '  (' + mb(bytes.length) + ' MB, from "' + f.name + '")');

      } catch (err) {
        Logger.log('FAILED on "' + f.name + '": ' + err);
        alert('ePaper sync failed for "' + f.name + '"', String(err && err.stack || err));
      }
    }

    // ---- retention: drop anything older than RETENTION_DAYS from GitHub ----
    var cutoff = isoDate(new Date(Date.now() - CONFIG.RETENTION_DAYS * 86400000));
    var keep = [];

    Object.keys(byDate).forEach(function (d) {
      if (d < cutoff) {
        try {
          deleteFile(byDate[d].file, 'Retention: remove ePaper ' + d);
          Logger.log('Removed expired edition ' + d + ' from GitHub (still in Drive).');
          changed = true;
        } catch (err) {
          Logger.log('Could not delete ' + d + ': ' + err);
          keep.push(byDate[d]);          // keep listed so we retry next run
        }
      } else {
        keep.push(byDate[d]);
      }
    });

    keep.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

    if (changed) {
      writeManifest(keep);
      Logger.log('Manifest updated — ' + keep.length + ' edition(s) live.');
    } else {
      Logger.log('Nothing new. ' + keep.length + ' edition(s) live.');
    }

    writeProcessed(processed, keep);

  } finally {
    lock.releaseLock();
  }
}

/** Wipes the "already processed" memory, forcing a full re-sync on the next run. */
function resetProcessedFiles() {
  props().deleteProperty('PROCESSED');
  Logger.log('Processed-file memory cleared.');
}

/* ================== DRIVE ================== */

function collectPdfs(folder, depth) {
  var out = [];
  if (depth > 3) return out;                    // form-response folders are shallow

  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var name = f.getName();
    if (f.getMimeType() === 'application/pdf' || /\.pdf$/i.test(name)) {
      out.push({ id: f.getId(), name: name, created: f.getDateCreated().getTime() });
    }
  }

  var subs = folder.getFolders();
  while (subs.hasNext()) {
    out = out.concat(collectPdfs(subs.next(), depth + 1));
  }
  return out;
}

/**
 * Pull the edition date out of the filename; fall back to the upload date.
 * Understands 2026-08-26, 26-08-2026, 26.08.2026, 20260826, 26082026 …
 */
function editionDate(name, createdMs) {
  var s = name.replace(/\.pdf$/i, '');
  var m;

  if ((m = s.match(/(20\d{2})[-_.\/ ]?(\d{1,2})[-_.\/ ]?(\d{1,2})/))) {
    var d1 = mkDate(m[1], m[2], m[3]);
    if (d1) return d1;
  }
  if ((m = s.match(/(\d{1,2})[-_.\/ ]?(\d{1,2})[-_.\/ ]?(20\d{2})/))) {
    var d2 = mkDate(m[3], m[2], m[1]);
    if (d2) return d2;
  }
  return isoDate(new Date(createdMs));
}

function mkDate(y, mo, d) {
  y = Number(y); mo = Number(mo); d = Number(d);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  var dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return isoDate(dt);
}

function isoDate(dt) {
  return Utilities.formatDate(dt, CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

/* ================== GITHUB ================== */

function gh(method, endpoint, payload, okCodes) {
  var token = props().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN script property is not set.');

  var opts = {
    method            : method,
    muteHttpExceptions: true,
    headers: {
      Authorization         : 'Bearer ' + token,
      Accept                : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent'          : 'jantarang-epaper-sync'
    }
  };
  if (payload) {
    opts.contentType = 'application/json';
    opts.payload     = JSON.stringify(payload);
  }

  var res  = UrlFetchApp.fetch('https://api.github.com/' + endpoint, opts);
  var code = res.getResponseCode();
  var body = res.getContentText();

  if (okCodes.indexOf(code) === -1) {
    throw new Error('GitHub ' + method + ' ' + endpoint + ' → ' + code + ': ' + body.slice(0, 400));
  }
  return code === 404 ? null : (body ? JSON.parse(body) : null);
}

function contentsUrl(path) {
  return 'repos/' + CONFIG.GITHUB_OWNER + '/' + CONFIG.GITHUB_REPO + '/contents/' +
         path.split('/').map(encodeURIComponent).join('/');
}

function getSha(path) {
  var r = gh('GET', contentsUrl(path) + '?ref=' + CONFIG.GITHUB_BRANCH, null, [200, 404]);
  return r ? r.sha : null;
}

function putFile(path, base64Content, message) {
  var body = {
    message : message,
    content : base64Content,
    branch  : CONFIG.GITHUB_BRANCH
  };
  var sha = getSha(path);
  if (sha) body.sha = sha;
  return gh('PUT', contentsUrl(path), body, [200, 201]);
}

function deleteFile(path, message) {
  var sha = getSha(path);
  if (!sha) return;                              // already gone
  gh('DELETE', contentsUrl(path), { message: message, sha: sha, branch: CONFIG.GITHUB_BRANCH }, [200]);
}

function readManifest() {
  var r = gh('GET', contentsUrl(CONFIG.MANIFEST_PATH) + '?ref=' + CONFIG.GITHUB_BRANCH, null, [200, 404]);
  if (!r || !r.content) return [];
  try {
    var text = Utilities.newBlob(Utilities.base64Decode(r.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
    var json = JSON.parse(text);
    return Array.isArray(json) ? json : [];
  } catch (e) {
    Logger.log('Manifest unreadable, starting fresh: ' + e);
    return [];
  }
}

function writeManifest(list) {
  var json = JSON.stringify(list, null, 2);
  putFile(CONFIG.MANIFEST_PATH,
          Utilities.base64Encode(json, Utilities.Charset.UTF_8),
          'Update editions manifest (' + list.length + ' live)');
}

/* ================== STATE ================== */

function props() { return PropertiesService.getScriptProperties(); }

function readProcessed() {
  try { return JSON.parse(props().getProperty('PROCESSED') || '{}'); }
  catch (e) { return {}; }
}

/**
 * Keep the processed map from growing forever: retain entries for editions
 * still live, plus anything from the last 90 days, and drop the rest.
 */
function writeProcessed(map, liveList) {
  var live = {};
  liveList.forEach(function (e) { if (e.driveId) live[e.driveId] = true; });

  var floor = isoDate(new Date(Date.now() - 90 * 86400000));
  var slim  = {};
  Object.keys(map).forEach(function (id) {
    if (live[id] || map[id] >= floor) slim[id] = map[id];
  });

  props().setProperty('PROCESSED', JSON.stringify(slim));
}

/* ================== MISC ================== */

function mb(bytes) { return (bytes / 1048576).toFixed(1); }

function alert(subject, body) {
  if (!CONFIG.NOTIFY_EMAIL) return;
  try { MailApp.sendEmail(CONFIG.NOTIFY_EMAIL, subject, body); } catch (e) {}
}
