// ==========================================================================
// CDFU CASE PORTAL — SERVER ENTRY POINT
// Express + node:sqlite. Serves the static frontend from /public and the
// JSON API under /api (including /api/admin/*). Run with: npm start
// ==========================================================================

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const db = require("./src/db"); // ensures schema exists on boot
const { hashPassword, verifyPassword, makeToken, makeBadgeId } = require("./src/auth-utils");
const cases = require("./src/cases-repo");
const { RANKS, rankForPoints, BADGES } = require("./src/ranks-badges");
const users = require("./src/users-repo");

cases.seedIfEmpty();

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const CASE_FILES_DIR = path.join(PUBLIC_DIR, "case-files");

app.use(cors());
app.use(express.json());

// --------------------------------------------------------------------------
// Auth middleware
// --------------------------------------------------------------------------
function attachUser(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  req.dbUser = token ? users.findUserByToken(token) : null;
  req.token = token;
  next();
}

function requireAuth(req, res, next) {
  if (!req.dbUser) return res.status(401).json({ error: "Log in to do that." });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.dbUser) return res.status(401).json({ error: "Log in to do that." });
  if (!req.dbUser.is_admin) return res.status(403).json({ error: "Admin access only." });
  next();
}

app.use(attachUser);

// --------------------------------------------------------------------------
// Auth routes
// --------------------------------------------------------------------------
app.post("/api/auth/signup", (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required." });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: "A valid email is required." });
  if (!password || password.length < 6)
    return res.status(400).json({ error: "Password must be at least 6 characters." });

  if (users.findUserByEmail(email)) {
    return res.status(409).json({ error: "That email already has a Bureau file. Try logging in instead." });
  }

  const { hash, salt } = hashPassword(password);
  const badgeId = makeBadgeId(name);
  const user = users.createUser({ badgeId, name: name.trim(), email, hash, salt });

  const token = makeToken();
  users.createSession(user.id, token);

  res.status(201).json({ token, user: users.publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = email ? users.findUserByEmail(email) : null;
  if (!user || !verifyPassword(password || "", user.password_salt, user.password_hash)) {
    return res.status(401).json({ error: "No match on file for that email and password." });
  }
  const token = makeToken();
  users.createSession(user.id, token);
  res.json({ token, user: users.publicUser(user) });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  users.deleteSession(req.token);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: users.publicUser(req.dbUser) });
});

// --------------------------------------------------------------------------
// Reference data
// --------------------------------------------------------------------------
app.get("/api/ranks", (_req, res) => res.json({ ranks: RANKS }));

app.get("/api/badges", (req, res) => {
  const unlocked = req.dbUser ? new Set(users.getBadgeIds(req.dbUser.id)) : new Set();
  res.json({
    badges: BADGES.map((b) => ({
      id: b.id,
      name: b.name,
      desc: b.desc,
      unlocked: unlocked.has(b.id),
    })),
  });
});

// --------------------------------------------------------------------------
// Cases (public)
// --------------------------------------------------------------------------
app.get("/api/cases", (req, res) => {
  const solved = req.dbUser ? new Set(users.getProgressSummary(req.dbUser.id).solvedCases) : new Set();
  const exams = req.dbUser ? new Set(users.getProgressSummary(req.dbUser.id).examsPassed) : new Set();
  res.json({
    cases: cases.listCasesPublic().map((c) => ({
      ...c,
      solved: solved.has(c.id),
      examPassed: exams.has(c.id),
    })),
  });
});

app.get("/api/cases/:id", (req, res) => {
  const c = cases.getCaseFull(req.params.id);
  if (!c) return res.status(404).json({ error: "Case not found." });
  const summary = req.dbUser ? users.getProgressSummary(req.dbUser.id) : null;
  res.json({
    case: {
      ...cases.toPublic(c, { includeQuiz: true }),
      solved: summary ? summary.solvedCases.includes(c.id) : false,
      examPassed: summary ? summary.examsPassed.includes(c.id) : false,
    },
  });
});

