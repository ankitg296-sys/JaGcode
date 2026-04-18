require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const { parseFile, parseCsvRow } = require("./utils/cvParser");
const { rankCandidates, deepDive, buildJD } = require("./utils/ranker");
const { exportCSV, exportPDF } = require("./utils/exporter");
const {
  getCandidates, saveCandidate, deleteCandidate,
  getSavedSearches, saveSavedSearch, deleteSavedSearch,
  getJDs, saveJD, deleteJD,
  ensureDataDir,
} = require("./utils/storage");

const app = express();
const PORT = process.env.PORT || 3000;

ensureDataDir();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ── Multer — CV uploads ───────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".pdf", ".docx", ".csv"].includes(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${ext}`));
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// ── In-memory conversation ────────────────────────────────────────────────────
let conversationHistory = [];

// ── Status ────────────────────────────────────────────────────────────────────
app.get("/api/status", (req, res) => {
  const candidates = getCandidates();
  res.json({
    candidateCount: candidates.length,
    model: process.env.MODEL || "mistralai/mistral-nemo",
    conversationTurns: Math.floor(conversationHistory.length / 2),
    ready: !!process.env.OPENROUTER_API_KEY,
  });
});

// ── Upload CVs (PDF / DOCX) ───────────────────────────────────────────────────
app.post("/api/upload", upload.array("files", 100), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: "No files uploaded." });

  const results = [];
  for (const file of req.files) {
    try {
      console.log(`[Upload] Parsing: ${file.originalname}`);
      const candidate = await parseFile(file.path, file.originalname);
      results.push({ success: true, fileName: file.originalname, candidateId: candidate.id, name: candidate.name });
    } catch (err) {
      console.error(`[Upload] Failed ${file.originalname}: ${err.message}`);
      results.push({ success: false, fileName: file.originalname, error: err.message });
    }
  }

  const parsed = results.filter(r => r.success).length;
  res.json({
    results,
    parsed,
    failed: results.length - parsed,
    candidateCount: getCandidates().length,
    message: `Parsed ${parsed} of ${req.files.length} file(s).`,
  });
});

// ── Delete candidate ──────────────────────────────────────────────────────────
app.delete("/api/candidates/:id", (req, res) => {
  deleteCandidate(req.params.id);
  res.json({ success: true, candidateCount: getCandidates().length });
});

// ── List candidates ───────────────────────────────────────────────────────────
app.get("/api/candidates", (req, res) => {
  const candidates = getCandidates().map(c => ({
    id: c.id, fileName: c.fileName, name: c.name, title: c.title,
    total_experience_years: c.total_experience_years, location: c.location,
    source: c.source, _parsedAt: c._parsedAt,
  }));
  res.json({ candidates });
});

// ── Search / rank ─────────────────────────────────────────────────────────────
app.post("/api/search", async (req, res) => {
  const { query, resetConversation } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: "query is required" });

  const candidates = getCandidates();
  if (!candidates.length) return res.status(400).json({ error: "No candidates loaded. Upload CVs first." });

  if (resetConversation) conversationHistory = [];

  try {
    console.log(`[Search] "${query}" | ${candidates.length} candidates`);
    const ranked = await rankCandidates(candidates, query, conversationHistory);

    conversationHistory.push({ role: "user", content: query });
    conversationHistory.push({ role: "assistant", content: `Ranked ${ranked.length} candidates. Top: ${ranked[0]?.name || "N/A"} (${ranked[0]?.score ?? "N/A"}/100)` });
    if (conversationHistory.length > 8) conversationHistory = conversationHistory.slice(-8);

    res.json({ success: true, query, totalCandidates: candidates.length, results: ranked, conversationTurns: Math.floor(conversationHistory.length / 2) });
  } catch (err) {
    console.error("[Search]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Deep dive ─────────────────────────────────────────────────────────────────
app.post("/api/deepdive", async (req, res) => {
  const { candidateId, question } = req.body;
  if (!candidateId || !question) return res.status(400).json({ error: "candidateId and question are required" });

  const candidate = getCandidates().find(c => c.id === candidateId);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  try {
    const answer = await deepDive(candidate, question);
    res.json({ success: true, candidateName: candidate.name, question, answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Reset conversation ────────────────────────────────────────────────────────
app.post("/api/reset-conversation", (req, res) => {
  conversationHistory = [];
  res.json({ success: true });
});

// ── Saved searches ────────────────────────────────────────────────────────────
app.get("/api/saved-searches", (req, res) => res.json(getSavedSearches()));

app.post("/api/saved-searches", (req, res) => {
  const { name, query, results } = req.body;
  if (!name || !query) return res.status(400).json({ error: "name and query are required" });
  const search = { id: uuidv4(), name, query, results: results || [], createdAt: new Date().toISOString(), lastRunAt: new Date().toISOString() };
  saveSavedSearch(search);
  res.json(search);
});

app.delete("/api/saved-searches/:id", (req, res) => {
  deleteSavedSearch(req.params.id);
  res.json({ success: true });
});

app.post("/api/saved-searches/:id/run", async (req, res) => {
  const searches = getSavedSearches();
  const search = searches.find(s => s.id === req.params.id);
  if (!search) return res.status(404).json({ error: "Saved search not found" });

  const candidates = getCandidates();
  if (!candidates.length) return res.status(400).json({ error: "No candidates loaded." });

  try {
    const ranked = await rankCandidates(candidates, search.query, []);
    search.results = ranked;
    search.lastRunAt = new Date().toISOString();
    saveSavedSearch(search);
    res.json({ success: true, query: search.query, results: ranked, totalCandidates: candidates.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Job Descriptions ──────────────────────────────────────────────────────────
app.get("/api/jds", (req, res) => res.json(getJDs()));

app.post("/api/jds/build", async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: "description is required" });
  try {
    const structured = await buildJD(description);
    const jd = { id: uuidv4(), ...structured, rawDescription: description, createdAt: new Date().toISOString() };
    saveJD(jd);
    res.json(jd);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/jds/:id", (req, res) => {
  deleteJD(req.params.id);
  res.json({ success: true });
});

// ── Export CSV ────────────────────────────────────────────────────────────────
app.post("/api/export/csv", (req, res) => {
  const { results, query } = req.body;
  if (!results?.length) return res.status(400).json({ error: "No results to export" });
  try {
    const tmpFile = exportCSV(results, query);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="talentmatch-shortlist-${Date.now()}.csv"`);
    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on("end", () => { try { fs.unlinkSync(tmpFile); } catch {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Export PDF ────────────────────────────────────────────────────────────────
app.post("/api/export/pdf", (req, res) => {
  const { results, query } = req.body;
  if (!results?.length) return res.status(400).json({ error: "No results to export" });
  exportPDF(results, query, (err, tmpFile) => {
    if (err) return res.status(500).json({ error: err.message });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="talentmatch-report-${Date.now()}.pdf"`);
    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on("end", () => { try { fs.unlinkSync(tmpFile); } catch {} });
  });
});

// ── ATS CSV Import ────────────────────────────────────────────────────────────
app.post("/api/import/csv", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No CSV file uploaded" });

  try {
    const content = fs.readFileSync(req.file.path, "utf8");
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: "CSV file appears empty" });

    const headers = parseCSVLine(lines[0]);
    const imported = [];
    const failed = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      try {
        const values = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => { row[h.trim()] = (values[idx] || "").trim(); });
        const candidate = parseCsvRow(row);
        saveCandidate(candidate);
        imported.push(candidate.name || `Row ${i}`);
      } catch (e) {
        failed.push(`Row ${i}: ${e.message}`);
      }
    }

    try { fs.unlinkSync(req.file.path); } catch {}
    res.json({ success: true, imported: imported.length, failed: failed.length, candidateCount: getCandidates().length, message: `Imported ${imported.length} candidates from CSV.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function parseCSVLine(line) {
  const result = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; }
    else if (c === "," && !inQuotes) { result.push(cur); cur = ""; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

// ── Catch-all ─────────────────────────────────────────────────────────────────
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const candidates = getCandidates();
  console.log(`\n🚀 TalentMatch AI v2 running at http://localhost:${PORT}`);
  console.log(`   Model  : ${process.env.MODEL || "mistralai/mistral-nemo"}`);
  console.log(`   Candidates loaded: ${candidates.length}\n`);
});
