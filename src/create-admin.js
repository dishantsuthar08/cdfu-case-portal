// ==========================================================================
// CDFU CASE PORTAL — CREATE / PROMOTE AN ADMIN
// Usage:
//   node src/create-admin.js --name "Your Name" --email you@example.com --password "at-least-6-chars"
// If the email already has a Bureau file, this just promotes that existing
// account to admin (password/name flags are ignored in that case).
// ==========================================================================

const db = require("./db");
const { hashPassword, makeBadgeId } = require("./auth-utils");

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

function main() {
  const { name, email, password } = parseArgs();

  if (!email) {
    console.error("Usage: node src/create-admin.js --name \"Your Name\" --email you@example.com --password \"secret123\"");
    process.exit(1);
  }

  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());

  if (existing) {
    db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(existing.id);
    console.log(`Promoted existing user ${existing.badge_id} (${existing.email}) to admin.`);
    return;
  }

  if (!name || !password || password.length < 6) {
    console.error("New admin needs --name, --email, and a --password of at least 6 characters.");
    process.exit(1);
  }

  const { hash, salt } = hashPassword(password);
  const badgeId = makeBadgeId(name);
  const info = db
    .prepare(
      `INSERT INTO users (badge_id, name, email, password_hash, password_salt, is_admin)
       VALUES (?, ?, ?, ?, ?, 1)`
    )
    .run(badgeId, name, email.toLowerCase(), hash, salt);

  console.log(`Created admin account ${badgeId} (${email}), user id ${info.lastInsertRowid}.`);
  console.log("Log in at /login.html with that email and password, then open /admin.html.");
}

main();
