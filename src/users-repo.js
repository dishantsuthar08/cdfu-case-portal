// ==========================================================================
// CDFU CASE PORTAL — USERS / PROGRESS DATA ACCESS
// Thin wrapper around the SQLite tables so server.js stays route-focused.
// ==========================================================================

const db = require("./db");
const { computeBadges } = require("./ranks-badges");

function findUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
}

function findUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function findUserByToken(token) {
  return db
    .prepare(
      `SELECT users.* FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ?`
    )
    .get(token);
}

function createUser({ badgeId, name, email, hash, salt }) {
  const info = db
    .prepare(
      `INSERT INTO users (badge_id, name, email, password_hash, password_salt)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(badgeId, name, email.toLowerCase(), hash, salt);
  return findUserById(Number(info.lastInsertRowid));
}

function createSession(userId, token) {
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, userId);
}

function deleteSession(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function getProgressSummary(userId) {
  const points = db.prepare("SELECT points FROM users WHERE id = ?").get(userId)?.points || 0;
  const solvedCases = db
    .prepare("SELECT case_id FROM solved_cases WHERE user_id = ?")
    .all(userId)
    .map((r) => r.case_id);
  const examsPassed = db
    .prepare("SELECT case_id FROM exam_passes WHERE user_id = ?")
    .all(userId)
    .map((r) => r.case_id);
  const perfectQuizzes = db
    .prepare("SELECT case_id FROM solved_cases WHERE user_id = ? AND perfect = 1")
    .all(userId)
    .map((r) => r.case_id);
  return { points, solvedCases, examsPassed, perfectQuizzes };
}

function getBadgeIds(userId) {
  return db
    .prepare("SELECT badge_id FROM user_badges WHERE user_id = ?")
    .all(userId)
    .map((r) => r.badge_id);
}

// Re-derives badge unlocks from current progress and stores any newly earned
// ones. Returns the list of badge ids that were newly earned this call.
function syncBadges(userId) {
  const summary = getProgressSummary(userId);
  const before = new Set(getBadgeIds(userId));
  const now = computeBadges(summary);
  const fresh = now.filter((id) => !before.has(id));
  const insert = db.prepare(
    "INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)"
  );
  for (const badgeId of fresh) insert.run(userId, badgeId);
  return fresh;
}

function recordQuizResult(userId, caseId, { correct, total, passed, perfect, pointsToAward }) {
  const already = db
    .prepare("SELECT 1 FROM solved_cases WHERE user_id = ? AND case_id = ?")
    .get(userId, caseId);
  if (passed && !already) {
    db.prepare(
      `INSERT INTO solved_cases (user_id, case_id, score, total, perfect)
       VALUES (?, ?, ?, ?, ?)`
    ).run(userId, caseId, correct, total, perfect ? 1 : 0);
    db.prepare("UPDATE users SET points = points + ? WHERE id = ?").run(pointsToAward, userId);
  }
  return syncBadges(userId);
}

function recordExamResult(userId, caseId, { correct, total, passed, pointsToAward }) {
  const already = db
    .prepare("SELECT 1 FROM exam_passes WHERE user_id = ? AND case_id = ?")
    .get(userId, caseId);
  if (passed && !already) {
    db.prepare(
      `INSERT INTO exam_passes (user_id, case_id, score, total)
       VALUES (?, ?, ?, ?)`
    ).run(userId, caseId, correct, total);
    db.prepare("UPDATE users SET points = points + ? WHERE id = ?").run(pointsToAward, userId);
  }
  return syncBadges(userId);
}

function leaderboard() {
  return db
    .prepare(
      `SELECT u.badge_id, u.name, u.points,
              (SELECT COUNT(*) FROM solved_cases sc WHERE sc.user_id = u.id) AS solved_count,
              (SELECT COUNT(*) FROM exam_passes ep WHERE ep.user_id = u.id) AS exam_count
       FROM users u
       ORDER BY u.points DESC, u.joined_at ASC`
    )
    .all();
}

function publicUser(user) {
  if (!user) return null;
  const summary = getProgressSummary(user.id);
  return {
    badgeId: user.badge_id,
    name: user.name,
    email: user.email,
    points: summary.points,
    solvedCases: summary.solvedCases,
    examsPassed: summary.examsPassed,
    perfectQuizzes: summary.perfectQuizzes,
    badges: getBadgeIds(user.id),
    joined: user.joined_at,
    isAdmin: !!user.is_admin,
  };
}

function listAllUsers() {
  return db.prepare("SELECT * FROM users ORDER BY points DESC, joined_at ASC").all();
}

function setAdmin(userId, isAdmin) {
  db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(isAdmin ? 1 : 0, userId);
}

function setPoints(userId, points) {
  db.prepare("UPDATE users SET points = ? WHERE id = ?").run(Math.max(0, Math.round(points)), userId);
}

function deleteUser(userId) {
  db.prepare("DELETE FROM users WHERE id = ?").run(userId); // cascades sessions/progress/badges
}

function resetCaseProgress(userId, caseId) {
  db.prepare("DELETE FROM solved_cases WHERE user_id = ? AND case_id = ?").run(userId, caseId);
  db.prepare("DELETE FROM exam_passes WHERE user_id = ? AND case_id = ?").run(userId, caseId);
}

module.exports = {
  findUserByEmail,
  findUserById,
  findUserByToken,
  createUser,
  createSession,
  deleteSession,
  getProgressSummary,
  getBadgeIds,
  syncBadges,
  recordQuizResult,
  recordExamResult,
  leaderboard,
  publicUser,
  listAllUsers,
  setAdmin,
  setPoints,
  deleteUser,
  resetCaseProgress,
};
