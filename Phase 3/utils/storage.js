const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");

const PATHS = {
  candidates:    path.join(DATA_DIR, "candidates.json"),
  savedSearches: path.join(DATA_DIR, "saved-searches.json"),
  jds:           path.join(DATA_DIR, "jds.json"),
  users:         path.join(DATA_DIR, "users.json"),
  metaCVs:       path.join(DATA_DIR, "meta-cvs.json"),
  pipeline:      path.join(DATA_DIR, "pipeline.json"),
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const uploadsDir = path.join(__dirname, "../uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
}

function read(key) {
  ensureDataDir();
  const p = PATHS[key];
  if (!fs.existsSync(p)) return ["candidates", "users", "metaCVs"].includes(key) ? {} : [];
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return ["candidates", "users", "metaCVs"].includes(key) ? {} : []; }
}

function write(key, data) {
  ensureDataDir();
  fs.writeFileSync(PATHS[key], JSON.stringify(data, null, 2), "utf8");
}

// ── Users ─────────────────────────────────────────────────────────────────────

function getUsers() {
  return read("users");
}

function getUserById(id) {
  return read("users")[id] || null;
}

function getUserByEmail(email) {
  const users = read("users");
  return Object.values(users).find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

function saveUser(user) {
  const users = read("users");
  users[user.id] = user;
  write("users", users);
}

// ── Candidates ────────────────────────────────────────────────────────────────

function getCandidates() {
  return Object.values(read("candidates"));
}

function saveCandidate(candidate) {
  const cache = read("candidates");
  cache[candidate.id] = candidate;
  write("candidates", cache);
}

function deleteCandidate(id) {
  const cache = read("candidates");
  delete cache[id];
  write("candidates", cache);
  const uploadsDir = path.join(__dirname, "../uploads");
  if (fs.existsSync(uploadsDir)) {
    fs.readdirSync(uploadsDir).forEach(f => {
      if (f.startsWith(id.split("::")[0].replace(/[^a-zA-Z0-9]/g, "_"))) {
        try { fs.unlinkSync(path.join(uploadsDir, f)); } catch {}
      }
    });
  }
}

function candidateExists(id) {
  return !!read("candidates")[id];
}

// ── Saved Searches ────────────────────────────────────────────────────────────

function getSavedSearches() { return read("savedSearches"); }

function saveSavedSearch(search) {
  const searches = read("savedSearches");
  const idx = searches.findIndex(s => s.id === search.id);
  if (idx >= 0) searches[idx] = search; else searches.unshift(search);
  write("savedSearches", searches);
}

function deleteSavedSearch(id) {
  write("savedSearches", read("savedSearches").filter(s => s.id !== id));
}

// ── Job Descriptions ──────────────────────────────────────────────────────────

function getJDs() { return read("jds"); }

function saveJD(jd) {
  const jds = read("jds");
  const idx = jds.findIndex(j => j.id === jd.id);
  if (idx >= 0) jds[idx] = jd; else jds.unshift(jd);
  write("jds", jds);
}

function deleteJD(id) {
  write("jds", read("jds").filter(j => j.id !== id));
}

// ── Meta CVs (candidate profiles) ────────────────────────────────────────────

function getMetaCVs() {
  return read("metaCVs");
}

function getMetaCVByUserId(userId) {
  return read("metaCVs")[userId] || null;
}

function saveMetaCV(metaCV) {
  const metaCVs = read("metaCVs");
  metaCVs[metaCV.userId] = metaCV;
  write("metaCVs", metaCVs);
}

// ── Pipeline (recruiter kanban) ───────────────────────────────────────────────

const PIPELINE_STAGES = ["applied", "screening", "interview", "offer", "hired", "rejected"];

function getPipeline() { return read("pipeline"); }

function savePipelineEntry(entry) {
  const pipeline = read("pipeline");
  const idx = pipeline.findIndex(p => p.id === entry.id);
  if (idx >= 0) pipeline[idx] = entry; else pipeline.unshift(entry);
  write("pipeline", pipeline);
}

function deletePipelineEntry(id) {
  write("pipeline", read("pipeline").filter(p => p.id !== id));
}

module.exports = {
  ensureDataDir,
  // Users
  getUsers, getUserById, getUserByEmail, saveUser,
  // Candidates
  getCandidates, saveCandidate, deleteCandidate, candidateExists,
  // Saved Searches
  getSavedSearches, saveSavedSearch, deleteSavedSearch,
  // JDs
  getJDs, saveJD, deleteJD,
  // Meta CVs
  getMetaCVs, getMetaCVByUserId, saveMetaCV,
  // Pipeline
  getPipeline, savePipelineEntry, deletePipelineEntry,
  PIPELINE_STAGES,
};
