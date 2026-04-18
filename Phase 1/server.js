require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const { ingestFolder, loadCachedCandidates } = require("./utils/cvParser");
const { rankCandidates, deepDive } = require("./utils/ranker");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ─── In-memory state ──────────────────────────────────────────────────────────

let candidates = [];
let conversationHistory = [];

// Load any previously cached candidates on startup
(function init() {
  try {
    candidates = loadCachedCandidates();
    if (candidates.length > 0) {
      console.log(`[Init] Loaded ${candidates.length} cached candidate(s).`);
    }
  } catch (e) {
    console.warn("[Init] No cache found — ingest CVs to get started.");
  }
})();

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/status
 * Returns current system status: candidate count, model, CV folder.
 */
app.get("/api/status", (req, res) => {
  res.json({
    candidateCount: candidates.length,
    model: process.env.MODEL || "mistralai/mistral-nemo",
    cvFolder: process.env.CV_FOLDER || "(not set)",
    conversationTurns: Math.floor(conversationHistory.length / 2),
    ready: !!process.env.OPENROUTER_API_KEY,
  });
});

/**
 * POST /api/ingest
 * Parses all CVs in the configured folder and caches structured data.
 * Body: { folderPath?: string }  (falls back to CV_FOLDER env var)
 */
app.post("/api/ingest", async (req, res) => {
  const folderPath = req.body.folderPath || process.env.CV_FOLDER;

  if (!folderPath) {
    return res.status(400).json({
      error: "No folder path provided. Set CV_FOLDER in .env or pass folderPath in request body.",
    });
  }

  try {
    console.log(`[Ingest] Starting ingestion from: ${folderPath}`);
    const { candidates: parsed, stats } = await ingestFolder(folderPath);
    candidates = parsed;
    conversationHistory = []; // Reset conversation on new ingest

    res.json({
      success: true,
      stats,
      candidateCount: candidates.length,
      message: `Ingested ${stats.parsed} new CV(s). ${stats.cached} from cache. ${stats.failed} failed. ${stats.skipped} skipped.`,
    });
  } catch (err) {
    console.error("[Ingest] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/search
 * Ranks candidates against a natural language query.
 * Body: { query: string, resetConversation?: boolean }
 */
app.post("/api/search", async (req, res) => {
  const { query, resetConversation } = req.body;

  if (!query || !query.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  if (candidates.length === 0) {
    return res.status(400).json({
      error: "No candidates loaded. Please ingest CVs first.",
    });
  }

  if (resetConversation) {
    conversationHistory = [];
  }

  try {
    console.log(`[Search] Query: "${query}" | Candidates: ${candidates.length}`);
    const ranked = await rankCandidates(candidates, query, conversationHistory);

    // Update conversation history (keep last 8 messages = 4 turns)
    conversationHistory.push({ role: "user", content: query });
    conversationHistory.push({
      role: "assistant",
      content: `Ranked ${ranked.length} candidates. Top result: ${ranked[0]?.name || "N/A"} (Score: ${ranked[0]?.score ?? "N/A"})`,
    });
    if (conversationHistory.length > 8) {
      conversationHistory = conversationHistory.slice(-8);
    }

    res.json({
      success: true,
      query,
      totalCandidates: candidates.length,
      results: ranked,
      conversationTurns: Math.floor(conversationHistory.length / 2),
    });
  } catch (err) {
    console.error("[Search] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/deepdive
 * Q&A about a specific candidate using their full CV text.
 * Body: { candidateId: string, question: string }
 */
app.post("/api/deepdive", async (req, res) => {
  const { candidateId, question } = req.body;

  if (!candidateId || !question) {
    return res.status(400).json({ error: "candidateId and question are required" });
  }

  const candidate = candidates.find((c) => c.id === candidateId);
  if (!candidate) {
    return res.status(404).json({ error: `Candidate not found: ${candidateId}` });
  }

  try {
    console.log(`[DeepDive] Candidate: ${candidate.name} | Q: "${question}"`);
    const answer = await deepDive(candidate, question);
    res.json({ success: true, candidateName: candidate.name, question, answer });
  } catch (err) {
    console.error("[DeepDive] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/reset-conversation
 * Clears conversation history for a fresh search session.
 */
app.post("/api/reset-conversation", (req, res) => {
  conversationHistory = [];
  res.json({ success: true, message: "Conversation history cleared." });
});

// ─── Serve frontend ───────────────────────────────────────────────────────────

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 TalentMatch AI running at http://localhost:${PORT}`);
  console.log(`   Model: ${process.env.MODEL || "mistralai/mistral-nemo"}`);
  console.log(`   CV Folder: ${process.env.CV_FOLDER || "(set CV_FOLDER in .env)"}`);
  console.log(`   Candidates loaded: ${candidates.length}\n`);
});
