# Setup — one time only

The website is already live. This file is the checklist for wiring the
**Google Form ➜ Drive ➜ GitHub** automation, plus the security steps.

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

## 1. The Google Form

Create (or reuse) a Form with a single **File upload** question:

- Question: `आज का अंक (PDF अपलोड करें)`
- Type: **File upload** → allow **PDF only**, max **1 file**, size limit **100 MB**
- In the Form's settings, set the upload destination folder — Google creates a
  `… (File responses)` folder inside your Drive folder.

> Name the PDF with the date if you can — `26-08-2026.pdf` or `2026-08-26.pdf`.
> The script reads the date from the filename. If there's no date in the name it
> falls back to the upload date, which is fine for a same-day upload.

Drive folder in use: <https://drive.google.com/drive/folders/1-fZ1mgUNIcjjdwlTQuD0Sv1zwA7SMrqP>

---

## 2. Create the Apps Script project

1. Go to <https://script.google.com> → **New project** → name it `Jantarang ePaper Sync`.
2. Delete the sample code in `Code.gs`.
3. Paste the entire contents of [`apps-script/Code.gs`](apps-script/Code.gs).
4. ⚙️ **Project Settings** → tick **Show `appsscript.json` manifest file**, then
   open `appsscript.json` in the editor and replace it with
   [`apps-script/appsscript.json`](apps-script/appsscript.json).

---

## 3. Add the GitHub token

**Project Settings** → **Script properties** → **Add script property**

| Property | Value |
|---|---|
| `GITHUB_TOKEN` | your new `repo`-scoped token from step 0 |

Script properties are private to the project — the token never enters the repo.

---

## 4. Authorise and start it

In the editor, pick the function **`setUp`** from the dropdown → **Run**.

Google will ask for permission (Drive read + external requests). It will warn
"Google hasn't verified this app" — that's expected for your own script:
**Advanced** → **Go to Jantarang ePaper Sync (unsafe)** → **Allow**.

`setUp` installs a trigger that runs every **15 minutes** and does one sync
immediately. Check **Executions** in the left sidebar to see it run.

### Optional: publish the instant a form is submitted

**Triggers** (⏰ icon) → **Add trigger**
- Function: `onFormSubmit`
- Event source: **From form**
- Event type: **On form submit**

Keep the 15-minute timer as well — it's the safety net if a form trigger misfires.

---

## 5. How a normal day works

1. You submit the Form with today's PDF.
2. Within 15 minutes (or instantly with the form trigger), the script pushes it
   to `epapers/YYYY-MM-DD.pdf` and updates `data/editions.json`.
3. GitHub Pages redeploys — usually under a minute.
4. The new edition becomes the one shown at the top of
   <https://jantarangpathdoot.github.io>.

---

## 6. Retention — 30 days on the site, forever in Drive

Every sync deletes editions older than **30 days** from GitHub and drops them
from the manifest. **Google Drive is never touched** — your full archive lives there.

Readers who want an older edition see a notice on the homepage asking them to
email **jantarangpathdoot@gmail.com**.

To change the window, edit `RETENTION_DAYS` in `CONFIG` at the top of `Code.gs`.

---

## 7. Editing the site text

| What | Where |
|---|---|
| Masthead, tagline | `index.html` → `.masthead` block |
| About Us copy | `index.html` → `<section id="about">` |
| Editor name, phone, address | `index.html` → `.contact` list (currently `—`) |
| Contact email | `index.html` — appears in the archive notice and the contact list |
| Colours, fonts | `assets/style.css` → `:root` variables |

Commit the change and GitHub Pages redeploys automatically.

---

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| Nothing publishes | Apps Script → **Executions**. A red row shows the error. |
| `GITHUB_TOKEN … not set` | Step 3 — the property name is case-sensitive. |
| `401 Bad credentials` | Token expired or was revoked. Generate a new one, update the property. |
| `403` on write | Token is missing the `repo` scope. |
| Edition filed under the wrong date | Filename had no date, so upload date was used. Rename the file in Drive, then run `resetProcessedFiles()` followed by `syncDriveToGitHub()`. |
| Same PDF uploaded twice for one date | Second upload overwrites the first. That's intended — use it to publish corrections. |
| Want to force a full re-sync | Run `resetProcessedFiles()`, then `syncDriveToGitHub()`. |
