// ==========================================================================
// CDFU CASE PORTAL — CASES DATA ACCESS (database-backed)
// This is now the single source of truth for the case catalog at runtime.
// The admin panel's case-management routes (see server.js) call straight
// into this file. Answer keys (answer_index) are stored here and are only
// ever returned by the admin-only "full" projections — public projections
// always strip them out before a response is built.
// ==========================================================================

const db = require("./db");
const { SEED_CASES } = require("./cases-seed");

function rowToCase(row) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    category: row.category,
    difficulty: row.difficulty,
    points: row.points,
    pageCount: row.page_count,
    folder: row.folder,
    cover: row.cover,
    briefing: row.briefing,
    objectives: JSON.parse(row.objectives_json || "[]"),
    locked: !!row.locked,
    practicalMeta: {
      title: row.exam_title,
      instructions: row.exam_instructions,
      passScore: row.exam_pass_score,
    },
    sortOrder: row.sort_order,
  };
}

function getQuizQuestions(caseId) {
  return db
    .prepare("SELECT * FROM quiz_questions WHERE case_id = ? ORDER BY position ASC, id ASC")
    .all(caseId)
    .map((r) => ({ q: r.question, options: JSON.parse(r.options_json), answer: r.answer_index }));
}

function getExamQuestions(caseId) {
  return db
    .prepare("SELECT * FROM exam_questions WHERE case_id = ? ORDER BY position ASC, id ASC")
    .all(caseId)
    .map((r) => ({ q: r.question, options: JSON.parse(r.options_json), answer: r.answer_index }));
}

function getCaseRow(id) {
  return db.prepare("SELECT * FROM cases WHERE id = ?").get(id);
}

// Full internal shape (includes answer keys) — admin use only.
function getCaseFull(id) {
  const row = getCaseRow(id);
  if (!row) return null;
  const c = rowToCase(row);
  c.quiz = getQuizQuestions(id);
  c.practical = { ...c.practicalMeta, questions: getExamQuestions(id) };
  return c;
}

function listCasesFull() {
  return db
    .prepare("SELECT * FROM cases ORDER BY sort_order ASC, id ASC")
    .all()
    .map((row) => getCaseFull(row.id));
}

// Public projection: no answer keys. includeQuiz=true also strips them from
// the quiz/practical question lists (keeps only `q` and `options`).
function toPublic(c, { includeQuiz = false } = {}) {
  const base = {
    id: c.id,
    code: c.code,
    title: c.title,
    category: c.category,
    difficulty: c.difficulty,
    points: c.points,
    pageCount: c.pageCount,
    folder: c.folder,
    cover: c.cover,
    briefing: c.briefing,
    objectives: c.objectives,
    locked: c.locked,
  };
  if (!includeQuiz) return base;
  return {
    ...base,
    quiz: c.quiz.map((q) => ({ q: q.q, options: q.options })),
    practical: {
      title: c.practical.title,
      instructions: c.practical.instructions,
      passScore: c.practical.passScore,
      questions: c.practical.questions.map((q) => ({ q: q.q, options: q.options })),
    },
  };
}

function listCasesPublic() {
  return listCasesFull().map((c) => toPublic(c));
}

function getCasePublic(id, { includeQuiz = false } = {}) {
  const c = getCaseFull(id);
  if (!c) return null;
  return toPublic(c, { includeQuiz });
}

// --------------------------------------------------------------------------
// Admin: create / update / delete
// --------------------------------------------------------------------------

