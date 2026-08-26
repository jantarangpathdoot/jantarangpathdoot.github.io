# जनतरंग पथदूत — e-Paper

The daily e-paper for **Jantarang Pathdoot**, published automatically to GitHub Pages.

**Live site:** <https://jantarangpathdoot.github.io>

---

## How it works

```
Upload page  ─┐
(drag & drop) │                                                    epapers/
              ├──►  Google Drive  ──►  Apps Script  ──►  this repo  ──►  GitHub Pages
Google Form  ─┘      full archive      push + prune   data/editions.json     live site
 (from phone)        (kept forever)     >30 days
```

Two ways in, both landing in the same Drive folder:

- **Upload page** — a private Apps Script web app. Drag the PDF in, confirm the
  date, publish; live in about a minute. Also replaces a wrong file and pulls an
  edition back off the site.
- **Google Form** — convenient from a phone; picked up within 15 minutes by the
  timed sync, or instantly with an on-submit trigger.

- The homepage always opens the **latest** edition in a PDF.js viewer.
- Below it, a grid of the **last 30 days** — first-page thumbnails rendered in the
  browser, click any card to read it.
- Older editions are removed from the site but kept in Drive; the homepage tells
  readers to email **jantarangpathdoot@gmail.com** to request one.

Setup instructions: **[SETUP.md](SETUP.md)**

---

## Repository layout

```
index.html              Homepage — viewer, archive grid, About Us
assets/style.css        Newspaper styling
assets/app.js           PDF.js viewer, archive grid, lazy thumbnails
assets/favicon.svg      Site icon
assets/fonts/           Poppins woff2 — self-hosted (devanagari + latin)
assets/pdfjs/           PDF.js 3.11.174 library + worker — self-hosted
data/editions.json      Manifest — written by the sync script
epapers/                Published PDFs (last 30 days only)
apps-script/Code.gs     Timed Drive ➜ GitHub sync + 30-day retention
apps-script/UploadServer.gs  Upload page back end (publish, replace, unpublish)
apps-script/Upload.html      Upload page UI
apps-script/FormSetup.gs     Google Form helper (createUploadForm)
apps-script/appsscript.json
.nojekyll               Serve files as-is, no Jekyll processing
```

## `data/editions.json`

Newest first. Written by the sync script — you rarely need to touch it.

```json
[
  {
    "date": "2026-08-26",
    "file": "epapers/2026-08-26.pdf",
    "size": 4823019,
    "driveId": "1AbC…",
    "added": "2026-08-26T04:12:00.000Z"
  }
]
```

## Publishing an edition manually

If Apps Script is down, drop the PDF into `epapers/` named `YYYY-MM-DD.pdf`,
add a matching entry at the top of `data/editions.json`, and commit. The site
picks it up on the next Pages build.

## Notes

- No build step and no dependencies — plain HTML/CSS/JS. Serve the folder with
  any static server to preview locally.
- **Zero third-party requests.** Fonts and PDF.js are self-hosted, so the page
  hits one origin. Both scripts are `defer`red and the two Devanagari faces are
  preloaded.
- The viewer uses HTTP range requests, so thumbnails fetch only the first few KB
  of each PDF. Thumbnails share a single PDF.js worker, render two at a time,
  and hold off until the main edition is on screen.
- GitHub's limits: 100 MB per file, and Pages is happiest under ~1 GB per repo.
  The 30-day window keeps the repo comfortably small.
