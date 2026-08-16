// ==========================================================================
// CDFU CASE PORTAL — AUTH UTILITIES
// Passwords are salted + hashed with scrypt (Node's built-in crypto —
// no bcrypt dependency needed). Sessions are opaque random tokens stored
// in the sessions table, sent by the client as "Authorization: Bearer <token>".
// ==========================================================================

const crypto = require("node:crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHash) {
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function makeBadgeId(name) {
  const base = (name || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
  const num = Math.floor(1000 + Math.random() * 9000);
  return `CDFU-${base || "AGENT"}-${num}`;
}

module.exports = { hashPassword, verifyPassword, makeToken, makeBadgeId };
