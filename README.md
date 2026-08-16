# Cyber Detective Files — Case Portal
### A TryHackMe/HackTheBox-style companion site for the CDFU printable case files

This document explains the whole project: architecture, how to run it, the
database, the API, and what's still simplified. Two companion docs cover the
day-to-day parts in more depth:

- **`docs/ADMIN.md`** — how to use the Admin Panel to manage investigators and cases.
- **`docs/ADD-CASES.md`** — how to add a new case from a PDF, from separate images, or from scratch.

---

## 1. What this is

A full website, styled to match your existing printable case files (manila
folders, rubber stamps, typewriter type, evidence-board aesthetic), where an
"investigator" can:

1. Sign up and get a Bureau **Badge ID**
2. Browse a catalog of **case files**
3. Open a case's **evidence folder** (sequential evidence-sheet pages, embedded in a reader)
4. Take a **quiz** graded on the server
5. Once the quiz is passed, unlock a **practical field exam**
6. Earn **Case Points (CP)**, climb the **Bureau Rankings** (leaderboard), and collect **Evidence Stamps** (badges)

It's backed by a real **Node.js/Express server + SQLite database** — not
browser `localStorage`. Accounts, points, solved cases, and badges persist
across reloads, browsers, and server restarts.

An **Admin Panel** (`/admin.html`) lets an administrator manage everything —
create/edit/lock/delete cases, edit quiz and field-exam questions, upload
evidence files, adjust investigator points, and grant/revoke admin access —
without touching any code.

---

## 2. Project structure

```
cdfu-case-portal/
├── server.js                 ← Express app entry point (run this)
├── package.json
├── cdfu.db                   ← SQLite database file (created automatically)
├── docs/
│   ├── ADMIN.md               ← How to use the Admin Panel
│   └── ADD-CASES.md           ← How to add a case from a PDF / images / scratch
├── scripts/
│   └── pdf-to-case.js         ← CLI: turns one PDF into a full evidence folder + DB case
├── src/
│   ├── db.js                  ← Opens the SQLite DB, creates/migrates tables on boot
│   ├── auth-utils.js          ← Password hashing, session tokens, Badge ID generator
│   ├── cases-seed.js          ← ONE-TIME seed content (Case 001 + two locked stubs)
│   ├── cases-repo.js          ← Case/quiz/exam DB access — the real source of truth at runtime
│   ├── ranks-badges.js        ← Rank tiers + badge definitions/unlock logic
│   ├── users-repo.js          ← All user/progress database queries
│   ├── create-admin.js        ← CLI: create or promote an admin account
│   └── reset-db.js            ← `npm run reset-db` — wipes the DB for a clean demo
└── public/                    ← Everything the browser loads (static files)
    ├── index.html              ← Landing page
    ├── cases.html               ← Case catalog
    ├── case.html                ← Case briefing + quiz + field exam
    ├── reader.html               ← Evidence-folder viewer
    ├── leaderboard.html          ← Bureau Rankings
    ├── badges.html                ← Evidence Stamps gallery
    ├── profile.html                ← Investigator dossier
    ├── admin.html                  ← Admin Panel (cases + investigators)
    ├── login.html / signup.html
    ├── case-files/case-001/         ← Case 001's evidence sheets
    └── assets/
        ├── css/main.css              ← The whole design system
        └── js/
            ├── api.js                 ← fetch() wrapper for the backend
            ├── auth.js                ← signup/login/logout/session helpers
            ├── app.js                  ← shared navbar/rank rendering on every page
            ├── quiz.js                  ← case page, quiz, field exam rendering
            └── admin.js                  ← Admin Panel logic
```

**Key point:** case content (metadata, quiz questions, exam questions, and
their answer keys) now lives **in the database**, not in a static JS file.
`src/cases-seed.js` is read exactly once — the first time the server boots
against an empty `cases` table — to populate Case 001 and two locked
placeholder cases. After that first boot, editing `cases-seed.js` has no
effect; use the Admin Panel (or the admin API) instead.

---

## 3. How to run it

**Requirements:** Node.js **22.5 or newer** (uses the built-in `node:sqlite`
module — no separate database software to install).

```bash
cd cdfu-case-portal
npm install                # installs express, cors, multer
npm start                  # starts the server + seeds the database on first run
```

