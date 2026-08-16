// ==========================================================================
// CDFU CASE PORTAL — RANKS & BADGES (server-side source of truth)
// ==========================================================================

const RANKS = [
  { name: "Recruit", min: 0, color: "#8a8375" },
  { name: "Rookie Investigator", min: 50, color: "#5C86AC" },
  { name: "Field Investigator", min: 200, color: "#4E9A6B" },
  { name: "Senior Investigator", min: 450, color: "#F0D563" },
  { name: "Chief Inspector", min: 800, color: "#E08A3C" },
  { name: "Bureau Legend", min: 1400, color: "#C1443C" },
];

function rankForPoints(points) {
  let current = RANKS[0];
  for (const r of RANKS) {
    if (points >= r.min) current = r;
  }
  const idx = RANKS.indexOf(current);
  const next = RANKS[idx + 1] || null;
  return { ...current, next, idx };
}

// `summary` = { points, solvedCases: string[], examsPassed: string[], perfectQuizzes: string[] }
const BADGES = [
  {
    id: "first-blood",
    name: "First Blood",
    desc: "Close your first case file.",
    check: (s) => s.solvedCases.length >= 1,
  },
  {
    id: "black-login-closed",
    name: "Black Login: Closed",
    desc: "Solve Case 001 — Operation Black Login.",
    check: (s) => s.solvedCases.includes("case-001"),
  },
  {
    id: "field-certified",
    name: "Field Certified",
    desc: "Pass a practical field exam.",
    check: (s) => s.examsPassed.length >= 1,
  },
  {
    id: "clean-sheet",
    name: "Clean Sheet",
    desc: "Pass a case quiz with a perfect score, first attempt.",
    check: (s) => s.perfectQuizzes.length >= 1,
  },
  {
    id: "three-piece",
    name: "Three-Piece File",
    desc: "Close three case files.",
    check: (s) => s.solvedCases.length >= 3,
  },
  {
    id: "veteran",
    name: "Veteran Desk",
    desc: "Reach Senior Investigator or above.",
    check: (s) => rankForPoints(s.points).idx >= 3,
  },
];

function computeBadges(summary) {
  return BADGES.filter((b) => b.check(summary)).map((b) => b.id);
}

module.exports = { RANKS, rankForPoints, BADGES, computeBadges };
