/* ==========================================================================
   CDFU CASE PORTAL — ADMIN PANEL LOGIC
   Renders stats, user management, and case management (metadata, quiz,
   exam, evidence file upload) against /api/admin/*. Requires the current
   session to belong to an admin (server enforces this on every route too).
   ========================================================================== */

let ADMIN_CASES_CACHE = [];

function questionEditorRow(kind, i, q) {
  const opts = q?.options || ["", "", "", ""];
  const answer = q?.answer ?? 0;
  return `
    <div class="quiz-q" data-kind="${kind}" data-i="${i}" style="background:rgba(255,255,255,.5);">
      <div class="d-flex justify-content-between align-items-start">
        <div class="q-num">${kind === "quiz" ? "Question" : "Field Question"} ${i + 1}</div>
        <button type="button" class="btn-file btn-remove-q" style="padding:.2rem .6rem; font-size:11px;">Remove</button>
      </div>
      <input type="text" class="form-control mb-2 q-text" placeholder="Question text" value="${(q?.q || "").replace(/"/g, "&quot;")}">
      ${opts
        .map(
          (opt, oi) => `
        <div class="d-flex align-items-center gap-2 mb-1">
          <input type="radio" name="ans-${kind}-${i}" class="q-answer-radio" value="${oi}" ${Number(answer) === oi ? "checked" : ""}>
          <input type="text" class="form-control q-option" placeholder="Option ${oi + 1}" value="${(opt || "").replace(/"/g, "&quot;")}">
        </div>`
        )
        .join("")}
    </div>`;
}

function readQuestionsFromEditor(container, kind) {
  const rows = [...container.querySelectorAll(`[data-kind="${kind}"]`)];
  return rows.map((row) => {
    const q = row.querySelector(".q-text").value.trim();
    const options = [...row.querySelectorAll(".q-option")].map((i) => i.value.trim()).filter(Boolean);
    const checked = row.querySelector(".q-answer-radio:checked");
    const answer = checked ? Number(checked.value) : 0;
    return { q, options, answer };
  }).filter((q) => q.q && q.options.length >= 2);
}

function wireQuestionEditor(container, kind, getInitial) {
  function addRow(q) {
    const i = container.querySelectorAll(`[data-kind="${kind}"]`).length;
    const div = document.createElement("div");
    div.innerHTML = questionEditorRow(kind, i, q);
    const node = div.firstElementChild;
    node.querySelector(".btn-remove-q").addEventListener("click", () => {
      node.remove();
      renumber();
    });
    container.appendChild(node);
  }
  function renumber() {
    [...container.querySelectorAll(`[data-kind="${kind}"]`)].forEach((row, i) => {
      row.dataset.i = i;
      row.querySelector(".q-num").textContent = (kind === "quiz" ? "Question " : "Field Question ") + (i + 1);
      row.querySelectorAll(".q-answer-radio").forEach((r) => (r.name = `ans-${kind}-${i}`));
    });
  }
  (getInitial() || []).forEach(addRow);
  return { addRow, renumber };
}

async function renderAdminPage(root) {
  const [stats, casesData, usersData] = await Promise.all([
    api("/api/admin/stats"),
    api("/api/admin/cases"),
    api("/api/admin/users"),
  ]);
  ADMIN_CASES_CACHE = casesData.cases;

  root.innerHTML = `
    <header class="hero" style="padding: 3rem 0 2rem;">
      <div class="container">
        <span class="folder-tag">● Bureau Chief Access</span>
        <h1 style="font-size: clamp(1.8rem, 3.4vw, 2.4rem);">Admin Panel</h1>
        <p class="lede mb-0">Manage investigators, case files, quizzes, field exams, and evidence uploads.</p>
      </div>
    </header>

    <section class="section pt-4">
      <div class="container">
        <div class="row g-3 mb-4" id="stat-cards"></div>

        <ul class="nav nav-tabs mb-4" style="border-color:var(--line);">
          <li class="nav-item"><button class="nav-link active" data-tab="cases" type="button">Cases</button></li>
          <li class="nav-item"><button class="nav-link" data-tab="users" type="button">Investigators</button></li>
        </ul>

        <div id="tab-cases"></div>
        <div id="tab-users" style="display:none;"></div>
      </div>
    </section>
  `;

  renderStats(stats);
  renderCasesTab(document.getElementById("tab-cases"));
  renderUsersTab(document.getElementById("tab-users"), usersData.users);

  document.querySelectorAll(".nav-tabs [data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-tabs [data-tab]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-cases").style.display = btn.dataset.tab === "cases" ? "" : "none";
      document.getElementById("tab-users").style.display = btn.dataset.tab === "users" ? "" : "none";
    });
  });
}

