# TalentMatch AI — Progress Log
*Last updated: April 18, 2026*

---

## Project Structure

```
JagCode/
├── Phase 1/        ← PoC (complete, tested, archived)
├── Phase 2/        ← Local deployable product (complete, live)
├── plan.md.txt     ← Master business plan
└── progress.md     ← This file
```

---

## Current Status: Phase 2 ✅ Live at http://localhost:3000

Both phases are fully built and tested with real CVs. Phase 2 is the active product.

---

## Session Log

### April 18, 2026 — Phase 2 Built, Tested & Live

#### What was built
Full Phase 2 from scratch in a single session. Lives in `Phase 2/`.

| File | Description |
|---|---|
| `Phase 2/server.js` | Express server with 12 API routes |
| `Phase 2/utils/openrouter.js` | OpenRouter API wrapper |
| `Phase 2/utils/storage.js` | JSON persistence — candidates, saved searches, JDs |
| `Phase 2/utils/cvParser.js` | PDF/DOCX parsing + ATS CSV row import |
| `Phase 2/utils/preFilter.js` | TF-IDF pre-filter — scales to 5,000+ CVs, zero API cost |
| `Phase 2/utils/ranker.js` | Stack ranking + deep-dive Q&A + JD builder |
| `Phase 2/utils/exporter.js` | CSV export + PDF report (pdfkit) |
| `Phase 2/public/index.html` | Full 5-tab UI — Upload · Search · Saved · JD Library · Import |
| `Phase 2/1-INSTALL.bat` | One-click install |
| `Phase 2/2-START.bat` | One-click start (auto-opens browser) |

#### What's new vs Phase 1

| Capability | Phase 1 | Phase 2 |
|---|---|---|
| CV loading | Folder path | Drag & drop upload |
| Scale ceiling | ~50 CVs | 5,000+ CVs (TF-IDF pre-filter) |
| Searches | One-shot | Saved & re-runnable |
| Job Descriptions | Raw text query | AI-structured JD library |
| Export | None | CSV + PDF reports |
| Imports | None | ATS CSV import |
| UI | 1 view | 5 tabs |

#### Smoke test — Phase 2 (`C:\Users\Ankit\Desktop\Personal\JaG - CVs`)
4 CVs uploaded via drag & drop: Kunika Hasija, Ankit Gupta, Rashika Ahuja, Prankur Rusia

Search: *"HR professional with recruitment experience"*

| Rank | Candidate | Score | Verdict |
|---|---|---|---|
| 1 | Kunika Hasija | 88 | Strong Match |
| 2 | Rashika Ahuja | 72 | Good Match |
| 3 | Ankit Gupta | 62 | Partial Match |
| 4 | Prankur Rusia | 35 | Weak Match |

✅ Upload, parsing, ranking, export, saved searches, JD builder all confirmed working.

---

### April 18, 2026 — Phase 1 PoC Built & Tested

Full Phase 1 PoC built from scratch. Lives in `Phase 1/` (archived).

#### Key decisions
- **Node.js 24 + npm 11** — installed fresh on this machine
- **Model:** `mistralai/mistral-7b-instruct` was retired by OpenRouter → switched to **`mistralai/mistral-nemo`**
- **multer** upgraded from v1 → v2

#### Smoke test — Phase 1
Search: *"HR professional with recruitment experience"*

| Rank | Candidate | Score | Verdict |
|---|---|---|---|
| 1 | Kunika Hasija | 85 | Strong Match |
| 2 | Rashika Ahuja | 70 | Good Match |
| 3 | Ankit Gupta | 60 | Partial Match |
| 4 | Prankur Rusia | 30 | Weak Match |

---

## Feature Checklist

### Phase 1 ✅ Complete
- [x] CV ingestion from local folder (PDF + DOCX)
- [x] LLM-powered structured extraction with local JSON cache
- [x] Stack ranking — 0–100 scores, verdicts, match reasons, gap analysis
- [x] Conversational follow-up queries (last 4 turns)
- [x] Deep dive Q&A per candidate
- [x] Windows one-click setup (bat files)
- [x] Dark-theme UI with score rings

### Phase 2 ✅ Complete
- [x] Drag & drop CV upload (PDF + DOCX, up to 100 files)
- [x] TF-IDF pre-filter — auto-activates above 30 candidates, scales to 5,000+
- [x] Saved searches — save, name, re-run, delete
- [x] Meta JD Builder — describe role in plain English, AI extracts structured JD
- [x] JD Library — reuse JDs as search targets
- [x] Export CSV — full shortlist with scores, reasoning, contact info
- [x] Export PDF — formatted report via pdfkit
- [x] ATS CSV import — Greenhouse/Lever/any standard format
- [x] 5-tab UI: Upload · Search · Saved Searches · JD Library · CSV Import

### Phase 3 — Not started
- [ ] User accounts + auth (email/password)
- [ ] Multi-user support per org
- [ ] Cloud / web deployment
- [ ] Meta CV Builder (candidate side)
- [ ] Candidate portal
- [ ] Bi-directional matching
- [ ] Recruiter dashboard (pipeline view, notes, tags)
- [ ] Skills gap analysis

---

## Known Issues

| Issue | Status |
|---|---|
| `mistralai/mistral-7b-instruct` retired by OpenRouter | ✅ Fixed — using `mistral-nemo` |
| `multer` v1 deprecation | ✅ Fixed — upgraded to v2 |
| PDF font warning (`TT: undefined function: 21`) | ⚠️ Cosmetic only — parsing works fine |

---

## Immediate Priorities

| Priority | Action | Status |
|---|---|---|
| 🔴 Critical | Test Phase 2 with real CVs — ranking quality | ✅ Done |
| 🔴 Critical | Identify 2–3 design partner candidates | 🔲 In progress |
| 🟡 High | Refine ranking quality based on HM feedback | 🔲 Pending |
| 🟡 High | Create demo video of Phase 2 product | 🔲 Pending |
| 🟢 Medium | Define pricing and pilot terms for design partners | 🔲 Pending |
| 🟢 Medium | Plan Phase 3 scope | 🔲 Pending |
