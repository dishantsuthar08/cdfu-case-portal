# Adding Cases — from a PDF, images, or scratch

You have three ways to add a new case, from least to most manual effort.
Pick based on what your source material looks like.

| Your source material | Best method |
|---|---|
| One PDF with all evidence sheets inside it | **Method 1 — the PDF importer script** |
| A folder of separate images (JPG/PNG) or separate PDFs, one per sheet | **Method 2 — manual evidence pages** |
| Nothing yet — writing a case from scratch in the Admin Panel | **Method 3 — Admin Panel only** |

All three end up in the same place: a row in the `cases` table, quiz/exam
questions in their tables, and a folder of page files under
`public/case-files/<id>/`.

---

## Method 1 — I have a single PDF with the whole case in it

This is the fastest path if your case (like the original `Operation Black
Login` file) exists as one PDF with each evidence sheet on its own page.

### One-time setup: install poppler

The importer uses `pdftoppm`, part of the free **poppler-utils** package,
to turn each PDF page into an image.

- **macOS:** `brew install poppler`
- **Ubuntu / Debian:** `sudo apt-get install poppler-utils`
- **Windows:** install poppler via [this build](https://github.com/oschwartz10612/poppler-windows/releases) and add its `bin/` folder to your PATH, or use WSL and the Ubuntu instructions above.

Check it worked:
```bash
pdftoppm -v
```

### Run the importer

```bash
npm run add-case-from-pdf -- \
  --pdf ./my-case.pdf \
  --id case-004 \
  --title "Phantom Invoice" \
  --category "BEC / Invoice Fraud" \
  --difficulty rookie \
  --points 120
```

| Flag | Required? | Notes |
|---|---|---|
| `--pdf` | yes | Path to the PDF file |
| `--id` | yes | URL-safe slug, lowercase + hyphens, e.g. `case-004` |
| `--title` | no | Defaults to the id if omitted |
| `--category` | no | Defaults to "General" |
| `--difficulty` | no | `rookie` \| `field` \| `veteran` — default `rookie` |
| `--points` | no | Default `100` |
| `--code` | no | Cosmetic folder-tab code, defaults to the id in caps |
| `--briefing` | no | Short case summary text |
| `--dpi` | no | Image quality, default `150` (bump to `200`–`300` for very text-dense sheets) |

### What it does, step by step

1. Rasterizes every PDF page to a PNG image at `public/case-files/<id>/page-01.png`, `page-02.png`, …
2. Wraps each image in a `page-XX.html` file styled to match the portal's
   dark "evidence desk" look (same design tokens as `assets/css/main.css`),
   so it looks consistent with hand-built case files even though it's just a
   photo of a PDF page.
3. Generates a simple `index.html` table of contents linking every page.
4. Inserts (or updates) the case's row in the database — **locked**, with
   an empty quiz — so nobody can see it yet.

### Finish it in the Admin Panel

The script only handles the *evidence folder*. Open `/admin.html` → **Cases**
→ find your new case → **Edit**, and:
1. Fix the Title/Category/Briefing/Objectives if you used the quick CLI
   defaults.
2. Add the **Case Quiz** questions (see "Writing good quiz questions" below).
3. Add the **Field Exam** title, instructions, pass score, and questions.
4. Set **Locked** to **Active** when you're ready for it to go live.

### If your "single PDF" actually contains several unrelated cases

Split it first, then run the importer once per case. The quickest way,
also using poppler (installed above):

```bash
# Extract pages 1-18 of a combined PDF into their own file
pdfseparate -f 1 -l 18 combined.pdf case-a-%02d.pdf
pdfunite case-a-*.pdf case-a.pdf
rm case-a-*.pdf

# repeat with -f 19 -l 34 (etc.) for the next case
```
Then run `npm run add-case-from-pdf` on each resulting file.

---

## Method 2 — I have separate images or per-sheet PDFs, not one combined PDF

If your evidence sheets already exist as individual files (scans, photos,
exported slides), you don't need the PDF importer at all — the Admin Panel's
upload feature handles this directly.

1. In `/admin.html` → **Cases** → **+ New Case**, fill in the metadata and
   create the case (it starts Locked, which is fine).
2. Rename your files to the pattern the reader expects:
   `page-01.html`, `page-02.html`, … and an `index.html` as the table of
   contents. If you only have images (no HTML), wrap each one — see the
   minimal template below.
3. Open the case's editor → **Evidence Files** → select all your prepared
   files → **Upload**. They land directly in
   `public/case-files/<id>/`.
4. Add quiz/exam questions, then set the case to Active.

### Minimal page template (if you're wrapping a single image by hand)

Save this as `page-01.html` (repeat per page, changing the image filename
and page numbers) — it reuses the portal's own stylesheet so it matches the
rest of the site:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Case Title — Page 01</title>
<link href="../../assets/css/main.css" rel="stylesheet">
<style>
  body{ background:#5c564a; margin:0; padding:2rem 1rem; display:flex; justify-content:center; }
  .sheet-frame{ max-width:820px; width:100%; }
  .sheet-frame img{ width:100%; display:block; box-shadow:0 12px 32px rgba(0,0,0,.5); }
</style>
</head>
<body>
  <div class="sheet-frame">
    <img src="page-01.png" alt="Page 01">
  </div>
</body>
</html>
```

If a sheet is a PDF rather than an image, convert just that one file with
`pdftoppm -png -r 150 sheet.pdf page-01` (produces `page-01-1.png` — rename
to `page-01.png`) and use the template above.

---

## Method 3 — writing a case from scratch, no source file at all

Just use the Admin Panel directly:

1. `/admin.html` → **Cases** → **+ New Case** → fill in metadata → **Create Case**.
2. Add quiz and field exam questions in the editors that appear.
3. For the evidence folder itself, either:
   - Write plain HTML pages by hand (any styling you like — they don't have
     to use the portal's template) and upload them via **Evidence Files**, or
   - Skip a rich evidence folder for now and just point **Cover** at a
     single simple page — you can always add more sheets later, the page
     count field isn't load-bearing beyond display.
4. Set **Locked** to **Active** when ready.

---

## Writing good quiz questions

A quick checklist, since this is the part that's easy to get wrong:

- **Every question needs a single unambiguous correct answer** that's
  actually findable in the evidence folder — investigators shouldn't need
  outside knowledge or guesswork.
- **Wrong options should be plausible**, not jokes — e.g. other real names,
  amounts, or dates that appear elsewhere in the file, so someone who didn't
  read closely can't just eliminate the silly-sounding ones.
- **The quiz tests reading comprehension; the field exam tests application.**
  Keep quiz questions close to "what does the file say" and save "classify
  this technique" / "what's the right verdict" style questions for the
  field exam.
- Passing score is automatic: **quiz** needs 70% correct, **field exam**
  needs whatever you set as Pass Score (defaults to 75% of the question
  count if left at 0).

---

## Where things end up (for reference)

| What | Where |
|---|---|
| Case metadata, quiz, exam | SQLite database (`cdfu.db`) — never edit this file by hand, use the Admin Panel or the API |
| Evidence sheet files | `public/case-files/<id>/` on disk |
| Case-portal-wide styling all evidence pages should reuse | `public/assets/css/main.css` |

See `README.md` for the full project architecture and `docs/ADMIN.md` for
everything else the Admin Panel can do.
