/* ==========================================================================
   CDFU CASE PORTAL — SHARED APP SHELL
   Call `await initApp()` at the top of each page's script: it fetches the
   current session (if any), renders the navbar, marks the active nav link,
   sets the footer year, and returns the user object (or null).
   ========================================================================== */

function renderNavSession(user) {
  const slot = document.getElementById("nav-session-slot");
  if (!slot) return;

  if (!user) {
    slot.innerHTML = `
      <a href="login.html" class="btn-file me-2">Log In</a>
      <a href="signup.html" class="btn-stamp btn-stamp-gold">Join the Bureau</a>
    `;
    return;
  }

  const rank = rankFor(user.points);
  slot.innerHTML = `
    <a href="profile.html" class="nav-id-pill text-decoration-none">
      <span class="rank-dot" style="background:${rank.color}"></span>
      <span>${user.badgeId}</span>
      <span class="text-faint">·</span>
      <span>${user.points} CP</span>
    </a>
    <button id="nav-logout-btn" class="btn-file ms-2" type="button">Log Out</button>
  `;
  document.getElementById("nav-logout-btn").addEventListener("click", async () => {
    await logout();
    window.location.href = "index.html";
  });
}

function setActiveNav() {
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".cdfu-nav .nav-link[data-nav]").forEach((el) => {
    if (el.getAttribute("data-nav") === path) el.classList.add("active");
  });
}

function setFooterYear() {
  const el = document.getElementById("footer-year");
  if (el) el.textContent = new Date().getFullYear();
}

function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

// Cache of /api/ranks so pages don't each re-fetch it.
let _ranksCache = null;
async function loadRanks() {
  if (_ranksCache) return _ranksCache;
  const data = await api("/api/ranks");
  _ranksCache = data.ranks;
  return _ranksCache;
}

function rankFor(points) {
  const ranks = _ranksCache || [];
  let current = ranks[0] || { name: "Recruit", min: 0, color: "#8a8375" };
  for (const r of ranks) if (points >= r.min) current = r;
  const idx = ranks.indexOf(current);
  const next = ranks[idx + 1] || null;
  return { ...current, next, idx };
}

async function initApp() {
  await loadRanks();
  const user = await fetchCurrentUser();
  renderNavSession(user);
  setActiveNav();
  setFooterYear();
  return user;
}