app.post("/api/cases/:id/quiz", requireAuth, (req, res) => {
  const c = cases.getCaseFull(req.params.id);
  if (!c || c.locked) return res.status(404).json({ error: "Case not found." });

  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  if (answers.length !== c.quiz.length) {
    return res.status(400).json({ error: "Answer count doesn't match the quiz." });
  }

  const result = cases.gradeQuiz(c.id, answers);
  const wasAlreadySolved = users.getProgressSummary(req.dbUser.id).solvedCases.includes(c.id);

  const newBadgeIds = users.recordQuizResult(req.dbUser.id, c.id, {
    correct: result.correct,
    total: result.total,
    passed: result.passed,
    perfect: result.perfect && !wasAlreadySolved,
    pointsToAward: c.points,
  });

  res.json({
    ...result,
    alreadySolved: wasAlreadySolved,
    newBadges: newBadgeIds.map((id) => BADGES.find((b) => b.id === id)),
    user: users.publicUser(users.findUserById(req.dbUser.id)),
  });
});

app.post("/api/cases/:id/exam", requireAuth, (req, res) => {
  const c = cases.getCaseFull(req.params.id);
  if (!c || c.locked) return res.status(404).json({ error: "Case not found." });

  const summary = users.getProgressSummary(req.dbUser.id);
  if (!summary.solvedCases.includes(c.id)) {
    return res.status(403).json({ error: "Pass the case quiz before sitting the field exam." });
  }

  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  if (answers.length !== c.practical.questions.length) {
    return res.status(400).json({ error: "Answer count doesn't match the exam." });
  }

  const result = cases.gradeExam(c.id, answers);

  const newBadgeIds = users.recordExamResult(req.dbUser.id, c.id, {
    correct: result.correct,
    total: result.total,
    passed: result.passed,
    pointsToAward: Math.round(c.points * 0.5),
  });

  res.json({
    ...result,
    newBadges: newBadgeIds.map((id) => BADGES.find((b) => b.id === id)),
    user: users.publicUser(users.findUserById(req.dbUser.id)),
  });
});

// --------------------------------------------------------------------------
// Leaderboard
// --------------------------------------------------------------------------
app.get("/api/leaderboard", (_req, res) => {
  const rows = users.leaderboard().map((r) => {
    const rank = rankForPoints(r.points);
    return {
      badgeId: r.badge_id,
      name: r.name,
      points: r.points,
      rankName: rank.name,
      rankColor: rank.color,
      solvedCount: r.solved_count,
      examCount: r.exam_count,
    };
  });
  res.json({ leaderboard: rows });
});

// ==========================================================================
// ADMIN API — everything below requires requireAdmin
// ==========================================================================

// ---- Users -----------------------------------------------------------
app.get("/api/admin/users", requireAdmin, (_req, res) => {
  const rows = users.listAllUsers().map((u) => {
    const summary = users.getProgressSummary(u.id);
    const rank = rankForPoints(summary.points);
    return {
      id: u.id,
      badgeId: u.badge_id,
      name: u.name,
      email: u.email,
      points: summary.points,
      isAdmin: !!u.is_admin,
      rankName: rank.name,
      solvedCases: summary.solvedCases,
      examsPassed: summary.examsPassed,
      badges: users.getBadgeIds(u.id),
      joined: u.joined_at,
    };
  });
  res.json({ users: rows });
});

app.patch("/api/admin/users/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = users.findUserById(id);
  if (!target) return res.status(404).json({ error: "User not found." });

  if (typeof req.body?.points === "number") users.setPoints(id, req.body.points);
  if (typeof req.body?.isAdmin === "boolean") {
    if (id === req.dbUser.id && req.body.isAdmin === false) {
      return res.status(400).json({ error: "You can't remove your own admin access." });
    }
    users.setAdmin(id, req.body.isAdmin);
  }
  users.syncBadges(id);
  res.json({ ok: true });
});

app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.dbUser.id) return res.status(400).json({ error: "You can't delete your own account." });
  const target = users.findUserById(id);
  if (!target) return res.status(404).json({ error: "User not found." });
  users.deleteUser(id);
  res.json({ ok: true });
});

app.post("/api/admin/users/:id/reset-case/:caseId", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  users.resetCaseProgress(id, req.params.caseId);
  users.syncBadges(id);
  res.json({ ok: true });
});

// ---- Cases -------------------------------------------------------------
app.get("/api/admin/cases", requireAdmin, (_req, res) => {
  res.json({ cases: cases.listCasesFull() });
});

app.get("/api/admin/cases/:id", requireAdmin, (req, res) => {
  const c = cases.getCaseFull(req.params.id);
  if (!c) return res.status(404).json({ error: "Case not found." });
  res.json({ case: c });
});

