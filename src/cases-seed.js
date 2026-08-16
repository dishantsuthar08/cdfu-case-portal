// ==========================================================================
// CDFU CASE PORTAL — INITIAL SEED DATA
// This file is only read ONCE — the first time the server boots against an
// empty `cases` table, src/cases-repo.js copies these rows into SQLite.
// After that, the database is the source of truth: use the Admin Panel (or
// the API directly) to add, edit, or remove cases — editing this file after
// the first boot has no effect. Kept here mainly as a readable example of
// the shape a case + quiz + practical exam takes.
// ==========================================================================

const SEED_CASES = [
  {
    id: "case-001",
    code: "CDF-2026-0001",
    title: "Operation Black Login",
    category: "BEC / Vendor Fraud",
    difficulty: "field", // rookie | field | veteran
    points: 150,
    pageCount: 18,
    folder: "case-files/case-001/",
    cover: "index.html",
    briefing:
      "Solvex Analytics Pvt. Ltd. just lost $86,400 to a vendor-payment fraud. " +
      "Finance authorized what looked like a routine bank-detail update for an " +
      "existing supplier. It wasn't. Eighteen evidence sheets are in the folder — " +
      "photographs, printed email, a WhatsApp thread, access logs, a witness " +
      "statement, and more. Work the file in order. Nothing else will be collected.",
    objectives: [
      "Identify how the attacker first gained access to Solvex's internal systems.",
      "Identify how the attacker learned enough to impersonate a real vendor.",
      "Name every suspect on the board as guilty, negligent, or cleared.",
    ],
    locked: false,
    quiz: [
      {
        q: "What kind of financial crime is at the center of this case?",
        options: [
          "Ransomware / double-extortion",
          "Business Email Compromise / vendor-payment fraud",
          "Credential-stuffing account takeover",
          "Insider data theft for resale",
        ],
        answer: 1,
      },
      {
        q: "Approximately how much did Solvex Analytics lose before recovery?",
        options: ["$8,640", "$86,400", "$864,000", "$46,800"],
        answer: 1,
      },
      {
        q: "Which department processed the fraudulent payment?",
        options: ["IT / Systems", "Finance", "HR", "Legal"],
        answer: 1,
      },
      {
        q: "Under Solvex's own policy at the time, what triggered mandatory verbal verification of a bank-detail change?",
        options: [
          "Any change over $10,000",
          "Only onboarding a brand-new vendor — not updating an existing one",
          "Nothing — verbal verification was always required",
          "A request from a departmental head",
        ],
        answer: 1,
      },
      {
        q: "Whose credentials were the attacker's actual entry point into Solvex's systems?",
        options: [
          "Ananya Kapoor, Sr. Finance Executive",
          "Vikram Rao, a remote IT contractor",
          "Farah Sheikh",
          "Devraj Solanki",
        ],
        answer: 1,
      },
      {
        q: "The lookalike domain used against the victim was a typosquat of which real company name?",
        options: ["Solvex Analytics", "Meridian Systems", "Unit 7 Desk", "Orbit Freight"],
        answer: 1,
      },
    ],
    practical: {
      title: "Field Exam — Case 001",
      instructions:
        "The quiz proves you read the file. The field exam proves you can work it " +
        "like an investigator: cross-reference the logs, the timeline, and the " +
        "suspect board yourself before answering.",
      passScore: 3, // out of 4
      questions: [
        {
          q: "An attacker registers meridian-systerns.com to impersonate meridian-systems.com. What social-engineering technique is this an example of?",
          options: [
            "SIM swapping",
            "Homoglyph / typosquatted domain phishing",
            "SQL injection",
            "DNS cache poisoning",
          ],
          answer: 1,
        },
        {
          q: "A remote contractor's VPN credentials are harvested through a fake 'project brief' attachment sent as a job offer. What is the correct classification of this initial-access technique?",
          options: [
            "Spear phishing with a malicious attachment",
            "Brute-force VPN attack",
            "Physical device theft",
            "Man-in-the-middle Wi-Fi attack",
          ],
          answer: 0,
        },
        {
          q: "In this case, Finance's own policy — not a technical flaw — created the opening the attacker exploited. What's the correct investigative term for that kind of weakness?",
          options: [
            "Zero-day vulnerability",
            "Process / control gap",
            "Buffer overflow",
            "Privilege escalation bug",
          ],
          answer: 1,
        },
        {
          q: "Given the evidence, what is the most defensible verdict on the case's central human factor?",
          options: [
            "An employee deliberately colluded with the attacker for a cut of the funds",
            "No human error was involved — this was a pure infrastructure breach",
            "Two unconnected human mistakes (a phished credential and a policy gap) combined to enable an external, financially motivated attacker",
            "The victim company fabricated the loss for an insurance claim",
          ],
          answer: 2,
        },
      ],
    },
  },
  {
    id: "case-002",
    code: "CDF-2026-0002",
    title: "The Unlocked Door",
    category: "Ransomware",
    difficulty: "veteran",
    points: 200,
    pageCount: 20,
    folder: null,
    cover: null,
    briefing:
      "A double-extortion ransomware incident at a precision-components " +
      "manufacturer. Evidence folder in production — arriving soon.",
    objectives: [],
    locked: true,
    quiz: [],
    practical: { title: "", instructions: "", passScore: 0, questions: [] },
  },
  {
    id: "case-003",
    code: "CDF-2026-0003",
    title: "Phantom Invoice",
    category: "BEC / Invoice Fraud",
    difficulty: "rookie",
    points: 120,
    pageCount: 30,
    folder: null,
    cover: null,
    briefing:
      "A second invoice-fraud case, built for investigators just starting out. " +
      "Evidence folder in production — arriving soon.",
    objectives: [],
    locked: true,
    quiz: [],
    practical: { title: "", instructions: "", passScore: 0, questions: [] },
  },
];

module.exports = { SEED_CASES };
