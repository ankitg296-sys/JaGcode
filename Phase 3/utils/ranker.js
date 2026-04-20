const { chat, chatJSON } = require("./openrouter");
const { preFilter } = require("./preFilter");

// ── Recruiter: Rank candidates against a JD/query ─────────────────────────────

const RANKING_SYSTEM_PROMPT = `You are a strict talent acquisition specialist. Score candidates ONLY on direct, relevant experience for the specific role requested.

CRITICAL SCORING RULES:
1. Score is based EXCLUSIVELY on direct domain experience and relevant skills — NOT on soft skills, transferable skills, or general intelligence.
2. If a candidate has ZERO relevant domain experience for the role, their score must be 0–15. Do not reward leadership, communication, or problem-solving unless the role explicitly requires it.
3. A cloud engineer applying for a pilot role scores 0–10. A chef applying for a finance role scores 0–10. No exceptions.
4. Only assign scores above 50 if the candidate has DIRECT, VERIFIABLE experience in the required domain.
5. Gaps must explicitly state missing domain experience — do not soften irrelevance.

Scoring guide:
- 85–100: Strong Match — direct domain experience, meets all key requirements
- 65–84: Good Match — direct domain experience, meets most requirements
- 50–64: Partial Match — some direct relevant experience, notable gaps
- 20–49: Weak Match — minimal relevant experience
- 0–19: No Match — no relevant domain experience at all

For each candidate provide:
- score: integer 0–100 (strictly by the rules above)
- verdict: one of "Strong Match", "Good Match", "Partial Match", "Weak Match", "No Match"
- match_reasons: array of 2–3 bullet points — ONLY cite directly relevant experience. If none, state that.
- gaps: array of 1–2 bullet points on what critical experience is missing

Return ONLY a valid JSON array, one object per candidate in the same order given:
[{ "index": 1, "name": "...", "score": 85, "verdict": "Strong Match", "match_reasons": [], "gaps": [] }, ...]`;

function buildSummary(c, i) {
  const skills = (c.skills || []).slice(0, 15).join(", ");
  const exp = (c.experience || []).slice(0, 3).map(e => `${e.title} @ ${e.company}`).join(" | ");
  return `[${i + 1}] ${c.name || c.fileName}
Title: ${c.title || "N/A"} | ${c.total_experience_years ?? "?"}yrs | ${c.location || "N/A"}
Skills: ${skills || "N/A"}
Industries: ${(c.industries || []).join(", ") || "N/A"}
Roles: ${exp || "N/A"}
Summary: ${c.summary || "N/A"}`;
}

