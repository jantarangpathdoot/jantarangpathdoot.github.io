/**
 * जनतरंग पथदूत — Google Form helper
 * -----------------------------------------------------------------
 * Neither Apps Script's FormApp nor the Forms REST API can create a
 * **file upload** question — there is no addFileUploadItem(). So this builds
 * everything around it (title, description, settings, and filing the form into
 * the right Drive folder) and leaves you one question to add by hand.
 *
 * Run createUploadForm() once, then follow the instructions it logs.
 *
 * You do not need a Form at all if you use the upload web app — this is just
 * the phone-friendly alternative.
 */

function createUploadForm() {
  var form = FormApp.create('जनतरंग पथदूत — ePaper अपलोड');

  form.setDescription(
    'आज का अंक PDF में अपलोड करें।\n\n' +
    'फ़ाइल का नाम तिथि के साथ रखें — जैसे 26-08-2026.pdf या 2026-08-26.pdf\n' +
    'नाम में तिथि न हो तो अपलोड की तारीख़ मान ली जाएगी।'
  );

  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);
  form.setAcceptingResponses(true);
  form.setShowLinkToRespondAgain(true);

  // File the form itself into the ePaper Drive folder so everything lives together.
  try {
    var file = DriveApp.getFileById(form.getId());
    DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID).addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  } catch (e) {
    Logger.log('Could not move the form into the Drive folder: ' + e);
  }

  var editUrl = form.getEditUrl();

  Logger.log(
    '\n=======================================================\n' +
    ' Form created. One question left to add by hand:\n' +
    '=======================================================\n\n' +
    ' 1. Open: ' + editUrl + '\n' +
    ' 2. Click "+" to add a question\n' +
    ' 3. Title it:  आज का ePaper (PDF)\n' +
    ' 4. Change the question type to "File upload"\n' +
    '    -> click Continue on the warning Google shows\n' +
    ' 5. Turn ON "Allow only specific file types" -> tick PDF\n' +
    ' 6. Maximum number of files: 1\n' +
    ' 7. Maximum file size: 100 MB\n' +
    ' 8. Mark the question Required\n\n' +
    ' Google creates a "... (File responses)" folder for the uploads.\n' +
    ' MOVE that folder into the ePaper folder:\n' +
    '   https://drive.google.com/drive/folders/' + CONFIG.DRIVE_FOLDER_ID + '\n' +
    ' The sync scans sub-folders, so anything dropped there is picked up.\n\n' +
    ' Then use the "Send" button to get the link you fill in daily.\n' +
    '=======================================================\n'
  );

  return { editUrl: editUrl, formId: form.getId() };
}

/**
 * After you have added the file-upload question, run this to hook the form up
 * for instant publishing instead of waiting for the 15-minute timer.
 */
function attachFormTrigger(formId) {
  if (!formId) throw new Error('formId चाहिए — createUploadForm() ने जो लौटाया था वही दें।');

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmit') ScriptApp.deleteTrigger(t);
  });

  var form = FormApp.openById(formId);
  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();

  Logger.log('Instant-publish trigger attached to: ' + form.getTitle());
  return true;
}
