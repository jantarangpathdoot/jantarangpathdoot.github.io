# Setup — one time only

## Where things stand

| Piece | State |
|---|---|
| Live site | ✅ <https://jantarangpathdoot.github.io> |
| Apps Script project *Jantarang ePaper* | ✅ created, 5 files pushed |
| Upload page (web app) | ✅ deployed, private to your account |
| `GITHUB_TOKEN` script property | ⛔ **step 3 — you must add this** |
| Authorisation + 15-min trigger | ⛔ **step 4 — run `setUp()` once** |
| Google Form | optional — step 1 |

### Your links

**📤 Upload page** — bookmark this, it's the one you use daily:
<https://script.google.com/macros/s/AKfycbw90vPHy7v8UxILxZqZ4YWdPzN2wILxmuLNW1CrmaENwOFjSH8heYdZ2b-OnI1tNrGe7w/exec>

**⚙️ Script editor:**
<https://script.google.com/d/1xHnflg6zqeXUKpuO9K1g988KeQmcNyfNlrFq_QCDj5yL59w6hnCZKuQi/edit>

> Nothing publishes until steps 3 and 4 are done.

---

## 0. Rotate the secrets first ⚠️

The GitHub token and the Google OAuth client secret were shared in a chat
window, so treat both as public. Replace them before going live:

| Secret | Where to rotate |
|---|---|
| GitHub personal access token | <https://github.com/settings/tokens> → delete the old classic token → **Generate new token (classic)** |
| Google OAuth client secret | <https://console.cloud.google.com/apis/credentials> → project `e-paper-505213` → your OAuth client → **Reset secret** |

The new GitHub token needs **only** the `repo` scope. Nothing else.
The OAuth client is not used by this setup at all — Apps Script authorises
with your own Google account — so you can simply reset the secret and leave it unused.

**Never paste the token into `Code.gs`.** It goes in Script Properties (step 3).

---

## 1. Two ways to upload — pick either, or use both

**Route A — the upload page (recommended).** A private web page where you drag in
the PDF, confirm the date, and hit publish. Progress bar, replaces a wrong file,
removes an edition from the site in one click. Deployed in step 5.

**Route B — a Google Form.** Handy from a phone.

> **Why this one can't be fully automated:** a **file upload** question cannot be
> created by any API. Apps Script's `Form` class has 17 `add*Item()` methods and
> `addFileUploadItem()` is not among them, and the Forms REST API has the same
> gap. That one question has to be added by hand — everything around it is scripted.

In the script editor, run **`createUploadForm()`**. It creates the form, titles and
describes it in Hindi, files it into the ePaper Drive folder, and then logs the
exact clicks for the one remaining question (**View → Logs**):

- Add a question titled `आज का ePaper (PDF)`
- Set its type to **File upload** → **Continue** on Google's warning
- Allow only **PDF**, max **1 file**, max size **100 MB**, mark it **Required**
- Google creates a `… (File responses)` folder — **move it into the ePaper folder**

Then **Send** in the form gives you the link you fill in daily. Optionally run
`attachFormTrigger('<formId>')` to publish the instant you submit, instead of
waiting up to 15 minutes.

> Name the PDF with the date if you can — `26-08-2026.pdf` or `2026-08-26.pdf`.
> The script reads the date from the filename. If there's no date in the name it
> falls back to the upload date, which is fine for a same-day upload.

Both routes land in the same Drive folder and end up on the same site.

Drive folder in use: <https://drive.google.com/drive/folders/1-fZ1mgUNIcjjdwlTQuD0Sv1zwA7SMrqP>

---

## 2. The Apps Script project — already done ✅

Created and pushed with `clasp`. Four files are live in the project:

| File | What it does |
|---|---|
| `Code.gs` | timed Drive ➜ GitHub sync + 30-day retention |
| `UploadServer.gs` | upload page back end (publish / replace / unpublish) |
| `Upload.html` | upload page UI |
| `appsscript.json` | manifest — scopes, timezone, web app config |

> `UploadServer.gs` is named that, not `Upload.gs`, because Apps Script requires
> unique base names across file types and `Upload.html` already claims `Upload`.

To change the code later, edit the files in `apps-script/` and run
`npx clasp push` from the repo root, then
`npx clasp redeploy AKfycbw90vPHy7v8UxILxZqZ4YWdPzN2wILxmuLNW1CrmaENwOFjSH8heYdZ2b-OnI1tNrGe7w`
so the deployed URL picks up the change. Editing in the browser works too — run
`npx clasp pull` afterwards to bring changes back into the repo.

---

## 3. Add the GitHub token ⛔ you must do this