async function rankCandidates(allCandidates, query, conversationHistory = []) {
  if (!allCandidates?.length) throw new Error("No candidates loaded. Upload CVs first.");

  const candidates = preFilter(allCandidates, query);

  const summaries = candidates.map(buildSummary).join("\n\n---\n\n");
  const history = conversationHistory.slice(-8);
  const historyBlock = history.length
    ? "\n\nPrior context:\n" + history.map(m => `${m.role === "user" ? "HM" : "AI"}: ${m.content}`).join("\n")
    : "";

  const userMsg = `CANDIDATES (${candidates.length} of ${allCandidates.length} total):\n\n${summaries}${historyBlock}\n\nREQUIREMENT: "${query}"\n\nRank all ${candidates.length} candidates. Return JSON array.`;

  const ranked = await chatJSON(
    [{ role: "system", content: RANKING_SYSTEM_PROMPT }, { role: "user", content: userMsg }],
    { max_tokens: 2000, temperature: 0 }
  );

  if (!Array.isArray(ranked)) throw new Error("Ranking returned unexpected format");

  return ranked
    .map(r => {
      const c = candidates[r.index - 1];
      if (!c) return null;
      return { ...c, rawText: undefined, score: r.score ?? 0, verdict: r.verdict ?? "No Match", match_reasons: r.match_reasons ?? [], gaps: r.gaps ?? [] };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

// ── Deep-dive Q&A ─────────────────────────────────────────────────────────────

const DEEPDIVE_SYSTEM = `You are a recruiting assistant. Answer questions about the candidate using only their CV. Be concise and cite specific details. If the answer isn't in the CV, say so.`;

async function deepDive(candidate, question) {
  if (!candidate.rawText) throw new Error("Raw CV text not available for this candidate.");
  return await chat(
    [{ role: "system", content: DEEPDIVE_SYSTEM }, { role: "user", content: `CV:\n${candidate.rawText}\n\nQ: ${question}` }],
    { max_tokens: 800, temperature: 0.3 }
  );
}

// ── JD Builder ────────────────────────────────────────────────────────────────

const JD_EXTRACTION_PROMPT = `You are a job description assistant. Extract a structured JD from the hiring manager's description.

Return ONLY a valid JSON object:
{
  "title": "Job title",
  "seniority": "Junior / Mid / Senior / Lead / Executive",
  "required_skills": ["must-have skill 1", "must-have skill 2"],
  "nice_to_have": ["preferred skill 1"],
  "min_experience_years": <number>,
  "industries": ["relevant industry"],
  "summary": "2-3 sentence structured summary of the role requirements, suitable for use as a search query"
}

Hiring manager description:
`;

async function buildJD(description) {
  return await chatJSON([{ role: "user", content: JD_EXTRACTION_PROMPT + description }], { max_tokens: 800 });
}

// ── Bi-directional: Match a candidate profile against all JDs ─────────────────

const CANDIDATE_MATCH_PROMPT = `You are a career advisor. Given a candidate's profile and a list of job descriptions, identify how well the candidate matches each JD.

For each JD provide:
- jd_index: the index number of the JD (1-based)
- score: 0–100 (how well the candidate's profile fits this JD)
- verdict: "Strong Match" | "Good Match" | "Partial Match" | "Weak Match" | "No Match"
- fit_reasons: array of 2 bullet points on why the candidate fits
- gaps: array of 1–2 bullet points on what the candidate is missing for this role

Return ONLY a valid JSON array:
[{ "jd_index": 1, "score": 80, "verdict": "Good Match", "fit_reasons": [], "gaps": [] }, ...]`;

async function matchCandidateToJDs(candidateProfile, jds) {
  if (!jds?.length) throw new Error("No JDs available to match against.");

  const profileBlock = `CANDIDATE PROFILE:
Name: ${candidateProfile.name || "N/A"}
Title: ${candidateProfile.title || "N/A"}
Experience: ${candidateProfile.total_experience_years ?? "?"}yrs
Skills: ${(candidateProfile.skills || []).join(", ") || "N/A"}
Industries: ${(candidateProfile.industries || []).join(", ") || "N/A"}
Summary: ${candidateProfile.summary || "N/A"}
Preferred roles: ${(candidateProfile.preferredRoles || []).join(", ") || "Not specified"}`;

  const jdsBlock = jds.map((jd, i) =>
    `[${i + 1}] ${jd.title} (${jd.seniority || "N/A"})
Required skills: ${(jd.required_skills || []).join(", ") || "N/A"}
Min experience: ${jd.min_experience_years ?? "?"} yrs
Summary: ${jd.summary || "N/A"}`
  ).join("\n\n---\n\n");

  const ranked = await chatJSON([
    { role: "system", content: CANDIDATE_MATCH_PROMPT },
    { role: "user", content: `${profileBlock}\n\nJOB DESCRIPTIONS (${jds.length}):\n\n${jdsBlock}\n\nMatch the candidate against all JDs. Return JSON array.` },
  ], { max_tokens: 2000, temperature: 0 });

  if (!Array.isArray(ranked)) throw new Error("Matching returned unexpected format");

  return ranked
    .map(r => {
      const jd = jds[r.jd_index - 1];
      if (!jd) return null;
      return { ...jd, score: r.score ?? 0, verdict: r.verdict ?? "No Match", fit_reasons: r.fit_reasons ?? [], gaps: r.gaps ?? [] };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

// ── Gap Analysis: Candidate vs a specific JD ──────────────────────────────────

const GAP_ANALYSIS_PROMPT = `You are a career coach. Perform a detailed skills gap analysis comparing a candidate's profile against a specific job description.

Return ONLY a valid JSON object:
{
  "overall_score": <0-100, how ready the candidate is for this role>,
  "verdict": "Ready" | "Near Ready" | "Needs Development" | "Major Gap",
  "strengths": ["3–4 specific strengths the candidate has for this role"],
  "gaps": [
    {
      "area": "Gap area name (e.g. Cloud Architecture, Python, Team Leadership)",
      "severity": "Critical" | "Important" | "Minor",
      "description": "1-2 sentences explaining the gap",
      "recommendation": "Specific action to close this gap (course, certification, project, etc.)"
    }
  ],
  "timeline_to_ready": "Estimated time to close critical gaps (e.g. 3 months, 6–12 months)",
  "top_recommendation": "Single most important next step for this candidate to get this role"
}`;

async function gapAnalysis(candidateProfile, jd) {
  const profileBlock = `CANDIDATE:
Name: ${candidateProfile.name || "N/A"}
Title: ${candidateProfile.title || "N/A"}
Experience: ${candidateProfile.total_experience_years ?? "?"}yrs
Skills: ${(candidateProfile.skills || []).join(", ") || "N/A"}
Industries: ${(candidateProfile.industries || []).join(", ") || "N/A"}
Summary: ${candidateProfile.summary || "N/A"}`;

  const jdBlock = `TARGET ROLE:
Title: ${jd.title || "N/A"} (${jd.seniority || "N/A"})
Required skills: ${(jd.required_skills || []).join(", ") || "N/A"}
Nice to have: ${(jd.nice_to_have || []).join(", ") || "N/A"}
Min experience: ${jd.min_experience_years ?? "?"}yrs
Summary: ${jd.summary || "N/A"}`;

  return await chatJSON([
    { role: "system", content: GAP_ANALYSIS_PROMPT },
    { role: "user", content: `${profileBlock}\n\n${jdBlock}\n\nPerform a detailed gap analysis. Return JSON.` },
  ], { max_tokens: 1500, temperature: 0.2 });
}

// ── Meta CV Builder ───────────────────────────────────────────────────────────

const META_CV_PROMPT = `You are a career profile assistant. Help a candidate build a structured professional profile from their description.

Return ONLY a valid JSON object:
{
  "name": "Candidate's name if mentioned, else null",
  "title": "Current or desired job title",
  "summary": "3–4 sentence professional summary of this person's background and strengths",
  "skills": ["list of key skills and technologies"],
  "industries": ["industries they have worked in or target"],
  "total_experience_years": <estimated years of experience, 0 if unclear>,
  "preferredRoles": ["2–3 types of roles they are targeting"],
  "education": [{ "degree": "...", "institution": "...", "year": "..." }],
  "experience": [{ "title": "...", "company": "...", "duration": "...", "summary": "..." }]
}

Candidate description:
`;

async function buildMetaCV(description) {
  return await chatJSON([{ role: "user", content: META_CV_PROMPT + description }], { max_tokens: 1200 });
}

// ── Profile Chat ──────────────────────────────────────────────────────────────

const PROFILE_CHAT_SYSTEM = `You are a friendly, encouraging career profile assistant. You help candidates build a structured professional profile through natural conversation.

You always have access to the candidate's current profile state. Update it based on what they tell you — adding new skills, fixing their title, updating experience, etc.

Rules:
- Be warm and conversational, not robotic
- If the profile is mostly empty, ask ONE focused question to fill an important gap
- If the profile is comprehensive, just confirm changes and ask if anything else needs updating
- Always return updated profile JSON, even if unchanged
- Keep messages concise (2–4 sentences max)

Return ONLY a valid JSON object — no markdown, no extra text:
{
  "message": "Your conversational response to the candidate",
  "profile": {
    "name": "...",
    "title": "current or desired job title",
    "summary": "3-4 sentence professional summary",
    "skills": ["skill1", "skill2"],
    "industries": ["industry1"],
    "total_experience_years": <number>,
    "preferredRoles": ["role1", "role2"],
    "education": [{ "degree": "...", "institution": "...", "year": "..." }],
    "experience": [{ "title": "...", "company": "...", "duration": "...", "summary": "..." }]
  }
}`;

async function profileChat(userMessage, history, currentProfile) {
  const profileSnap = JSON.stringify(currentProfile || {}, null, 2);

  // Build messages: system (with current profile), then conversation history, then latest user message
  const messages = [
    { role: "system", content: PROFILE_CHAT_SYSTEM + `\n\nCURRENT PROFILE STATE:\n${profileSnap}` },
    ...history.slice(-10),        // last 5 turns of conversation
    { role: "user", content: userMessage },
  ];

  return await chatJSON(messages, { max_tokens: 1500, temperature: 0.3 });
}

module.exports = { rankCandidates, deepDive, buildJD, matchCandidateToJDs, gapAnalysis, buildMetaCV, profileChat };