Open **http://localhost:3000**. One process serves both the website and the API.

Create your first admin account (see `docs/ADMIN.md` for details):
```bash
npm run create-admin -- --name "Your Name" --email you@example.com --password "at-least-6-chars"
```
Then log in and open `/admin.html`.

Other useful commands:
```bash
npm run reset-db                 # wipe all accounts/cases/progress, reseed on next start
npm run add-case-from-pdf -- ...  # turn a PDF into a new case (see docs/ADD-CASES.md)
PORT=4000 npm start               # run on a different port
```

---

## 4. The database (SQLite)

`cdfu.db` is created automatically on first run via Node's **built-in**
`node:sqlite` module (marked "experimental" by Node, but reliable in testing
here — no native compilation, no extra dependency like `better-sqlite3`).

### Schema (`src/db.js`)

**`users`** — `id, badge_id, name, email, password_hash, password_salt, points, is_admin, joined_at`
Passwords are salted + scrypt-hashed, never stored in plaintext.

**`sessions`** — `token (PK), user_id, created_at`
Sent by the browser as `Authorization: Bearer <token>` on every API call.

**`solved_cases`** — `user_id, case_id, score, total, perfect, solved_at`
**`exam_passes`** — `user_id, case_id, score, total, passed_at`
**`user_badges`** — `user_id, badge_id, earned_at`

**`cases`** — `id (PK), code, title, category, difficulty, points, page_count, folder, cover, briefing, objectives_json, locked, exam_title, exam_instructions, exam_pass_score, sort_order, created_at, updated_at`
The case catalog. Fully managed through the Admin Panel / admin API.

**`quiz_questions`** / **`exam_questions`** — `id (PK), case_id, position, question, options_json, answer_index`
One row per question. `answer_index` is the correct-option index — this is
the data that must never reach a non-admin API response.

Points, rank, and badge status are always **derived live** from these
tables (e.g. `COUNT(*)` on `solved_cases`), never duplicated, so there's no
risk of numbers drifting out of sync.

---

## 5. The API

All endpoints are prefixed `/api/`. Routes marked ✅ require
`Authorization: Bearer <token>`; routes marked 🛡️ additionally require the
user to be an admin (checked server-side, not just hidden in the UI).

### Public / player API
| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/api/auth/signup` | – | Create account |
| POST | `/api/auth/login` | – | Log in |
| POST | `/api/auth/logout` | ✅ | End session |
| GET | `/api/auth/me` | ✅ | Current user's live stats |
| GET | `/api/ranks` | – | The rank tiers |
| GET | `/api/badges` | optional | Badge list; `unlocked` flag if logged in |
| GET | `/api/cases` | optional | Case catalog (no quiz content) |
| GET | `/api/cases/:id` | optional | Full case incl. quiz/exam **questions only**, never answers |
| POST | `/api/cases/:id/quiz` | ✅ | Submit `{ answers: [...] }`, graded server-side |
| POST | `/api/cases/:id/exam` | ✅ | Submit exam answers (requires quiz passed first) |
| GET | `/api/leaderboard` | – | All users sorted by points |

### Admin API (see `docs/ADMIN.md` for the full guide)
| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/api/admin/stats` | 🛡️ | Overview numbers |
| GET | `/api/admin/users` | 🛡️ | List all investigators |
| PATCH | `/api/admin/users/:id` | 🛡️ | Adjust points / admin flag |
| DELETE | `/api/admin/users/:id` | 🛡️ | Delete an account |
| POST | `/api/admin/users/:id/reset-case/:caseId` | 🛡️ | Wipe one user's progress on one case |
| GET/POST/PUT/DELETE | `/api/admin/cases[/:id]` | 🛡️ | Full case CRUD, incl. answer keys |
| PUT | `/api/admin/cases/:id/quiz` | 🛡️ | Replace the quiz question set |
| PUT | `/api/admin/cases/:id/exam` | 🛡️ | Replace the field exam question set |
| GET/POST/DELETE | `/api/admin/cases/:id/files[/:filename]` | 🛡️ | List / upload / delete evidence files |

