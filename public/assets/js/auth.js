/* ==========================================================================
   CDFU CASE PORTAL — AUTH (client)
   Thin wrapper around the /api/auth/* endpoints. The session token lives
   in localStorage; all user data (points, solved cases, badges) lives
   server-side in SQLite and is fetched fresh via fetchCurrentUser().
   ========================================================================== */

async function signup({ name, email, password }) {
  try {
    const data = await api("/api/auth/signup", { method: "POST", body: { name, email, password } });
    setToken(data.token);
    return { ok: true, user: data.user };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function login({ email, password }) {
  try {
    const data = await api("/api/auth/login", { method: "POST", body: { email, password } });
    setToken(data.token);
    return { ok: true, user: data.user };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {
    // ignore — clearing the local token is enough either way
  }
  clearToken();
}

// Returns the current user (fresh from the server) or null if not logged in.
async function fetchCurrentUser() {
  if (!getToken()) return null;
  try {
    const data = await api("/api/auth/me");
    return data.user;
  } catch {
    clearToken();
    return null;
  }
}

// Redirects to login if not authenticated. Call with `await`.
async function requireAuth(redirectTo = "login.html") {
  const u = await fetchCurrentUser();
  if (!u) {
    window.location.href = `${redirectTo}?next=${encodeURIComponent(location.pathname + location.search)}`;
  }
  return u;
}
