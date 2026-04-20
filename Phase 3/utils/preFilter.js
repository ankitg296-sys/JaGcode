/**
 * TF-IDF pre-filter for scaling to large CV databases.
 * When candidates > DIRECT_RANK_THRESHOLD, this module pre-selects
 * the top-N most relevant candidates before passing to the LLM ranker.
 * Zero API calls, zero dependencies — pure JS.
 */

const DIRECT_RANK_THRESHOLD = 30;
const PRE_FILTER_TOP_N = 25;

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "is","are","was","were","be","been","being","have","has","had","do","does",
  "did","will","would","could","should","may","might","shall","can","need",
  "i","you","he","she","it","we","they","me","him","her","us","them",
  "this","that","these","those","what","which","who","how","when","where",
  "experience","years","year","work","worked","working","role","position",
  "skills","ability","strong","good","excellent","including","also","etc",
]);

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s+#]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

function buildCandidateText(c) {
  return [
    c.title || "",
    c.summary || "",
    (c.skills || []).join(" "),
    (c.industries || []).join(" "),
    (c.experience || []).map(e => `${e.title} ${e.company} ${e.summary || ""}`).join(" "),
  ].join(" ");
}

function score(candidateText, queryTokens, idfMap) {
  const docTokens = tokenize(candidateText);
  const docFreq = {};
  docTokens.forEach(t => { docFreq[t] = (docFreq[t] || 0) + 1; });

  let total = 0;
  queryTokens.forEach(qt => {
    const tf = (docFreq[qt] || 0) / (docTokens.length || 1);
    const idf = idfMap[qt] || 1;
    total += tf * idf;
  });
  return total;
}

function preFilter(candidates, query) {
  if (candidates.length <= DIRECT_RANK_THRESHOLD) return candidates;

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return candidates.slice(0, PRE_FILTER_TOP_N);

  const docCount = candidates.length;
  const termDocCount = {};
  candidates.forEach(c => {
    const tokens = new Set(tokenize(buildCandidateText(c)));
    tokens.forEach(t => { termDocCount[t] = (termDocCount[t] || 0) + 1; });
  });
  const idfMap = {};
  queryTokens.forEach(qt => {
    idfMap[qt] = Math.log((docCount + 1) / ((termDocCount[qt] || 0) + 1)) + 1;
  });

  const scored = candidates.map(c => ({
    candidate: c,
    score: score(buildCandidateText(c), queryTokens, idfMap),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, PRE_FILTER_TOP_N).map(s => s.candidate);
}

module.exports = { preFilter, DIRECT_RANK_THRESHOLD };
