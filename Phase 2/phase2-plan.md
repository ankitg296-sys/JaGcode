# TalentMatch AI — Phase 2 Plan
*Local-first Deployable Product | Target: Month 2–4*
*Decision: Keep everything local — no cloud, no managed services.*

---

## Goal
Turn the Phase 1 PoC into a **polished, local desktop product** that a design partner can install and use daily — with drag-and-drop CV uploads, saved searches, export, and scale support for large CV databases.

Everything runs on the user's machine. No internet required except for LLM API calls.

---

## Tech Stack — Confirmed ✅

| Layer | Phase 1 | Phase 2 | Decision |
|---|---|---|---|
| Deployment | Local (localhost) | Local (localhost) | ✅ Stay local |
| File handling | Folder path in UI | Drag & drop upload → local `uploads/` folder | ✅ Multer, local disk |
| Vector DB | None (direct LLM ranking) | `vectra` (pure JS, local JSON-based vector store) | ✅ No Python dependency |
| Auth | None | None — deferred to Phase 3 | ⏭️ Local tool, single user |
| Database | JSON file cache | SQLite via `better-sqlite3` (saved searches, JDs, history) | ✅ Zero-config, local |
| Frontend | Vanilla JS SPA | Vanilla JS (enhanced) | ✅ No framework needed |
| Export | None | CSV via `json2csv` + PDF via `pdfkit` | ✅ Pure Node, no browser |
| Setup | 1-INSTALL.bat + 2-START.bat | Same pattern, updated | ✅ Keep the bat files |

---

## Features & Build Order

### 1. 📂 File Upload UI ← Start here
*Removes the #1 friction: no more typing folder paths*
- Drag-and-drop zone in the browser to upload PDF / DOCX files
- Files saved to local `uploads/` folder automatically
- Upload progress indicator
- List of uploaded CVs with delete option
- Backend: `POST /api/upload` using Multer

### 2. 🗄️ Vector DB Integration
*Needed once CVs exceed ~50 — pre-filter before LLM ranking*
- Use `vectra` — pure JavaScript, stores vectors as local JSON, zero dependencies
- On ingest: generate embeddings via OpenRouter (or local model) → store in vectra index
- On search: find top-N similar candidates via vector search → pass only those to LLM ranker
- Scales to 5,000+ CVs without ballooning LLM costs

### 3. 🧠 Meta JD Builder
*Better matching quality — structured JD vs raw query string*
- Conversational UI panel: HM describes the role in plain English over a few turns
- AI extracts structured JD: title, must-have skills, nice-to-have skills, years of experience, seniority, industries
- Structured JD stored locally (SQLite) and reusable across searches
- JD used as matching target → more precise, consistent ranking

### 4. 🔖 Saved Searches
*Drive daily habit — HMs come back to re-run searches as new CVs arrive*
- Save any search query or Meta JD with a name
- Re-run with one click → automatically picks up newly added CVs
- View past search results and compare over time
- Stored in SQLite

### 5. 📤 Export
*Immediate value — HMs share shortlists with stakeholders*
- **CSV export**: name, score, verdict, skills, contact info, match reasons
- **PDF report**: formatted shortlist with candidate cards, scores, reasoning
- Export from results view — full list or selected candidates only

### 6. 📋 ATS Integration (CSV Import)
*Let HMs bring in existing ATS data without manual upload*
- Accept CSV exports from Greenhouse / Lever / standard ATS formats
- Parse candidate rows → run through same LLM extraction pipeline
- Merge with uploaded CV candidates in the index

---

## What's Dropped / Deferred

| Feature | Decision |
|---|---|
| Web / cloud deployment | ⏭️ Phase 3 — keeping local for now |
| User accounts / multi-user auth | ⏭️ Phase 3 — explicitly moved out |
| S3 / cloud storage | ⏭️ Phase 3 |
| SSO / enterprise auth | ⏭️ Phase 4 |

---

## Suggested Build Order

| Order | Feature | Effort | Value |
|---|---|---|---|
| 1 | File Upload UI | Low | 🔥 Removes biggest friction point |
| 2 | Vector DB (vectra) | Medium | 🔥 Unlocks scale |
| 3 | Saved Searches + SQLite | Medium | ⭐ Drives daily use |
| 4 | Export CSV | Low | ⭐ Immediate shareability |
| 5 | Export PDF | Low | ⭐ Polished demo artifact |
| 6 | Meta JD Builder | Medium | 💡 Differentiator |
| 7 | ATS CSV Import | Low | 💡 Nice-to-have |

---

## Status

| Feature | Status |
|---|---|
| File upload UI | 🔲 Not started |
| Vector DB (vectra) | 🔲 Not started |
| Meta JD Builder | 🔲 Not started |
| Saved searches (SQLite) | 🔲 Not started |
| Export — CSV | 🔲 Not started |
| Export — PDF | 🔲 Not started |
| ATS CSV import | 🔲 Not started |

---

*Stack confirmed: April 18, 2026 — Local-first, no cloud.*
*Ready to build. Starting with File Upload UI.*