function renderStats(s) {
  const el = document.getElementById("stat-cards");
  const cards = [
    ["Investigators", s.investigators],
    ["Admins", s.admins],
    ["Cases (total)", s.cases],
    ["Cases Active", s.activeCases],
    ["Files Closed (all users)", s.casesClosedTotal],
    ["Exams Passed (all users)", s.examsPassedTotal],
  ];
  el.innerHTML = cards
    .map(
      ([label, val]) => `
    <div class="col-6 col-md-4 col-lg-2">
      <div class="panel text-center h-100">
        <div class="stat-num" style="font-size:1.5rem;">${val}</div>
        <div class="stat-label mt-1">${label}</div>
      </div>
    </div>`
    )
    .join("");
}

// --------------------------------------------------------------------------
// CASES TAB
// --------------------------------------------------------------------------
function renderCasesTab(el) {
  el.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h2 class="h5 eyebrow mb-0">Case Files</h2>
      <button id="new-case-btn" class="btn-stamp btn-stamp-gold" type="button">+ New Case</button>
    </div>
    <div class="panel p-0" style="overflow-x:auto;">
      <table class="lb-table">
        <thead><tr><th>Code</th><th>Title</th><th>Difficulty</th><th>Points</th><th>Pages</th><th>Status</th><th></th></tr></thead>
        <tbody id="admin-case-rows"></tbody>
      </table>
    </div>
    <div id="case-editor-mount" class="mt-4"></div>
  `;

  function renderRows() {
    document.getElementById("admin-case-rows").innerHTML = ADMIN_CASES_CACHE.map(
      (c) => `
      <tr>
        <td class="text-data">${c.code}</td>
        <td>${c.title}</td>
        <td>${c.difficulty}</td>
        <td>${c.points}</td>
        <td>${c.pageCount}</td>
        <td>${c.locked ? '<span style="color:var(--stamp-red-light)">Locked</span>' : '<span style="color:var(--sticky)">Active</span>'}</td>
        <td><button class="btn-file edit-case-btn" data-id="${c.id}" type="button">Edit</button></td>
      </tr>`
    ).join("");
    document.querySelectorAll(".edit-case-btn").forEach((btn) => {
      btn.addEventListener("click", () => openCaseEditor(btn.dataset.id));
    });
  }
  renderRows();

  document.getElementById("new-case-btn").addEventListener("click", () => openCaseEditor(null));

  async function openCaseEditor(id) {
    const mount = document.getElementById("case-editor-mount");
    const c = id ? ADMIN_CASES_CACHE.find((x) => x.id === id) : null;

    mount.innerHTML = `
      <div class="paper-panel">
        <div class="d-flex justify-content-between align-items-start mb-3">
          <h3 class="h5 mb-0" style="color:var(--ink); font-family:var(--font-display);">${c ? `Edit: ${c.title}` : "New Case"}</h3>
          ${c ? `<button id="delete-case-btn" class="btn-file" type="button" style="border-color:var(--stamp-red); color:var(--stamp-red);">Delete Case</button>` : ""}
        </div>

        <form id="case-meta-form">
          <div class="row g-3">
            <div class="col-md-8">
              <label>Title</label>
              <input class="form-control" name="title" value="${c ? c.title.replace(/"/g, "&quot;") : ""}" placeholder="Phantom Invoice" required>
            </div>
            <div class="col-md-4">
              <label>Case ID (slug)</label>
              <input class="form-control" name="id" value="${c ? c.id : ""}" ${c ? "readonly" : "placeholder=case-004"} required>
            </div>
            <div class="col-md-4">
              <label>Case Code</label>
              <input class="form-control" name="code" value="${c ? c.code : ""}" placeholder="CDF-2026-0004">
            </div>
            <div class="col-md-4">
              <label>Category</label>
              <input class="form-control" name="category" value="${c ? c.category : ""}" placeholder="BEC / Invoice Fraud">
            </div>
            <div class="col-md-3">
              <label>Difficulty</label>
              <select class="form-control" name="difficulty">
                ${["rookie", "field", "veteran"].map((d) => `<option value="${d}" ${c?.difficulty === d ? "selected" : ""}>${d}</option>`).join("")}
              </select>
            </div>
            <div class="col-md-3">
              <label>Points</label>
              <input class="form-control" type="number" name="points" value="${c ? c.points : 100}">
            </div>
            <div class="col-md-3">
              <label>Page Count</label>
              <input class="form-control" type="number" name="pageCount" value="${c ? c.pageCount : 0}">
            </div>
            <div class="col-md-3">
              <label>Locked?</label>
              <select class="form-control" name="locked">
                <option value="true" ${!c || c.locked ? "selected" : ""}>Locked</option>
                <option value="false" ${c && !c.locked ? "selected" : ""}>Active</option>
              </select>
            </div>
            <div class="col-md-6">
              <label>Evidence folder (relative path)</label>
              <input class="form-control" name="folder" value="${c ? c.folder || "" : ""}" placeholder="case-files/case-004/">
            </div>
            <div class="col-md-6">
              <label>Cover / table-of-contents file</label>
              <input class="form-control" name="cover" value="${c ? c.cover || "index.html" : "index.html"}">
            </div>
            <div class="col-12">
              <label>Briefing</label>
              <textarea class="form-control" name="briefing" rows="3">${c ? c.briefing : ""}</textarea>
            </div>
            <div class="col-12">
              <label>Objectives (one per line)</label>
              <textarea class="form-control" name="objectives" rows="3">${c ? c.objectives.join("\n") : ""}</textarea>
            </div>
            <div class="col-md-6">
              <label>Field Exam Title</label>
              <input class="form-control" name="examTitle" value="${c ? c.practical.title : ""}" placeholder="Field Exam — Case 004">
            </div>
            <div class="col-md-3">
              <label>Exam Pass Score</label>
              <input class="form-control" type="number" name="examPassScore" value="${c ? c.practical.passScore : 0}">
            </div>
            <div class="col-12">
              <label>Exam Instructions</label>
              <textarea class="form-control" name="examInstructions" rows="2">${c ? c.practical.instructions : ""}</textarea>
            </div>
          </div>
          <div id="case-meta-error" class="small mt-2" style="color:var(--stamp-red); display:none;"></div>
          <button type="submit" class="btn-stamp mt-3">${c ? "Save Case Details" : "Create Case"}</button>
        </form>

        ${c ? `
        <div class="divider-dash"></div>
        <h4 class="h6 eyebrow mb-2">Case Quiz</h4>
        <div id="quiz-editor"></div>
        <button id="add-quiz-q" class="btn-file mt-2" type="button">+ Add Question</button>
        <button id="save-quiz-btn" class="btn-stamp mt-2 ms-2" type="button">Save Quiz</button>
        <div id="quiz-save-msg" class="small mt-2"></div>

        <div class="divider-dash"></div>
        <h4 class="h6 eyebrow mb-2">Field Exam Questions</h4>
        <div id="exam-editor"></div>
        <button id="add-exam-q" class="btn-file mt-2" type="button">+ Add Question</button>
        <button id="save-exam-btn" class="btn-stamp mt-2 ms-2" type="button">Save Exam</button>
        <div id="exam-save-msg" class="small mt-2"></div>

        <div class="divider-dash"></div>
        <h4 class="h6 eyebrow mb-2">Evidence Files</h4>
        <p class="text-secondary small">Upload page-01.html, page-01.png, index.html, etc. directly into <code>${c.folder}</code>. For a whole PDF at once, use the <code>npm run add-case-from-pdf</code> command instead (see docs/ADD-CASES.md).</p>
        <div id="file-list" class="mb-2 small"></div>
        <form id="upload-form" class="d-flex gap-2 align-items-center flex-wrap">
          <input type="file" name="files" multiple class="form-control" style="max-width:340px;">
          <button type="submit" class="btn-file">Upload</button>
        </form>
        <div id="upload-msg" class="small mt-2"></div>
        ` : ""}
      </div>
    `;
    mount.scrollIntoView({ behavior: "smooth", block: "start" });

    document.getElementById("case-meta-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const fd = new FormData(form);
      const payload = {
        id: fd.get("id").trim(),
        code: fd.get("code").trim(),
        category: fd.get("category").trim(),
        title: fd.get("title").trim(),
        difficulty: fd.get("difficulty"),
        points: Number(fd.get("points")),
        pageCount: Number(fd.get("pageCount")),
        locked: fd.get("locked") === "true",
        folder: fd.get("folder").trim(),
        cover: fd.get("cover").trim(),
        briefing: fd.get("briefing").trim(),
        objectives: fd.get("objectives").split("\n").map((s) => s.trim()).filter(Boolean),
        examTitle: fd.get("examTitle").trim(),
        examPassScore: Number(fd.get("examPassScore")),
        examInstructions: fd.get("examInstructions").trim(),
      };
      const errEl = document.getElementById("case-meta-error");
      try {
        if (c) {
          await api(`/api/admin/cases/${c.id}`, { method: "PUT", body: payload });
        } else {
          await api("/api/admin/cases", { method: "POST", body: payload });
        }
        await refreshCases();
        openCaseEditor(payload.id);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = "block";
      }
    });

    if (!c) return; // quiz/exam/upload only apply to existing cases

    document.getElementById("delete-case-btn")?.addEventListener("click", async () => {
      if (!confirm(`Delete case "${c.title}"? This cannot be undone (evidence files on disk are kept).`)) return;
      await api(`/api/admin/cases/${c.id}`, { method: "DELETE" });
      await refreshCases();
      mount.innerHTML = "";
      renderRows();
    });

    // Quiz editor
    const quizContainer = document.getElementById("quiz-editor");
    const quizCtl = wireQuestionEditor(quizContainer, "quiz", () => c.quiz);
    document.getElementById("add-quiz-q").addEventListener("click", () => quizCtl.addRow());
    document.getElementById("save-quiz-btn").addEventListener("click", async () => {
      const questions = readQuestionsFromEditor(quizContainer, "quiz");
      const msg = document.getElementById("quiz-save-msg");
      try {
        await api(`/api/admin/cases/${c.id}/quiz`, { method: "PUT", body: { questions } });
        msg.textContent = `Saved ${questions.length} quiz question(s).`;
        msg.style.color = "var(--custody-blue)";
        await refreshCases();
      } catch (err) {
        msg.textContent = err.message;
        msg.style.color = "var(--stamp-red)";
      }
    });

    // Exam editor
    const examContainer = document.getElementById("exam-editor");
    const examCtl = wireQuestionEditor(examContainer, "exam", () => c.practical.questions);
    document.getElementById("add-exam-q").addEventListener("click", () => examCtl.addRow());
    document.getElementById("save-exam-btn").addEventListener("click", async () => {
      const questions = readQuestionsFromEditor(examContainer, "exam");
      const msg = document.getElementById("exam-save-msg");
      try {
        await api(`/api/admin/cases/${c.id}/exam`, { method: "PUT", body: { questions } });
        msg.textContent = `Saved ${questions.length} field exam question(s).`;
        msg.style.color = "var(--custody-blue)";
        await refreshCases();
      } catch (err) {
        msg.textContent = err.message;
        msg.style.color = "var(--stamp-red)";
      }
    });

    // Evidence files
    async function refreshFileList() {
      const { files } = await api(`/api/admin/cases/${c.id}/files`);
      const listEl = document.getElementById("file-list");
      listEl.innerHTML = files.length
        ? files.map((f) => `<span class="chip points me-1 mb-1 d-inline-flex align-items-center gap-1" style="background:rgba(28,26,23,.08);">${f} <button class="btn-file-del" data-f="${f}" style="border:none; background:none; color:var(--stamp-red); cursor:pointer; padding:0 .2rem;">×</button></span>`).join("")
        : `<span class="text-faint">No files uploaded yet.</span>`;
      listEl.querySelectorAll(".btn-file-del").forEach((b) => {
        b.addEventListener("click", async () => {
          await api(`/api/admin/cases/${c.id}/files/${encodeURIComponent(b.dataset.f)}`, { method: "DELETE" });
          refreshFileList();
        });
      });
    }
    refreshFileList();

    document.getElementById("upload-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input[type="file"]');
      const msg = document.getElementById("upload-msg");
      if (!input.files.length) return;
      const fd = new FormData();
      [...input.files].forEach((f) => fd.append("files", f));
      const token = getToken();
      try {
        const res = await fetch(`/api/admin/cases/${c.id}/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed.");
        msg.textContent = `Uploaded: ${data.saved.join(", ")}`;
        msg.style.color = "var(--custody-blue)";
        input.value = "";
        refreshFileList();
      } catch (err) {
        msg.textContent = err.message;
        msg.style.color = "var(--stamp-red)";
      }
    });
  }

  async function refreshCases() {
    const { cases: fresh } = await api("/api/admin/cases");
    ADMIN_CASES_CACHE = fresh;
    renderRows();
  }
}

