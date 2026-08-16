#!/usr/bin/env node
// ==========================================================================
// CDFU CASE PORTAL — ADD A CASE FROM A PDF
//
// Turns a single PDF (or a folder of images) into a case's evidence-sheet
// pages and registers the case in the database, locked and with an empty
// quiz — ready for you to finish in the Admin Panel.
//
// Usage:
//   node scripts/pdf-to-case.js --pdf ./my-case.pdf --id case-004 \
//     --title "Phantom Invoice" --category "BEC / Invoice Fraud" \
//     --difficulty rookie --points 120
//
// Requires poppler-utils installed on the machine running this script
// (provides the `pdftoppm` command). See docs/ADD-CASES.md for install
// instructions per OS.
// ==========================================================================

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const db = require("../src/db");
const cases = require("../src/cases-repo");

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

function assertPoppler() {
  try {
    execFileSync("pdftoppm", ["-v"], { stdio: "ignore" });
  } catch {
    console.error(
      "Couldn't find `pdftoppm`. Install poppler-utils first — see docs/ADD-CASES.md for instructions."
    );
    process.exit(1);
  }
}

function evidencePageHTML({ caseTitle, pageLabel, imgFile, pageNum, totalPages }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${caseTitle} — ${pageLabel}</title>
<link href="../../assets/css/main.css" rel="stylesheet">
<style>
  body{ background:#5c564a; margin:0; padding:2rem 1rem; display:flex; flex-direction:column; align-items:center; }
  .sheet-frame{ max-width:820px; width:100%; }
  .sheet-frame img{ width:100%; display:block; box-shadow:0 12px 32px rgba(0,0,0,.5); border-radius:2px; }
  .sheet-label{ font-family:var(--font-data); color:#EDE6D4; font-size:12px; letter-spacing:.06em; text-transform:uppercase; margin-bottom:.6rem; opacity:.75; }
</style>
</head>
<body>
  <div class="sheet-frame">
    <div class="sheet-label">${caseTitle} — Sheet ${pageNum} of ${totalPages}</div>
    <img src="${imgFile}" alt="${pageLabel}">
  </div>
</body>
</html>
`;
}

function indexHTML({ caseTitle, totalPages }) {
  const rows = Array.from({ length: totalPages }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return `<li><a href="page-${n}.html">Page ${n}</a></li>`;
  }).join("\n      ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${caseTitle} — Table of Contents</title>
<link href="../../assets/css/main.css" rel="stylesheet">
</head>
<body style="background:#15130E; color:#EDE6D4; font-family:var(--font-body); padding:2rem;">
  <h1 style="font-family:var(--font-display);">${caseTitle}</h1>
  <p>${totalPages} evidence sheets.</p>
  <ol>
      ${rows}
  </ol>
</body>
</html>
`;
}

function main() {
  const args = parseArgs();
  const pdfPath = args.pdf;
  const id = args.id;

  if (!pdfPath || !id) {
    console.error(
      'Usage: node scripts/pdf-to-case.js --pdf ./my-case.pdf --id case-004 --title "..." [--category "..."] [--difficulty rookie|field|veteran] [--points 120]'
    );
    process.exit(1);
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    console.error("--id must be lowercase letters, numbers, and hyphens only (e.g. case-004).");
    process.exit(1);
  }
  if (!fs.existsSync(pdfPath)) {
    console.error(`No PDF found at ${pdfPath}`);
    process.exit(1);
  }

  assertPoppler();

  const title = args.title || id;
  const category = args.category || "General";
  const difficulty = args.difficulty || "rookie";
  const points = args.points ? Number(args.points) : 100;
  const dpi = args.dpi ? Number(args.dpi) : 150;

  const outDir = path.join(__dirname, "..", "public", "case-files", id);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Rasterizing ${pdfPath} at ${dpi} DPI...`);
  // Produces page-1.png, page-2.png, ... in outDir
  execFileSync("pdftoppm", ["-png", "-r", String(dpi), pdfPath, path.join(outDir, "page")], {
    stdio: "inherit",
  });

  // pdftoppm names files page-1.png, page-2.png, ... (or page-01.png if >=10
  // pages on some poppler versions). Normalize everything to page-XX.png /
  // page-XX.html with zero-padded two-digit numbers.
  const rawPngs = fs
    .readdirSync(outDir)
    .filter((f) => /^page-\d+\.png$/.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)[0]);
      const nb = Number(b.match(/\d+/)[0]);
      return na - nb;
    });

  if (rawPngs.length === 0) {
    console.error("pdftoppm produced no pages — is the PDF valid?");
    process.exit(1);
  }

  rawPngs.forEach((f, i) => {
    const num = String(i + 1).padStart(2, "0");
    const target = `page-${num}.png`;
    if (f !== target) fs.renameSync(path.join(outDir, f), path.join(outDir, target));
  });

  const totalPages = rawPngs.length;

  for (let i = 1; i <= totalPages; i++) {
    const num = String(i).padStart(2, "0");
    const html = evidencePageHTML({
      caseTitle: title,
      pageLabel: `Page ${num}`,
      imgFile: `page-${num}.png`,
      pageNum: i,
      totalPages,
    });
    fs.writeFileSync(path.join(outDir, `page-${num}.html`), html, "utf-8");
  }
  fs.writeFileSync(path.join(outDir, "index.html"), indexHTML({ caseTitle: title, totalPages }), "utf-8");

  const c = cases.upsertCaseMeta(id, {
    code: args.code || id.toUpperCase(),
    title,
    category,
    difficulty,
    points,
    pageCount: totalPages,
    folder: `case-files/${id}/`,
    cover: "index.html",
    briefing: args.briefing || `${title}. Evidence folder generated from PDF — edit this briefing in the Admin Panel.`,
    objectives: [],
    locked: true, // stays hidden from players until you finish it in the admin panel
  });

  console.log(`\nDone. Created ${totalPages} evidence sheets in public/case-files/${id}/`);
  console.log(`Case "${title}" (${id}) added to the database as LOCKED.`);
  console.log("Next: open /admin.html -> Cases -> edit this case to add the quiz, objectives, and unlock it.");
}

main();
