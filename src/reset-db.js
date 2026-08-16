// Deletes the SQLite database file(s) so the next `npm start` creates a
// fresh, empty database. Useful for demos. Run with: npm run reset-db
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
for (const f of ["cdfu.db", "cdfu.db-shm", "cdfu.db-wal"]) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log(`Deleted ${f}`);
  }
}
console.log("Database reset. It will be recreated on next `npm start`.");