function upsertCaseMeta(id, fields) {
  const existing = getCaseRow(id);
  const now = new Date().toISOString();
  const merged = {
    code: fields.code ?? existing?.code ?? id.toUpperCase(),
    title: fields.title ?? existing?.title ?? "Untitled Case",
    category: fields.category ?? existing?.category ?? "General",
    difficulty: fields.difficulty ?? existing?.difficulty ?? "rookie",
    points: fields.points ?? existing?.points ?? 100,
    page_count: fields.pageCount ?? existing?.page_count ?? 0,
    folder: fields.folder ?? existing?.folder ?? `case-files/${id}/`,
    cover: fields.cover ?? existing?.cover ?? "index.html",
    briefing: fields.briefing ?? existing?.briefing ?? "",
    objectives_json: JSON.stringify(fields.objectives ?? (existing ? JSON.parse(existing.objectives_json) : [])),
    locked: (fields.locked ?? (existing ? !!existing.locked : true)) ? 1 : 0,
    exam_title: fields.examTitle ?? existing?.exam_title ?? "",
    exam_instructions: fields.examInstructions ?? existing?.exam_instructions ?? "",
    exam_pass_score: fields.examPassScore ?? existing?.exam_pass_score ?? 0,
    sort_order: fields.sortOrder ?? existing?.sort_order ?? 0,
  };

  if (existing) {
    db.prepare(
      `UPDATE cases SET code=?, title=?, category=?, difficulty=?, points=?, page_count=?,
       folder=?, cover=?, briefing=?, objectives_json=?, locked=?, exam_title=?,
       exam_instructions=?, exam_pass_score=?, sort_order=?, updated_at=?
       WHERE id=?`
    ).run(
      merged.code, merged.title, merged.category, merged.difficulty, merged.points,
      merged.page_count, merged.folder, merged.cover, merged.briefing, merged.objectives_json,
      merged.locked, merged.exam_title, merged.exam_instructions, merged.exam_pass_score,
      merged.sort_order, now, id
    );
  } else {
    db.prepare(
      `INSERT INTO cases (id, code, title, category, difficulty, points, page_count, folder,
       cover, briefing, objectives_json, locked, exam_title, exam_instructions, exam_pass_score,
       sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, merged.code, merged.title, merged.category, merged.difficulty, merged.points,
      merged.page_count, merged.folder, merged.cover, merged.briefing, merged.objectives_json,
      merged.locked, merged.exam_title, merged.exam_instructions, merged.exam_pass_score,
      merged.sort_order, now, now
    );
  }
  return getCaseFull(id);
}

function deleteCase(id) {
  db.prepare("DELETE FROM cases WHERE id = ?").run(id); // cascades to quiz/exam questions
}

function replaceQuizQuestions(caseId, questions) {
  db.prepare("DELETE FROM quiz_questions WHERE case_id = ?").run(caseId);
  const insert = db.prepare(
    "INSERT INTO quiz_questions (case_id, position, question, options_json, answer_index) VALUES (?, ?, ?, ?, ?)"
  );
  questions.forEach((q, i) => {
    insert.run(caseId, i, q.q, JSON.stringify(q.options), Number(q.answer));
  });
}

function replaceExamQuestions(caseId, questions) {
  db.prepare("DELETE FROM exam_questions WHERE case_id = ?").run(caseId);
  const insert = db.prepare(
    "INSERT INTO exam_questions (case_id, position, question, options_json, answer_index) VALUES (?, ?, ?, ?, ?)"
  );
  questions.forEach((q, i) => {
    insert.run(caseId, i, q.q, JSON.stringify(q.options), Number(q.answer));
  });
}

// --------------------------------------------------------------------------
// Grading — always against the DB-stored answer key, never client-supplied.
// --------------------------------------------------------------------------

function gradeQuiz(caseId, answers) {
  const quiz = getQuizQuestions(caseId);
  let correct = 0;
  quiz.forEach((q, i) => {
    if (Number(answers[i]) === q.answer) correct++;
  });
  const total = quiz.length;
  const passScore = Math.ceil(total * 0.7);
  return { correct, total, passScore, passed: correct >= passScore, perfect: correct === total };
}

function gradeExam(caseId, answers) {
  const c = getCaseFull(caseId);
  const questions = c.practical.questions;
  let correct = 0;
  questions.forEach((q, i) => {
    if (Number(answers[i]) === q.answer) correct++;
  });
  const total = questions.length;
  const passScore = c.practical.passScore || Math.ceil(total * 0.75);
  return { correct, total, passScore, passed: correct >= passScore };
}

// --------------------------------------------------------------------------
// One-time seed on first boot
// --------------------------------------------------------------------------

function seedIfEmpty() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM cases").get().n;
  if (count > 0) return;

  SEED_CASES.forEach((c, i) => {
    upsertCaseMeta(c.id, {
      code: c.code,
      title: c.title,
      category: c.category,
      difficulty: c.difficulty,
      points: c.points,
      pageCount: c.pageCount,
      folder: c.folder,
      cover: c.cover,
      briefing: c.briefing,
      objectives: c.objectives,
      locked: c.locked,
      examTitle: c.practical.title,
      examInstructions: c.practical.instructions,
      examPassScore: c.practical.passScore,
      sortOrder: i,
    });
    if (c.quiz && c.quiz.length) replaceQuizQuestions(c.id, c.quiz);
    if (c.practical && c.practical.questions && c.practical.questions.length) {
      replaceExamQuestions(c.id, c.practical.questions);
    }
  });
  console.log(`Seeded ${SEED_CASES.length} case(s) into the database.`);
}

module.exports = {
  listCasesFull,
  listCasesPublic,
  getCaseFull,
  getCasePublic,
  toPublic,
  upsertCaseMeta,
  deleteCase,
  replaceQuizQuestions,
  replaceExamQuestions,
  gradeQuiz,
  gradeExam,
  seedIfEmpty,
};