// --------------------------------------------------------------------------
// USERS TAB
// --------------------------------------------------------------------------
function renderUsersTab(el, initialUsers) {
  let usersList = initialUsers;

  function render() {
    el.innerHTML = `
      <h2 class="h5 eyebrow mb-3">Investigators</h2>
      <div class="panel p-0" style="overflow-x:auto;">
        <table class="lb-table">
          <thead><tr><th>Badge ID</th><th>Name</th><th>Rank</th><th>Points</th><th>Closed</th><th>Exams</th><th>Admin</th><th></th></tr></thead>
          <tbody>
            ${usersList
              .map(
                (u) => `
              <tr>
                <td class="text-data">${u.badgeId}</td>
                <td>${u.name}<div class="text-faint" style="font-size:11px;">${u.email}</div></td>
                <td>${u.rankName}</td>
                <td>
                  <div class="d-flex align-items-center gap-1">
                    <input type="number" class="form-control points-input" data-id="${u.id}" value="${u.points}" style="width:90px; padding:.25rem .5rem; font-size:12px;">
                  </div>
                </td>
                <td>${u.solvedCases.length}</td>
                <td>${u.examsPassed.length}</td>
                <td><input type="checkbox" class="admin-toggle" data-id="${u.id}" ${u.isAdmin ? "checked" : ""}></td>
                <td><button class="btn-file del-user-btn" data-id="${u.id}" type="button" style="border-color:var(--stamp-red); color:var(--stamp-red);">Delete</button></td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <div id="users-msg" class="small mt-2"></div>
    `;

    el.querySelectorAll(".points-input").forEach((input) => {
      input.addEventListener("change", async () => {
        try {
          await api(`/api/admin/users/${input.dataset.id}`, { method: "PATCH", body: { points: Number(input.value) } });
          refresh();
        } catch (err) {
          document.getElementById("users-msg").textContent = err.message;
        }
      });
    });

    el.querySelectorAll(".admin-toggle").forEach((box) => {
      box.addEventListener("change", async () => {
        try {
          await api(`/api/admin/users/${box.dataset.id}`, { method: "PATCH", body: { isAdmin: box.checked } });
        } catch (err) {
          box.checked = !box.checked;
          document.getElementById("users-msg").textContent = err.message;
        }
      });
    });

    el.querySelectorAll(".del-user-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this investigator's account and all progress?")) return;
        try {
          await api(`/api/admin/users/${btn.dataset.id}`, { method: "DELETE" });
          refresh();
        } catch (err) {
          document.getElementById("users-msg").textContent = err.message;
        }
      });
    });
  }

  async function refresh() {
    const { users: fresh } = await api("/api/admin/users");
    usersList = fresh;
    render();
  }

  render();
}
