const { chat, chatJSON } = require("./openrouter");
const { preFilter } = require("./preFilter");

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

  // Pre-filter for scale — skipped automatically if count <= threshold
  const candidates = preFilter(allCandidates, query);

  const summaries = candidates.map(buildSummary).join("\n\n---\n\n");
  const history = conversationHistory.slice(-8);
  const historyBlock = history.length
    ? "\n\nPrior context:\n" + history.map(m => `${m.role === "user" ? "HM" : "AI"}: ${m.content}`).join("\n")
    : "";

  const userMsg = `CANDIDATES (${candidates.length} of ${allCandidates.length} total):\n\n${summaries}${historyBlock}\n\nREQUIREMENT: "${query}"\n\nRank all ${candidates.length} candidates. Return JSON array.`;

  const ranked = await chatJSON(
    [{ role: "system", content: RANKING_SYSTEM_PROMPT }, { role: "user", content: userMsg }],
    { max_tokens: 2000 }
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

const DEEPDIVE_SYSTEM = `You are a recruiting assistant. Answer questions about the candidate using only their CV. Be concise and cite specific details. If the answer isn't in the CV, say so.`;

async function deepDive(candidate, question) {
  if (!candidate.rawText) throw new Error("Raw CV text not available for this candidate.");
  return await chat(
    [{ role: "system", content: DEEPDIVE_SYSTEM }, { role: "user", content: `CV:\n${candidate.rawText}\n\nQ: ${question}` }],
    { max_tokens: 800, temperature: 0.3 }
  );
}

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

module.exports = { rankCandidates, deepDive, buildJD };
