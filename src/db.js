// ==========================================================================
// CDFU CASE PORTAL — DATABASE LAYER
// Uses Node's built-in node:sqlite module (Node >= 22.5, currently
// experimental). No native build step, no extra dependency — the .db
// file is created automatically on first run at src/../cdfu.db.
// ==========================================================================

const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = path.join(__dirname, "..", "cdfu.db");
const db = new DatabaseSync(DB_PATH);

db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    badge_id      TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    points        INTEGER NOT NULL DEFAULT 0,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    joined_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS solved_cases (
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id   TEXT NOT NULL,
    score     INTEGER NOT NULL,
    total     INTEGER NOT NULL,
    perfect   INTEGER NOT NULL DEFAULT 0,
    solved_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, case_id)
  );

  CREATE TABLE IF NOT EXISTS exam_passes (
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id   TEXT NOT NULL,
    score     INTEGER NOT NULL,
    total     INTEGER NOT NULL,
    passed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, case_id)
  );

  CREATE TABLE IF NOT EXISTS user_badges (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id   TEXT NOT NULL,
    earned_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, badge_id)
  );

  -- Case catalog now lives in the database so the admin panel can create,
  -- edit, lock, and delete cases without touching any code.
  CREATE TABLE IF NOT EXISTS cases (
    id                 TEXT PRIMARY KEY,
    code               TEXT NOT NULL,
    title              TEXT NOT NULL,
    category           TEXT NOT NULL,
    difficulty         TEXT NOT NULL DEFAULT 'rookie',
    points             INTEGER NOT NULL DEFAULT 100,
    page_count         INTEGER NOT NULL DEFAULT 0,
    folder             TEXT,
    cover              TEXT DEFAULT 'index.html',
    briefing           TEXT NOT NULL DEFAULT '',
    objectives_json    TEXT NOT NULL DEFAULT '[]',
    locked             INTEGER NOT NULL DEFAULT 1,
    exam_title         TEXT NOT NULL DEFAULT '',
    exam_instructions  TEXT NOT NULL DEFAULT '',
    exam_pass_score    INTEGER NOT NULL DEFAULT 0,
    sort_order         INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quiz_questions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id       TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL DEFAULT 0,
    question      TEXT NOT NULL,
    options_json  TEXT NOT NULL,
    answer_index  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exam_questions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id       TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL DEFAULT 0,
    question      TEXT NOT NULL,
    options_json  TEXT NOT NULL,
    answer_index  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_solved_cases_user ON solved_cases(user_id);
  CREATE INDEX IF NOT EXISTS idx_exam_passes_user ON exam_passes(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
  CREATE INDEX IF NOT EXISTS idx_quiz_questions_case ON quiz_questions(case_id);
  CREATE INDEX IF NOT EXISTS idx_exam_questions_case ON exam_questions(case_id);
`);

// Best-effort migration for databases created by an earlier version of this
// project that predates the `is_admin` column. Safe to run on a fresh DB too
// (the duplicate-column error is simply swallowed).
try {
  db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;");
} catch {
  // column already exists — fine
}

module.exports = db;