app.post("/api/admin/cases", requireAdmin, (req, res) => {
  const id = (req.body?.id || "").trim();
  if (!/^[a-z0-9-]+$/.test(id)) {
    return res.status(400).json({ error: "Case id must be lowercase letters, numbers, and hyphens only (e.g. case-004)." });
  }
  if (cases.getCaseFull(id)) return res.status(409).json({ error: "A case with that id already exists." });

  const c = cases.upsertCaseMeta(id, req.body || {});
  fs.mkdirSync(path.join(CASE_FILES_DIR, id), { recursive: true });
  res.status(201).json({ case: c });
});

app.put("/api/admin/cases/:id", requireAdmin, (req, res) => {
  if (!cases.getCaseFull(req.params.id)) return res.status(404).json({ error: "Case not found." });
  const c = cases.upsertCaseMeta(req.params.id, req.body || {});
  res.json({ case: c });
});

app.delete("/api/admin/cases/:id", requireAdmin, (req, res) => {
  if (!cases.getCaseFull(req.params.id)) return res.status(404).json({ error: "Case not found." });
  cases.deleteCase(req.params.id);
  res.json({ ok: true });
});

app.put("/api/admin/cases/:id/quiz", requireAdmin, (req, res) => {
  const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];
  for (const q of questions) {
    if (!q.q || !Array.isArray(q.options) || q.options.length < 2 || typeof q.answer !== "number") {
      return res.status(400).json({ error: "Each question needs text, 2+ options, and a numeric answer index." });
    }
  }
  cases.replaceQuizQuestions(req.params.id, questions);
  res.json({ case: cases.getCaseFull(req.params.id) });
});

app.put("/api/admin/cases/:id/exam", requireAdmin, (req, res) => {
  const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];
  for (const q of questions) {
    if (!q.q || !Array.isArray(q.options) || q.options.length < 2 || typeof q.answer !== "number") {
      return res.status(400).json({ error: "Each question needs text, 2+ options, and a numeric answer index." });
    }
  }
  cases.replaceExamQuestions(req.params.id, questions);
  res.json({ case: cases.getCaseFull(req.params.id) });
});

// ---- Evidence file upload ----------------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(CASE_FILES_DIR, req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, file.originalname),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 50 },
});

app.post("/api/admin/cases/:id/upload", requireAdmin, upload.array("files"), (req, res) => {
  if (!cases.getCaseFull(req.params.id)) return res.status(404).json({ error: "Case not found." });
  const saved = (req.files || []).map((f) => f.filename);
  res.json({ ok: true, saved });
});

app.get("/api/admin/cases/:id/files", requireAdmin, (req, res) => {
  const dir = path.join(CASE_FILES_DIR, req.params.id);
  if (!fs.existsSync(dir)) return res.json({ files: [] });
  const files = fs.readdirSync(dir).sort();
  res.json({ files });
});

app.delete("/api/admin/cases/:id/files/:filename", requireAdmin, (req, res) => {
  const dir = path.join(CASE_FILES_DIR, req.params.id);
  const target = path.join(dir, req.params.filename);
  // guard against path traversal — resolved path must stay inside the case folder
  if (!target.startsWith(path.resolve(dir) + path.sep)) {
    return res.status(400).json({ error: "Invalid filename." });
  }
  if (fs.existsSync(target)) fs.unlinkSync(target);
  res.json({ ok: true });
});

// ---- Overview stats -----------------------------------------------------
app.get("/api/admin/stats", requireAdmin, (_req, res) => {
  const allUsers = users.listAllUsers();
  const allCases = cases.listCasesFull();
  const totalSolved = allUsers.reduce((sum, u) => sum + users.getProgressSummary(u.id).solvedCases.length, 0);
  const totalExams = allUsers.reduce((sum, u) => sum + users.getProgressSummary(u.id).examsPassed.length, 0);
  res.json({
    investigators: allUsers.length,
    admins: allUsers.filter((u) => u.is_admin).length,
    cases: allCases.length,
    activeCases: allCases.filter((c) => !c.locked).length,
    casesClosedTotal: totalSolved,
    examsPassedTotal: totalExams,
  });
});

// --------------------------------------------------------------------------
// Static frontend
// --------------------------------------------------------------------------
app.use(express.static(PUBLIC_DIR));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found." });
  res.status(404).sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`CDFU Case Portal running at http://localhost:${PORT}`);
});
