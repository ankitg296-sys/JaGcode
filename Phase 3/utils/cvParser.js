const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { chatJSON } = require("./openrouter");
const { saveCandidate, candidateExists } = require("./storage");

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(fs.readFileSync(filePath));
    return data.text;
  }
  if (ext === ".docx") {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  throw new Error(`Unsupported file type: ${ext}`);
}

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

async function parseFile(filePath, fileName, source = "upload") {
  const rawText = await extractText(filePath);
  if (!rawText || rawText.trim().length < 50) throw new Error("Extracted text too short — file may be empty or image-only.");

  const structured = await chatJSON([{ role: "user", content: EXTRACTION_PROMPT + rawText.slice(0, 6000) }], { max_tokens: 1500 });

  const id = uuidv4();
  const candidate = {
    id,
    fileName,
    filePath,
    rawText: rawText.slice(0, 8000),
    source,
    _parsedAt: new Date().toISOString(),
    ...structured,
  };

  saveCandidate(candidate);
  return candidate;
}

function parseCsvRow(row, id) {
  return {
    id: id || uuidv4(),
    fileName: `${row.name || "Unknown"} (CSV Import)`,
    filePath: null,
    rawText: Object.values(row).join(" "),
    source: "csv_import",
    _parsedAt: new Date().toISOString(),
    name: row.name || row.Name || row["Full Name"] || null,
    title: row.title || row.Title || row["Current Title"] || null,
    email: row.email || row.Email || null,
    phone: row.phone || row.Phone || null,
    location: row.location || row.Location || null,
    total_experience_years: parseInt(row.experience_years || row["Experience Years"] || 0) || 0,
    current_company: row.company || row.Company || row["Current Company"] || null,
    skills: splitCSVField(row.skills || row.Skills || ""),
    industries: splitCSVField(row.industries || row.Industries || ""),
    education: [],
    experience: [],
    summary: row.summary || row.Summary || row.bio || row.Bio || null,
  };
}

function splitCSVField(val) {
  if (!val) return [];
  return val.split(/[;,|]/).map(s => s.trim()).filter(Boolean);
}

module.exports = { parseFile, parseCsvRow };