**Security notes on grading:** the server never trusts a client-claimed
score. Every submitted answer index is re-checked against the database
itself (`src/cases-repo.js`), so a submission can't fake `passed: true`, and
the answer key is never present in any non-admin API response — verified by
hand during testing.

---

## 6. The design system

The visual style is pulled from the original case-file CSS (manila folders,
stamps, dashed lines, the dark "desk" background), documented at the top of
`public/assets/css/main.css`:

- **Colors:** dark desk background, manila/paper surfaces, stamp-red for
  alerts, custody-blue for links, warm gold for points/rank/highlights.
- **Type:** `Special Elite` (typewriter) for headings/stamps, `Courier
  Prime` for body copy, `JetBrains Mono` for points/ranks/data, `Caveat` for
  handwritten-style accents.
- **Signature elements:** the rubber-stamp button (`.btn-stamp`), the folder
  card with a torn tab (`.folder-card`), corkboard-style evidence panels.

---

## 7. Ranks & badges (game design)

**6 Bureau Ranks** (`src/ranks-badges.js`): Recruit (0) → Rookie
Investigator (50) → Field Investigator (200) → Senior Investigator (450) →
Chief Inspector (800) → Bureau Legend (1400 CP).

**6 Evidence Stamps (badges):** First Blood (first case closed), Black
Login: Closed (Case 001 specifically), Field Certified (pass any field
exam), Clean Sheet (perfect quiz score, first attempt), Three-Piece File (3
cases closed), Veteran Desk (reach Senior Investigator+).

Badges re-evaluate automatically after every quiz/exam submission and every
admin points adjustment. Add a new one by adding an object with a
`check(summary)` function to `BADGES` in `src/ranks-badges.js`.

---

## 8. Case 001 content

The quiz (6 questions) and field exam (4 questions, needs 3/4 to pass) for
**Operation Black Login** were written directly from the case file's actual
content — the BEC/vendor-fraud scenario, the ~$86,400 loss, the compromised
IT contractor, the `meridian-systerns.com` typosquat domain, and the Finance
policy gap.

Cases 002 ("The Unlocked Door") and 003 ("Phantom Invoice") ship as
**locked/"Coming Soon"** placeholders. Add real cases via the Admin Panel or
the PDF importer — see `docs/ADD-CASES.md`.

---

## 9. What's still a prototype (read before going live)

- **Sessions never expire.** Tokens live in the `sessions` table until a
  user logs out. Add an `expires_at` column + check for production.
- **No rate limiting** on login/signup/quiz submission — worth adding
  `express-rate-limit`.
- **No email verification / password reset.**
- **CORS is wide open** (`app.use(cors())`) since frontend and backend share
  an origin here. Lock it down if you ever split them across domains.
- **`node:sqlite` is an experimental Node API.** Reliable in testing, but
  Node's own docs flag it as subject to change. The code isolates all SQLite
  access in `src/db.js`, so swapping in `better-sqlite3` later only touches
  that one file.
- **Single-file SQLite database.** Fine for a portfolio project or a small
  cohort; for real concurrent traffic at scale, move to Postgres/MySQL.
- **Evidence file uploads have no content-type/virus scanning.** Fine for a
  trusted admin uploading their own case material; don't expose the upload
  endpoint beyond people you trust.

---

## 10. Extending it

- **Add a new case:** use the Admin Panel (`docs/ADMIN.md`) or, if you have
  a source PDF, `npm run add-case-from-pdf` (`docs/ADD-CASES.md`). Nothing
  in the code needs to change.
- **Add a new badge:** add one object to `BADGES` in `src/ranks-badges.js`.
- **Change rank thresholds:** edit the `RANKS` array in the same file.
- **Change the passing bar for quizzes/exams:** quiz pass score is fixed at
  70% (`src/cases-repo.js`, `gradeQuiz`); field-exam pass score is
  per-case and set in the Admin Panel's case editor.

---

Everything above was verified working end-to-end before delivery: signup,
login, session persistence across a server restart, quiz/exam grading and
badge unlocking, the leaderboard, admin login and every admin route (case
CRUD, quiz/exam editing, file upload/delete, user points/admin
toggling/deletion, and the self-protection checks that stop an admin from
demoting or deleting their own account), the PDF-to-case importer end to
end against a real PDF, and confirming answer keys never appear in any
non-admin API response.
