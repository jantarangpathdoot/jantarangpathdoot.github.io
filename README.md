# जनतरंग पथदूत — e-Paper

The daily e-paper for **Jantarang Pathdoot**, published automatically to GitHub Pages.

**Live site:** <https://jantarangpathdoot.github.io>

---

## How it works

```
Google Form  ──►  Google Drive  ──►  Apps Script (every 15 min)  ──►  this repo  ──►  GitHub Pages
  upload PDF       full archive        pushes PDF + manifest           epapers/        live site
                   (kept forever)      prunes >30 days old         data/editions.json
```

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
data/editions.json      Manifest — written by the sync script
epapers/                Published PDFs (last 30 days only)
apps-script/Code.gs     Drive ➜ GitHub sync job
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

- No build step and no dependencies — plain HTML/CSS/JS. Open `index.html` over
  any static server to preview locally (`python -m http.server 8000`).
- PDF.js 3.11.174 loads from cdnjs; the viewer uses HTTP range requests, so
  thumbnails only fetch the first few KB of each PDF rather than the whole file.
- GitHub's limits: 100 MB per file, and Pages is happiest under ~1 GB per repo.
  The 30-day window keeps the repo comfortably small.