Open the [script editor](https://script.google.com/d/1xHnflg6zqeXUKpuO9K1g988KeQmcNyfNlrFq_QCDj5yL59w6hnCZKuQi/edit)
→ ⚙️ **Project Settings** → scroll to **Script properties** → **Add script property**

| Property | Value |
|---|---|
| `GITHUB_TOKEN` | your new `repo`-scoped token from step 0 |

Script properties are private to the project — the token never enters the repo,
and never reaches the browser. This is the only step I could not do for you:
there is no API for script properties.

---

## 4. Authorise and start it ⛔ you must do this

In the editor, pick the function **`setUp`** from the dropdown → **Run**.

Google will ask for permission (Drive, Forms, external requests). It will warn
"Google hasn't verified this app" — expected for your own script:
**Advanced** → **Go to Jantarang ePaper (unsafe)** → **Allow**.

`setUp` installs a trigger that runs every **15 minutes** and does one sync
immediately. Check **Executions** in the left sidebar to see it run.

Granting Drive access needs a human at a consent screen, so this one can't be
scripted either.

### Optional: publish the instant a form is submitted

**Triggers** (⏰ icon) → **Add trigger**
- Function: `onFormSubmit`
- Event source: **From form**
- Event type: **On form submit**

Keep the 15-minute timer as well — it's the safety net if a form trigger misfires.

---

## 5. The upload page — already deployed ✅

<https://script.google.com/macros/s/AKfycbw90vPHy7v8UxILxZqZ4YWdPzN2wILxmuLNW1CrmaENwOFjSH8heYdZ2b-OnI1tNrGe7w/exec>

Deployed as **Execute as: Me**, **Who has access: Only myself**. Bookmark it, or
add it to your phone's home screen.

> "Only myself" means the page opens only when you're signed in as
> `jantarangpathdoot@gmail.com`. Anyone else gets a Google sign-in wall. No GitHub
> token ever touches the browser — the push happens server-side in Apps Script.

The URL is stable: `clasp redeploy` on the same deployment id keeps it, so it
won't change when the code is updated.

### Using it

1. Open the web app URL.
2. Drag the PDF in (or click to browse). If the filename has a date in it, the
   date field fills itself — otherwise it defaults to today.
3. **प्रकाशित करें**. The bar tracks the Drive upload, then the GitHub push.
4. Under a minute later it's live.

The page also lists what's currently on the site, with a **हटाएँ** button that
pulls an edition off the site. That only touches GitHub — the Drive copy stays.

Uploading a second PDF for a date that already exists **replaces** it, which is
how you fix a wrong file.

---

## 6. How a normal day works

**Using the upload page:** open it, drop the PDF, publish. Live in about a minute.

**Using the Form:** submit the PDF. Within 15 minutes (or instantly if you added
the form trigger) the script pushes it to `epapers/YYYY-MM-DD.pdf`, updates
`data/editions.json`, and GitHub Pages redeploys.

Either way the new edition becomes the one shown at the top of
<https://jantarangpathdoot.github.io>.

---

## 7. Retention — 30 days on the site, forever in Drive

Every sync deletes editions older than **30 days** from GitHub and drops them
from the manifest. **Google Drive is never touched** — your full archive lives there.

Readers who want an older edition see a notice on the homepage asking them to
email **jantarangpathdoot@gmail.com**.

To change the window, edit `RETENTION_DAYS` in `CONFIG` at the top of `Code.gs`.

---

## 8. Editing the site text

| What | Where |
|---|---|
| Masthead, tagline | `index.html` → `.masthead` block |
| About Us copy | `index.html` → `<section id="about">` |
| Editor name, phone, address | `index.html` → `.contact` list (currently `—`) |
| Contact email | `index.html` — appears in the archive notice and the contact list |
| Colours, fonts | `assets/style.css` → `:root` variables |

Commit the change and GitHub Pages redeploys automatically.

---

## 9. Troubleshooting

| Symptom | Check |
|---|---|
| Nothing publishes | Apps Script → **Executions**. A red row shows the error. |
| `GITHUB_TOKEN … not set` | Step 3 — the property name is case-sensitive. |
| `401 Bad credentials` | Token expired or was revoked. Generate a new one, update the property. |
| `403` on write | Token is missing the `repo` scope. |
| Edition filed under the wrong date | Filename had no date, so upload date was used. Rename the file in Drive, then run `resetProcessedFiles()` followed by `syncDriveToGitHub()`. |
| Same PDF uploaded twice for one date | Second upload overwrites the first. That's intended — use it to publish corrections. |
| Want to force a full re-sync | Run `resetProcessedFiles()`, then `syncDriveToGitHub()`. |
| Upload page shows a blank screen | The HTML file must be named exactly `Upload` (Apps Script adds `.html` itself). |
| Upload page changes do not appear | You edited the script but did not re-deploy. Deploy → Manage deployments → edit → **New version**. |
| Upload sticks at "वैकल्पिक तरीके से…" | The direct-to-Drive upload was blocked, so it is routing through Apps Script. Works, but slower, and very large PDFs may fail — use the Form for those. |
