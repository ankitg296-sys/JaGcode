const fs = require("fs");
const path = require("path");
const { chatJSON } = require("./openrouter");

const CACHE_PATH = path.join(__dirname, "../data/cv-cache.json");

// ─── Cache helpers ────────────────────────────────────────────────────────────

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

// ─── Raw text extraction ──────────────────────────────────────────────────────

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    const pdfParse = require("pdf-parse");
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (ext === ".docx") {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

// ─── LLM structured extraction ────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a CV parsing assistant. Extract structured information from the CV text below.

Return ONLY a valid JSON object with these exact fields (no extra text, no markdown):
{
  "name": "Full name of the candidate",
  "title": "Current or most recent job title",
  "email": "Email address if present, else null",
  "phone": "Phone number if present, else null",
  "location": "City, Country if present, else null",
  "total_experience_years": <number, estimated years of work experience, 0 if unknown>,
  "current_company": "Current or most recent employer, else null",
  "skills": ["list", "of", "key", "skills", "technologies", "tools"],
  "industries": ["list", "of", "industries", "worked", "in"],
  "education": [
    { "degree": "Degree name", "institution": "Institution name", "year": "Year or range" }
  ],
  "experience": [
    {
      "title": "Job title",
      "company": "Company name",
      "duration": "e.g. 2020–2023",
      "summary": "1–2 sentence summary of role and key achievements"
    }
  ],
  "summary": "A 3–4 sentence professional summary capturing this person's core strengths, experience level, key skills, and what types of roles they're suited for."
}

CV TEXT:
`;

async function extractStructured(rawText) {
  // Truncate very long CVs to avoid token limits
  const truncated = rawText.slice(0, 6000);

  const messages = [
    {
      role: "user",
      content: EXTRACTION_PROMPT + truncated,
    },
  ];

  return await chatJSON(messages, { max_tokens: 1500 });
}

// ─── Main ingest function ─────────────────────────────────────────────────────

/**
 * Ingest all CVs in the given folder.
 * Uses cache — already-parsed CVs are not re-processed.
 * @param {string} folderPath - Absolute path to folder containing CV files
 * @returns {{ candidates: Array, stats: Object }}
 */
async function ingestFolder(folderPath) {
  if (!fs.existsSync(folderPath)) {
    throw new Error(`CV folder not found: ${folderPath}`);
  }

  const cache = loadCache();
  const results = [];
  const stats = { total: 0, cached: 0, parsed: 0, failed: 0, skipped: 0 };

  const allFiles = fs.readdirSync(folderPath);
  const cvFiles = allFiles.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return ext === ".pdf" || ext === ".docx";
  });

  stats.total = cvFiles.length;

  for (const file of cvFiles) {
    const filePath = path.join(folderPath, file);
    const stat = fs.statSync(filePath);
    const cacheKey = `${file}::${stat.mtimeMs}`;

    if (cache[cacheKey]) {
      results.push(cache[cacheKey]);
      stats.cached++;
      continue;
    }

    try {
      console.log(`[Parser] Processing: ${file}`);
      const rawText = await extractText(filePath);

      if (!rawText || rawText.trim().length < 50) {
        console.warn(`[Parser] Skipping ${file} — extracted text too short`);
        stats.skipped++;
        continue;
      }

      const structured = await extractStructured(rawText);

      const candidate = {
        id: cacheKey,
        fileName: file,
        filePath,
        rawText: rawText.slice(0, 8000), // Store truncated raw for deep-dive
        ...structured,
        _parsedAt: new Date().toISOString(),
      };

      cache[cacheKey] = candidate;
      results.push(candidate);
      stats.parsed++;
    } catch (err) {
      console.error(`[Parser] Failed to process ${file}: ${err.message}`);
      stats.failed++;
    }
  }

  saveCache(cache);

  return { candidates: results, stats };
}

/**
 * Load all currently cached candidates (without re-parsing).
 */
function loadCachedCandidates() {
  const cache = loadCache();
  return Object.values(cache);
}

module.exports = { ingestFolder, loadCachedCandidates };
