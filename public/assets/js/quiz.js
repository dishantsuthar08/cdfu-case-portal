/* ==========================================================================
   CDFU CASE PORTAL — CASE PAGE + QUIZ ENGINE (client)
   Case metadata and quiz/exam questions come from GET /api/cases/:id —
   answer keys never reach the browser. Grading happens server-side via
   POST /api/cases/:id/quiz and /api/cases/:id/exam.
   ========================================================================== */

function diffLabel(d) {
  return { rookie: "Rookie", field: "Field", veteran: "Veteran" }[d] || d;
}

async function loadAndRenderCase(id, root, user) {
  let c;
  try {
    const data = await api(`/api/cases/${encodeURIComponent(id)}`);
    c = data.case;
  } catch (err) {
    root.innerHTML = `
      <div class="container section text-center">
        <h2>File not found</h2>
        <p class="text-dim">${err.message}</p>
        <a href="cases.html" class="btn-file">Back to Case Files</a>
      </div>`;
    return;
  }
  document.getElementById("page-title").textContent = `${c.title} — Cyber Detective Files`;
  renderCasePage(c, root, user);
}

function renderCasePage(c, root, user) {
  if (c.locked) {
    root.innerHTML = `
      <header class="hero" style="padding: 3rem 0 2rem;">
        <div class="container">
          <span class="folder-tag">● ${c.code}</span>
          <h1 style="font-size: clamp(1.7rem, 3vw, 2.3rem);">${c.title}</h1>
          <p class="lede">${c.briefing}</p>
          <a href="cases.html" class="btn-file">← Back to Case Files</a>
        </div>
      </header>`;
    return;
  }

  const diffClass = { rookie: "diff-rookie", field: "diff-field", veteran: "diff-veteran" }[c.difficulty];

  root.innerHTML = `
    <header class="hero" style="padding: 3rem 0 2rem;">
      <div class="container">
        <span class="folder-tag">● ${c.code} · ${c.category}</span>
        <h1 style="font-size: clamp(1.7rem, 3vw, 2.3rem);">${c.title}</h1>
        <p class="lede">${c.briefing}</p>
        <div class="d-flex flex-wrap gap-2 mb-3">
          <span class="chip ${diffClass}" style="background:var(--panel-2); color:var(--text);">${diffLabel(c.difficulty)}</span>
          <span class="chip points" style="background:var(--panel-2); color:var(--text);">${c.points} CP</span>
          <span class="chip points" style="background:var(--panel-2); color:var(--text);">${c.pageCount} evidence sheets</span>
          ${c.solved ? '<span class="chip points" style="background:var(--panel-2); color:var(--sticky);">✓ Case Closed</span>' : ""}
        </div>
        <a href="reader.html?case=${c.id}" class="btn-stamp btn-stamp-gold">Open Evidence Folder →</a>
      </div>
    </header>

    <section class="section pt-4">
      <div class="container">
        <div class="row g-4">
          <div class="col-lg-4">
            <div class="panel h-100">
              <h3 class="h6 eyebrow mb-3">Objectives</h3>
              <ul class="text-dim small ps-3">
                ${c.objectives.map((o) => `<li class="mb-2">${o}</li>`).join("")}
              </ul>
              <div class="divider-dash"></div>
              <p class="text-faint small mb-0">Read every sheet before you start the quiz — some questions can only be answered from a specific page.</p>
            </div>
          </div>
          <div class="col-lg-8">
            <div class="paper-panel">
              <h2 class="h4 mb-1" style="color:var(--ink); font-family:var(--font-display);">Case Quiz</h2>
              <p class="text-secondary small mb-4">Answer from memory of the file. Grading happens on the server.</p>
              <div id="quiz-area"></div>
            </div>

            <div class="paper-panel mt-4" id="exam-panel">
              <h2 class="h4 mb-1" style="color:var(--ink); font-family:var(--font-display);">${c.practical.title}</h2>
              <p class="text-secondary small mb-4">${c.practical.instructions}</p>
              <div id="exam-area"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  renderQuiz(c, user);
  renderExam(c, user);
}

function renderQuiz(c, user) {
  const area = document.getElementById("quiz-area");

  if (!user) {
    area.innerHTML = `
      <div class="alert" style="background:rgba(158,43,37,.08); border:1px solid var(--stamp-red);">
        <a href="login.html?next=${encodeURIComponent(location.href)}">Log in</a> or
        <a href="signup.html?next=${encodeURIComponent(location.href)}">get a Badge ID</a> to submit answers and earn Case Points.
      </div>`;
    return;
  }

  area.innerHTML = `
    <form id="quiz-form">
      ${c.quiz
        .map(
          (q, qi) => `
        <div class="quiz-q">
          <div class="q-num">Question ${qi + 1} / ${c.quiz.length}</div>
          <p class="fw-semibold mb-2" style="color:var(--ink);">${q.q}</p>
          ${q.options
            .map(
              (opt, oi) => `
            <div class="form-check">
              <input class="form-check-input" type="radio" name="q${qi}" id="q${qi}o${oi}" value="${oi}" required>
              <label class="form-check-label" for="q${qi}o${oi}">${opt}</label>
            </div>`
            )
            .join("")}
        </div>`
        )
        .join("")}
      <button type="submit" class="btn-stamp mt-2">${c.solved ? "Retake Quiz" : "Submit Answers"}</button>
    </form>
    <div id="quiz-result" class="mt-3"></div>
  `;

  document.getElementById("quiz-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const answers = c.quiz.map((_, qi) => {
      const picked = form.querySelector(`input[name="q${qi}"]:checked`);
      return picked ? Number(picked.value) : -1;
    });

    const resultEl = document.getElementById("quiz-result");
    let data;
    try {
      data = await api(`/api/cases/${c.id}/quiz`, { method: "POST", body: { answers } });
    } catch (err) {
      resultEl.innerHTML = `<div class="quiz-result">${err.message}</div>`;
      return;
    }

    resultEl.innerHTML = `
      <div class="quiz-result ${data.passed ? "pass" : ""}">
        <strong style="color:var(--ink);">${data.correct} / ${data.total} correct.</strong>
        ${data.passed ? " Case marked closed. Points added to your Badge ID." : ` You need ${data.passScore}/${data.total} to close this file. Review the folder and try again.`}
      </div>
    `;

    if (data.passed) {
      c.solved = true;
      renderNavSession(data.user);
      renderExam(c, data.user);
      if (data.newBadges && data.newBadges.length) {
        const names = data.newBadges.map((b) => b.name).join(", ");
        resultEl.innerHTML += `<div class="mt-2 small" style="color:var(--stamp-red);">New Evidence Stamp earned: ${names}</div>`;
      }
    }
  });
}

function renderExam(c, user) {
  const area = document.getElementById("exam-area");
  const panel = document.getElementById("exam-panel");

  if (!c.solved) {
    panel.style.opacity = ".55";
    area.innerHTML = `<p class="text-secondary small mb-0">Locked — pass the Case Quiz above to unlock the field exam.</p>`;
    return;
  }
  panel.style.opacity = "1";

  if (!user) {
    area.innerHTML = `<p class="text-secondary small mb-0"><a href="login.html">Log in</a> to sit the field exam.</p>`;
    return;
  }

  const ex = c.practical;
  area.innerHTML = `
    <form id="exam-form">
      ${ex.questions
        .map(
          (q, qi) => `
        <div class="quiz-q">
          <div class="q-num">Field Question ${qi + 1} / ${ex.questions.length}</div>
          <p class="fw-semibold mb-2" style="color:var(--ink);">${q.q}</p>
          ${q.options
            .map(
              (opt, oi) => `
            <div class="form-check">
              <input class="form-check-input" type="radio" name="e${qi}" id="e${qi}o${oi}" value="${oi}" required>
              <label class="form-check-label" for="e${qi}o${oi}">${opt}</label>
            </div>`
            )
            .join("")}
        </div>`
        )
        .join("")}
      <button type="submit" class="btn-stamp mt-2">${c.examPassed ? "Retake Field Exam" : "Submit Field Exam"}</button>
    </form>
    <div id="exam-result" class="mt-3"></div>
  `;

  document.getElementById("exam-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const answers = ex.questions.map((_, qi) => {
      const picked = form.querySelector(`input[name="e${qi}"]:checked`);
      return picked ? Number(picked.value) : -1;
    });

    const resultEl = document.getElementById("exam-result");
    let data;
    try {
      data = await api(`/api/cases/${c.id}/exam`, { method: "POST", body: { answers } });
    } catch (err) {
      resultEl.innerHTML = `<div class="quiz-result">${err.message}</div>`;
      return;
    }

    resultEl.innerHTML = `
      <div class="quiz-result ${data.passed ? "pass" : ""}">
        <strong style="color:var(--ink);">${data.correct} / ${data.total} correct.</strong>
        ${data.passed ? " Field Certified. Bonus points added." : ` You need ${data.passScore}/${data.total} to pass.`}
      </div>
    `;
    if (data.passed) {
      c.examPassed = true;
      renderNavSession(data.user);
      if (data.newBadges && data.newBadges.length) {
        const names = data.newBadges.map((b) => b.name).join(", ");
        resultEl.innerHTML += `<div class="mt-2 small" style="color:var(--stamp-red);">New Evidence Stamp earned: ${names}</div>`;
      }
    }
  });
}
