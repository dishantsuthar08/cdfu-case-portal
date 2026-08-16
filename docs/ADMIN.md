# Admin Panel Guide

This explains how to get admin access and how to manage investigators and
case files through `/admin.html` — no code editing required for day-to-day
operations.

---

## 1. Create your first admin account

There's no public "sign up as admin" button on purpose — admin access has to
be granted from the server itself. Two ways to do it:

### Option A — brand new admin account
```bash
npm run create-admin -- --name "Your Name" --email you@example.com --password "at-least-6-chars"
```

### Option B — promote an account you already signed up with
```bash
npm run create-admin -- --email you@example.com
```
(If that email already has a Bureau file, this just flips the `is_admin`
flag on it — the `--name`/`--password` flags are ignored.)

Then log in normally at `/login.html` and open **`/admin.html`**. Everyone
who isn't an admin sees an "Admin access only" message there — and every
admin API route rejects them server-side too, so this isn't just a hidden
button.

---

## 2. What's on the Admin Panel

`/admin.html` has two tabs: **Cases** and **Investigators**, plus a stat-card
row at the top (total investigators, admins, cases, active cases, total
cases closed, total exams passed across everyone).

### Cases tab

- **Table view** — every case, its difficulty, points, page count, and
  whether it's Active or Locked.
- **+ New Case** — opens a blank editor. Fill in:
  - **Case ID (slug)** — lowercase, hyphenated, e.g. `case-004`. This becomes
    part of the URL and the evidence-folder path. Can't be changed later
    (delete and recreate if you need to rename it).
  - **Case Code** — the cosmetic code shown on the folder tab, e.g.
    `CDF-2026-0004`.
  - Title, Category, Difficulty, Points, Page Count, Locked/Active.
  - **Evidence folder** — relative path where the page files live, normally
    `case-files/<id>/`. The panel fills this in for you.
  - **Cover** — which file is the table-of-contents page (`index.html` by
    default).
  - Briefing, Objectives (one per line), Field Exam title/instructions/pass
    score.
  - Click **Create Case** (or **Save Case Details** when editing).

- **Editing an existing case** reveals three more sections:
  - **Case Quiz** — add/remove multiple-choice questions inline. Each
    question needs 2+ options; click the radio next to the correct one, then
    **Save Quiz**. This overwrites the whole quiz with what's in the editor
    — that's intentional, so reordering/removing questions is simple, but it
    means always double-check the list before saving.
  - **Field Exam Questions** — same editor, same "Save Exam" pattern, for
    the practical exam that unlocks after the quiz is passed.
  - **Evidence Files** — see a list of files currently in the case's folder
    on disk, delete individual files, or upload new ones (drag in
    `page-01.html`, `page-01.png`, `index.html`, etc.). For turning an
    entire PDF into a full set of evidence pages in one step, use the
    `npm run add-case-from-pdf` command instead — see **`docs/ADD-CASES.md`**.
  - **Delete Case** — removes the case row (and its quiz/exam questions)
    from the database. It does **not** delete the evidence files on disk,
    so you can always re-create the case with the same id and folder to
    reattach them if you delete it by mistake.

- A case is only visible/playable to investigators once **Locked** is set to
  **Active**. New cases (and PDF-imported ones) start Locked on purpose, so
  you can build them out fully before anyone sees them.

### Investigators tab

- Table of every account: Badge ID, name/email, rank, **editable points**,
  cases closed, exams passed, and an **Admin** checkbox.
- **Points** — click into the number field, change it, click away (or tab
  out) to save. Useful for manual corrections, awarding bonus points, or
  fixing a mistake — ranks and the "Veteran Desk" badge recalculate
  automatically from whatever value you set.
- **Admin checkbox** — grant or revoke admin rights for anyone except
  yourself (you can't demote your own account from the panel — ask another
  admin, or run `npm run create-admin` again from the server for a
  different account).
- **Delete** — permanently removes the account and all of their progress
  (solved cases, exam passes, badges). This can't be undone.

---

## 3. Things the Admin Panel does *not* do (and why)

- **It doesn't expose quiz answer keys anywhere except this panel.** The
  public site never receives them — this is by design (see the security
  notes in the main `README.md`). Only logged-in admins can see or edit
  answers.
- **It doesn't let you build an entire multi-page evidence folder from
  scratch in the browser.** Uploading is fine for a handful of already-made
  files, but for turning a real PDF or a folder of images into a full set of
  styled evidence pages, use the conversion script described in
  `docs/ADD-CASES.md` — it's a five-minute command instead of dozens of
  individual uploads.
- **It doesn't manage server settings** (port, database location, etc.) —
  those are environment/config-level concerns, not per-case admin work. See
  the main `README.md`.

---

## 4. Quick reference — admin API routes

If you ever want to script something instead of clicking through the UI, all
of these require `Authorization: Bearer <admin's token>`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/stats` | Overview numbers |
| GET | `/api/admin/users` | List all investigators |
| PATCH | `/api/admin/users/:id` | `{ points }` and/or `{ isAdmin }` |
| DELETE | `/api/admin/users/:id` | Delete an account |
| POST | `/api/admin/users/:id/reset-case/:caseId` | Wipe one user's progress on one case |
| GET | `/api/admin/cases` | List all cases, full detail incl. answers |
| POST | `/api/admin/cases` | Create a case |
| PUT | `/api/admin/cases/:id` | Update case metadata |
| DELETE | `/api/admin/cases/:id` | Delete a case |
| PUT | `/api/admin/cases/:id/quiz` | Replace the quiz question set |
| PUT | `/api/admin/cases/:id/exam` | Replace the field exam question set |
| GET | `/api/admin/cases/:id/files` | List evidence files on disk |
| POST | `/api/admin/cases/:id/upload` | Upload files (multipart, field name `files`) |
| DELETE | `/api/admin/cases/:id/files/:filename` | Remove one evidence file |
