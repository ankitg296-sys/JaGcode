const { chat, chatJSON } = require("./openrouter");

// ─── Compact candidate summary for ranking prompt ─────────────────────────────

function buildCandidateSummary(candidate, index) {
  const skills = (candidate.skills || []).slice(0, 15).join(", ");
  const industries = (candidate.industries || []).join(", ");
  const exp = (candidate.experience || [])
    .slice(0, 3)
    .map((e) => `${e.title} @ ${e.company} (${e.duration || ""})`)
    .join(" | ");

  return `[${index + 1}] ${candidate.name || candidate.fileName}
Title: ${candidate.title || "N/A"} | Experience: ${candidate.total_experience_years ?? "?"}yrs | Location: ${candidate.location || "N/A"}
Skills: ${skills || "N/A"}
Industries: ${industries || "N/A"}
Recent roles: ${exp || "N/A"}
Summary: ${candidate.summary || "N/A"}`;
}

// ─── Ranking ──────────────────────────────────────────────────────────────────

const RANKING_SYSTEM_PROMPT = `You are an expert talent acquisition specialist. You rank candidates for a hiring manager based on how well they match a given job requirement.

For each candidate, provide:
- score: integer 0–100 (100 = perfect match)
- verdict: one of "Strong Match", "Good Match", "Partial Match", "Weak Match"
- match_reasons: array of 2–3 short bullet points explaining why they fit
- gaps: array of 1–2 short bullet points on what's missing (empty array if none)

Scoring guide:
- 85–100: Strong Match — meets all key requirements, possibly exceeds
- 65–84: Good Match — meets most requirements, minor gaps
- 40–64: Partial Match — meets some requirements, notable gaps
- 0–39: Weak Match — significant mismatch

Return ONLY a valid JSON array — one object per candidate in the same order as given:
[
  {
    "index": 1,
    "name": "Candidate Name",
    "score": 85,
    "verdict": "Strong Match",
    "match_reasons": ["reason 1", "reason 2"],
    "gaps": ["gap 1"]
  },
  ...
]`;

/**
 * Rank candidates against a requirement query.
 * @param {Array} candidates - Parsed candidate objects
 * @param {string} query - Hiring manager's natural language requirement
 * @param {Array} conversationHistory - Prior turns [{role, content}]
 * @returns {Array} - Sorted ranked candidates with scores
 */
async function rankCandidates(candidates, query, conversationHistory = []) {
  if (!candidates || candidates.length === 0) {
    throw new Error("No candidates to rank. Please ingest CVs first.");
  }

  // Build candidate summaries block
  const summariesBlock = candidates
    .map((c, i) => buildCandidateSummary(c, i))
    .join("\n\n---\n\n");

  // Build conversation context string (last 4 turns)
  const recentHistory = conversationHistory.slice(-8); // 4 user+assistant pairs
  const historyBlock =
    recentHistory.length > 0
      ? "\n\nPrevious conversation context:\n" +
        recentHistory
          .map((m) => `${m.role === "user" ? "Hiring Manager" : "AI"}: ${m.content}`)
          .join("\n")
      : "";

  const userMessage = `CANDIDATES (${candidates.length} total):

${summariesBlock}

${historyBlock ? historyBlock + "\n\n" : ""}CURRENT REQUIREMENT:
"${query}"

Rank ALL ${candidates.length} candidates against this requirement. Return the JSON array.`;

  const messages = [
    { role: "system", content: RANKING_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  let ranked;
  try {
    ranked = await chatJSON(messages, { max_tokens: 2000, temperature: 0 });
  } catch (err) {
    throw new Error(`Ranking failed: ${err.message}`);
  }

  if (!Array.isArray(ranked)) {
    throw new Error("Ranking returned unexpected format");
  }

  // Merge ranking data back into candidate objects and sort by score
  const enriched = ranked
    .map((r) => {
      const candidate = candidates[r.index - 1];
      if (!candidate) return null;
      return {
        ...candidate,
        score: r.score ?? 0,
        verdict: r.verdict ?? "Weak Match",
        match_reasons: r.match_reasons ?? [],
        gaps: r.gaps ?? [],
        // Strip rawText from search results (kept only for deep-dive)
        rawText: undefined,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return enriched;
}

// ─── Deep-dive Q&A ────────────────────────────────────────────────────────────

const DEEPDIVE_SYSTEM_PROMPT = `You are a helpful recruiting assistant. Answer questions about the candidate below based solely on their CV. Be concise, factual, and cite specific details from the CV when relevant. If the answer is not in the CV, say so clearly.`;

/**
 * Answer a specific question about a single candidate using their raw CV.
 * @param {Object} candidate - Candidate object with rawText
 * @param {string} question - The hiring manager's question
 * @returns {string} - AI answer
 */
async function deepDive(candidate, question) {
  if (!candidate.rawText) {
    throw new Error("Raw CV text not available for this candidate.");
  }

  const messages = [
    { role: "system", content: DEEPDIVE_SYSTEM_PROMPT },
    {
      role: "user",
      content: `CANDIDATE CV:\n${candidate.rawText}\n\nQUESTION: ${question}`,
    },
  ];

  return await chat(messages, { max_tokens: 800, temperature: 0.3 });
}

module.exports = { rankCandidates, deepDive };
