require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const { requireAuth, requireRole, hashPassword, verifyPassword, signToken } = require("./utils/auth");
const { parseFile, parseCsvRow, parseFileOnly } = require("./utils/cvParser");
const { rankCandidates, deepDive, buildJD, matchCandidateToJDs, gapAnalysis, buildMetaCV, profileChat } = require("./utils/ranker");
const { exportCSV, exportPDF } = require("./utils/exporter");
const {
  ensureDataDir,
  getCandidates, saveCandidate, deleteCandidate,
  getSavedSearches, saveSavedSearch, deleteSavedSearch,
  getJDs, saveJD, deleteJD,
  getUserById, getUserByEmail, saveUser,
  getMetaCVs, getMetaCVByUserId, saveMetaCV,
  getPipeline, savePipelineEntry, deletePipelineEntry,
  PIPELINE_STAGES,
} = require("./utils/storage");

const app = express();
const PORT = process.env.PORT || 3000;

ensureDataDir();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ── Multer ────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    [".pdf", ".docx", ".csv"].includes(ext) ? cb(null, true) : cb(new Error(`Unsupported file type: ${ext}`));
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ── In-memory state ───────────────────────────────────────────────────────────
let conversationHistory = [];                      // recruiter search context
const profileChatSessions = new Map();             // userId -> { messages, currentProfile }

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Register
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: "name, email, password, and role are required." });
  if (!["recruiter", "candidate"].includes(role)) return res.status(400).json({ error: "role must be 'recruiter' or 'candidate'." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (getUserByEmail(email)) return res.status(409).json({ error: "An account with this email already exists." });

  try {
    const user = {
      id: uuidv4(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: await hashPassword(password),
      role,
      createdAt: new Date().toISOString(),
    };
    saveUser(user);

    const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password are required." });

  const user = getUserByEmail(email);
  if (!user) return res.status(401).json({ error: "Invalid email or password." });

  try {
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid email or password." });

    const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Who am I
app.get("/api/me", requireAuth, (req, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/api/status", requireAuth, (req, res) => {
  res.json({
    candidateCount: getCandidates().length,
    jdCount: getJDs().length,
    model: process.env.MODEL || "mistralai/mistral-nemo",
    conversationTurns: Math.floor(conversationHistory.length / 2),
    ready: !!process.env.OPENROUTER_API_KEY,
    user: req.user,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RECRUITER ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Upload CVs
app.post("/api/upload", requireAuth, requireRole("recruiter"), upload.array("files", 100), async (req, res) => {
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
  res.json({ results, parsed, failed: results.length - parsed, candidateCount: getCandidates().length });
});

// List candidates
app.get("/api/candidates", requireAuth, requireRole("recruiter"), (req, res) => {
  const candidates = getCandidates().map(c => ({
    id: c.id, fileName: c.fileName, name: c.name, title: c.title,
    total_experience_years: c.total_experience_years, location: c.location,
    source: c.source, _parsedAt: c._parsedAt,
  }));
  res.json({ candidates });
});

// Delete candidate
app.delete("/api/candidates/:id", requireAuth, requireRole("recruiter"), (req, res) => {
  deleteCandidate(req.params.id);
  res.json({ success: true, candidateCount: getCandidates().length });
});

// Search / rank
app.post("/api/search", requireAuth, requireRole("recruiter"), async (req, res) => {
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

// Deep dive
app.post("/api/deepdive", requireAuth, requireRole("recruiter"), async (req, res) => {
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

// Reset conversation
app.post("/api/reset-conversation", requireAuth, requireRole("recruiter"), (req, res) => {
  conversationHistory = [];
  res.json({ success: true });
});

// ── Saved Searches ────────────────────────────────────────────────────────────
app.get("/api/saved-searches", requireAuth, requireRole("recruiter"), (req, res) => res.json(getSavedSearches()));

app.post("/api/saved-searches", requireAuth, requireRole("recruiter"), (req, res) => {
  const { name, query, results } = req.body;
  if (!name || !query) return res.status(400).json({ error: "name and query are required" });
  const search = { id: uuidv4(), name, query, results: results || [], createdAt: new Date().toISOString(), lastRunAt: new Date().toISOString() };
  saveSavedSearch(search);
  res.json(search);
});

app.delete("/api/saved-searches/:id", requireAuth, requireRole("recruiter"), (req, res) => {
  deleteSavedSearch(req.params.id);
  res.json({ success: true });
});

app.post("/api/saved-searches/:id/run", requireAuth, requireRole("recruiter"), async (req, res) => {
  const search = getSavedSearches().find(s => s.id === req.params.id);
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
app.get("/api/jds", requireAuth, (req, res) => res.json(getJDs())); // both roles can view JDs

app.post("/api/jds/build", requireAuth, requireRole("recruiter"), async (req, res) => {
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

app.delete("/api/jds/:id", requireAuth, requireRole("recruiter"), (req, res) => {
  deleteJD(req.params.id);
  res.json({ success: true });
});

// ── Export CSV ────────────────────────────────────────────────────────────────
app.post("/api/export/csv", requireAuth, requireRole("recruiter"), (req, res) => {
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
app.post("/api/export/pdf", requireAuth, requireRole("recruiter"), (req, res) => {
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
app.post("/api/import/csv", requireAuth, requireRole("recruiter"), upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No CSV file uploaded" });

  try {
    const content = fs.readFileSync(req.file.path, "utf8");
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: "CSV file appears empty" });

    const headers = parseCSVLine(lines[0]);
    const imported = [], failed = [];

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
    res.json({ success: true, imported: imported.length, failed: failed.length, candidateCount: getCandidates().length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Pipeline (Recruiter Kanban) ───────────────────────────────────────────────
app.get("/api/pipeline", requireAuth, requireRole("recruiter"), (req, res) => {
  res.json({ pipeline: getPipeline(), stages: PIPELINE_STAGES });
});

app.post("/api/pipeline", requireAuth, requireRole("recruiter"), (req, res) => {
  const { candidateId, jdId, stage, notes } = req.body;
  if (!candidateId || !stage) return res.status(400).json({ error: "candidateId and stage are required" });
  if (!PIPELINE_STAGES.includes(stage)) return res.status(400).json({ error: `stage must be one of: ${PIPELINE_STAGES.join(", ")}` });

  const entry = {
    id: uuidv4(),
    candidateId,
    jdId: jdId || null,
    stage,
    notes: notes || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  savePipelineEntry(entry);
  res.json(entry);
});

app.patch("/api/pipeline/:id", requireAuth, requireRole("recruiter"), (req, res) => {
  const pipeline = getPipeline();
  const entry = pipeline.find(p => p.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Pipeline entry not found" });

  const { stage, notes } = req.body;
  if (stage && !PIPELINE_STAGES.includes(stage)) return res.status(400).json({ error: `stage must be one of: ${PIPELINE_STAGES.join(", ")}` });

  if (stage) entry.stage = stage;
  if (notes !== undefined) entry.notes = notes;
  entry.updatedAt = new Date().toISOString();

  savePipelineEntry(entry);
  res.json(entry);
});

app.delete("/api/pipeline/:id", requireAuth, requireRole("recruiter"), (req, res) => {
  deletePipelineEntry(req.params.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CANDIDATE ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Get my Meta CV profile
app.get("/api/meta-cvs/me", requireAuth, requireRole("candidate"), (req, res) => {
  const metaCV = getMetaCVByUserId(req.user.id);
  res.json({ metaCV: metaCV || null });
});

// Save / update my Meta CV
app.put("/api/meta-cvs/me", requireAuth, requireRole("candidate"), (req, res) => {
  const data = req.body;
  if (!data) return res.status(400).json({ error: "Profile data is required" });

  const metaCV = {
    userId: req.user.id,
    name: data.name || req.user.name,
    ...data,
    updatedAt: new Date().toISOString(),
  };
  saveMetaCV(metaCV);
  res.json({ success: true, metaCV });
});

// Build Meta CV from plain English description
app.post("/api/meta-cvs/build", requireAuth, requireRole("candidate"), async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: "description is required" });

  try {
    const structured = await buildMetaCV(description);
    const metaCV = {
      userId: req.user.id,
      name: structured.name || req.user.name,
      ...structured,
      updatedAt: new Date().toISOString(),
    };
    saveMetaCV(metaCV);
    res.json({ success: true, metaCV });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Match my profile against all JDs
app.get("/api/match/me-to-jds", requireAuth, requireRole("candidate"), async (req, res) => {
  const metaCV = getMetaCVByUserId(req.user.id);
  if (!metaCV) return res.status(400).json({ error: "No profile found. Build your profile first." });

  const jds = getJDs();
  if (!jds.length) return res.status(400).json({ error: "No job descriptions available yet. Check back later." });

  try {
    console.log(`[Match] Candidate ${req.user.name} vs ${jds.length} JDs`);
    const matches = await matchCandidateToJDs(metaCV, jds);
    res.json({ success: true, matches, totalJDs: jds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gap analysis for my profile vs a specific JD
app.get("/api/gap-analysis/:jdId", requireAuth, requireRole("candidate"), async (req, res) => {
  const metaCV = getMetaCVByUserId(req.user.id);
  if (!metaCV) return res.status(400).json({ error: "No profile found. Build your profile first." });

  const jds = getJDs();
  const jd = jds.find(j => j.id === req.params.jdId);
  if (!jd) return res.status(404).json({ error: "Job description not found" });

  try {
    console.log(`[Gap] ${req.user.name} vs JD: ${jd.title}`);
    const analysis = await gapAnalysis(metaCV, jd);
    res.json({ success: true, candidate: req.user.name, jdTitle: jd.title, analysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Candidate: upload their own CV for profile building ───────────────────────
app.post("/api/candidate/upload-cv", requireAuth, requireRole("candidate"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });

  try {
    console.log(`[Profile] Parsing CV for candidate: ${req.user.name}`);
    const { rawText, structured } = await parseFileOnly(req.file.path);
    try { fs.unlinkSync(req.file.path); } catch {}

    const metaCV = {
      userId: req.user.id,
      name: structured.name || req.user.name,
      ...structured,
      updatedAt: new Date().toISOString(),
    };
    saveMetaCV(metaCV);

    // Build a readable summary for the chat init message
    const skills = (structured.skills || []).slice(0, 5).join(", ");
    const exp = structured.total_experience_years ? `${structured.total_experience_years} years of experience` : "";
    const roles = (structured.experience || []).slice(0, 2).map(e => `${e.title} at ${e.company}`).join(", ");
    const initMessage = `I've read your CV! Here's what I found:\n\n**${structured.name || req.user.name}** — ${structured.title || "Professional"}\n${[exp, skills ? `Skills: ${skills}` : ""].filter(Boolean).join(" · ")}\n${roles ? `Recent roles: ${roles}` : ""}\n\nDoes everything look right? You can tell me what to update, or ask me to add missing experience, skills, or anything else.`;

    // Reset / init chat session for this candidate
    profileChatSessions.set(req.user.id, {
      messages: [{ role: "assistant", content: initMessage }],
      currentProfile: metaCV,
    });

    res.json({ success: true, metaCV, initMessage });
  } catch (err) {
    console.error("[Profile CV]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Candidate: profile building chat ─────────────────────────────────────────
app.post("/api/candidate/chat", requireAuth, requireRole("candidate"), async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "message is required" });

  // Get or initialise session
  let session = profileChatSessions.get(req.user.id);
  if (!session) {
    const existingProfile = getMetaCVByUserId(req.user.id) || { userId: req.user.id, name: req.user.name };
    session = { messages: [], currentProfile: existingProfile };
    profileChatSessions.set(req.user.id, session);
  }

  // Append the user message to history before calling the AI
  session.messages.push({ role: "user", content: message });

  try {
    // Call AI — pass history without the latest user message (we pass it as userMessage param)
    const result = await profileChat(message, session.messages.slice(0, -1), session.currentProfile);

    const aiMessage = result.message || "Got it! Is there anything else you'd like to update?";
    session.messages.push({ role: "assistant", content: aiMessage });

    // Merge profile updates
    if (result.profile) {
      session.currentProfile = {
        ...session.currentProfile,
        ...result.profile,
        userId: req.user.id,
        updatedAt: new Date().toISOString(),
      };
      saveMetaCV(session.currentProfile);
    }

    // Keep session history bounded
    if (session.messages.length > 30) session.messages = session.messages.slice(-30);

    res.json({ success: true, message: aiMessage, profile: session.currentProfile });
  } catch (err) {
    console.error("[Profile Chat]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Candidate: download their profile as a PDF ───────────────────────────────
app.get("/api/candidate/download-profile", requireAuth, requireRole("candidate"), (req, res) => {
  const metaCV = getMetaCVByUserId(req.user.id);
  if (!metaCV) return res.status(400).json({ error: "No profile found. Build your profile first." });

  const PDFDocument = require("pdfkit");
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  const safeName = (metaCV.name || "profile").replace(/[^a-zA-Z0-9 ]/g, "_");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}-TalentMatch-Profile.pdf"`);
  doc.pipe(res);

  const C = {
    accent: "#6366f1", success: "#10b981", muted: "#64748b",
    text: "#1e293b", border: "#e2e8f0", bg: "#0f1117",
  };

  // ── Header band ──────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 90).fill(C.bg);
  doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold")
    .text(metaCV.name || "Candidate Profile", 50, 26);
  doc.fillColor(C.accent).fontSize(12).font("Helvetica")
    .text(metaCV.title || "", 50, 54);

  const contactParts = [metaCV.email, metaCV.phone, metaCV.location].filter(Boolean);
  if (contactParts.length) {
    doc.fillColor("#94a3b8").fontSize(9).text(contactParts.join("   ·   "), 50, 72);
  }

  // TalentMatch watermark
  doc.fillColor("#94a3b8").fontSize(8).font("Helvetica")
    .text("TalentMatch AI Profile", 0, 76, { align: "right", width: doc.page.width - 50 });

  doc.y = 110;

  // ── Helper: section heading ───────────────────────────────────────────────
  const sectionHead = (title) => {
    doc.moveDown(0.5);
    doc.fillColor(C.accent).fontSize(9).font("Helvetica-Bold")
      .text(title.toUpperCase(), 50, doc.y, { characterSpacing: 1 });
    doc.moveDown(0.2);
    doc.rect(50, doc.y, doc.page.width - 100, 1).fill(C.border);
    doc.moveDown(0.6);
    doc.fillColor(C.text).font("Helvetica").fontSize(10);
  };

  // ── Summary ───────────────────────────────────────────────────────────────
  if (metaCV.summary) {
    sectionHead("Professional Summary");
    doc.fillColor(C.text).fontSize(10).font("Helvetica")
      .text(metaCV.summary, 50, doc.y, { width: doc.page.width - 100, lineGap: 3 });
    doc.moveDown(0.5);
  }

  // ── Experience ────────────────────────────────────────────────────────────
  if (metaCV.experience?.length) {
    sectionHead("Experience");
    metaCV.experience.forEach(e => {
      doc.fillColor(C.text).fontSize(10.5).font("Helvetica-Bold").text(e.title || "Role", 50, doc.y);
      doc.fillColor(C.muted).fontSize(9.5).font("Helvetica")
        .text([e.company, e.duration].filter(Boolean).join("  ·  "), 50, doc.y);
      if (e.summary) {
        doc.fillColor(C.text).fontSize(9.5).text(e.summary, 50, doc.y, { width: doc.page.width - 100, lineGap: 2 });
      }
      doc.moveDown(0.6);
    });
  }

  // ── Education ─────────────────────────────────────────────────────────────
  if (metaCV.education?.length) {
    sectionHead("Education");
    metaCV.education.forEach(e => {
      doc.fillColor(C.text).fontSize(10.5).font("Helvetica-Bold").text(e.degree || "Degree", 50, doc.y);
      doc.fillColor(C.muted).fontSize(9.5).font("Helvetica")
        .text([e.institution, e.year].filter(Boolean).join("  ·  "), 50, doc.y);
      doc.moveDown(0.5);
    });
  }

  // ── Skills ────────────────────────────────────────────────────────────────
  if (metaCV.skills?.length) {
    sectionHead("Skills");
    doc.fillColor(C.text).fontSize(10).font("Helvetica")
      .text(metaCV.skills.join("   ·   "), 50, doc.y, { width: doc.page.width - 100, lineGap: 4 });
    doc.moveDown(0.5);
  }

  // ── Industries & Target Roles ─────────────────────────────────────────────
  const hasTwoCol = metaCV.industries?.length && metaCV.preferredRoles?.length;
  if (hasTwoCol) {
    sectionHead("Industries & Target Roles");
    const half = (doc.page.width - 100) / 2 - 10;
    const startY = doc.y;
    doc.fillColor(C.accent).fontSize(8).font("Helvetica-Bold").text("INDUSTRIES", 50, startY);
    doc.fillColor(C.text).fontSize(10).font("Helvetica")
      .text(metaCV.industries.join(", "), 50, doc.y, { width: half, lineGap: 3 });
    const rightX = 50 + half + 20;
    doc.fillColor(C.accent).fontSize(8).font("Helvetica-Bold").text("TARGET ROLES", rightX, startY);
    doc.fillColor(C.text).fontSize(10).font("Helvetica")
      .text(metaCV.preferredRoles.join(", "), rightX, startY + 12, { width: half, lineGap: 3 });
  } else if (metaCV.industries?.length) {
    sectionHead("Industries");
    doc.fillColor(C.text).fontSize(10).text(metaCV.industries.join(", "), 50, doc.y, { width: doc.page.width - 100 });
  } else if (metaCV.preferredRoles?.length) {
    sectionHead("Target Roles");
    doc.fillColor(C.text).fontSize(10).text(metaCV.preferredRoles.join(", "), 50, doc.y, { width: doc.page.width - 100 });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.moveDown(2);
  doc.fillColor(C.muted).fontSize(8)
    .text(`Generated by TalentMatch AI · ${new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`,
      50, doc.y, { align: "center", width: doc.page.width - 100 });

  doc.end();
});

// ── Catch-all ─────────────────────────────────────────────────────────────────
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 TalentMatch AI v3 running at http://localhost:${PORT}`);
  console.log(`   Model  : ${process.env.MODEL || "mistralai/mistral-nemo"}`);
  console.log(`   Candidates: ${getCandidates().length} | JDs: ${getJDs().length}\n`);
});

// ── Helper ────────────────────────────────────────────────────────────────────
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
