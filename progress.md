# TalentMatch AI — Progress Log
*Last updated: April 20, 2026 (Session 3)*

---

## Project Structure

```
JagCode/
├── Phase 1/        ← PoC (complete, tested, archived)
├── Phase 2/        ← Local deployable product (complete, live)
├── Phase 3/        ← Two-sided platform with auth (complete, live)
├── plan.md.txt     ← Master business plan
└── progress.md     ← This file
```

---

## Current Status: Phase 3 ✅ Live at http://localhost:3000

All three phases are fully built. Phase 3 is the active product — two-sided platform with auth, candidate portal, and recruiter pipeline.

---

## Session Log

### April 20, 2026 (Session 3) — Submit to Recruiter Pool + User Credentials Sheet

#### What was built

| Feature | Detail |
|---|---|
| **Submit to Recruiter Pool** | Candidate clicks one button — their MetaCV is converted into a recruiter-searchable candidate record |
| **Pool status indicator** | Green status bar shows "Visible to recruiters · Last updated [date]" once submitted |
| **Re-submit / sync** | Submitting again updates the existing recruiter record with latest profile data |
| **Chat confirmation** | AI confirms submission in the chat thread |
| **TalentMatch-Users.xlsx** | All registered accounts — Name, Email, Role, Password, Created date. Colour-coded rows (purple = recruiter, green = candidate). Notes sheet explains bcrypt hashing. |

#### New server routes

| Route | Purpose |
|---|---|
| `POST /api/candidate/submit-to-pool` | Converts MetaCV → candidate record in recruiter's DB, marks profile as submitted |
| `GET /api/candidate/pool-status` | Returns `{ submitted, submittedAt, candidateId }` |

#### GitHub commits
- `9db4979` — feat: candidate submit-to-pool + user credentials Excel sheet

---

### April 20, 2026 (Session 2) — Candidate Profile Chat + CV Import + PDF Download

#### What was built

| Feature | Detail |
|---|---|
| **Profile chat interface** | Replaced textarea+button with a split-panel chat UI (chat left, live profile right) |
| **CV import in chat** | Candidate uploads PDF/DOCX — auto-parsed instantly, AI summarises what it found |
| **Drag-and-drop** | Drop CV anywhere on the profile tab, or use the Upload CV button in the chat input |
| **Conversational profile building** | Chat to update: "change my title", "add Python", "I also worked at Accenture" |
| **Live profile panel** | Updates in real-time with every AI response — skills editable, chips removable |
| **Download Profile PDF** | One-click PDF export of the candidate's MetaCV — nicely formatted, streams from server |

#### New server routes

| Route | Purpose |
|---|---|
| `POST /api/candidate/upload-cv` | Parse candidate's own CV (without adding to recruiter's candidate list) |
| `POST /api/candidate/chat` | Profile-building conversation — AI returns message + updated profile JSON |
| `GET /api/candidate/download-profile` | Generate + stream a formatted PDF of the candidate's MetaCV |

#### New utility functions

| Function | File | Purpose |
|---|---|---|
| `parseFileOnly(filePath)` | `cvParser.js` | Parse CV text + extract structured data without saving to DB |
| `profileChat(msg, history, profile)` | `ranker.js` | Conversational profile builder — returns `{message, profile}` JSON |

#### GitHub commits
- `e7d3ec6` — feat: candidate profile chat interface with CV import
- `bbb3aff` — feat: candidate profile PDF download

---

### April 20, 2026 — Phase 3 Built, Tested & Live

#### What was built
Full Phase 3 from scratch in a single session. Lives in `Phase 3/`.

| File | Description |
|---|---|
| `Phase 3/server.js` | Express server — 30 API routes across auth, recruiter, candidate |
| `Phase 3/utils/auth.js` | bcryptjs + JWT — hashPassword, signToken, requireAuth, requireRole |
| `Phase 3/utils/storage.js` | Extended JSON persistence — users, meta-cvs, pipeline + all Phase 2 |
| `Phase 3/utils/openrouter.js` | OpenRouter API wrapper (same as Phase 2) |
| `Phase 3/utils/cvParser.js` | PDF/DOCX parsing + ATS CSV row import (same as Phase 2) |
| `Phase 3/utils/preFilter.js` | TF-IDF pre-filter (same as Phase 2) |
| `Phase 3/utils/ranker.js` | Phase 2 ranker + bi-directional matching + gap analysis + Meta CV builder |
| `Phase 3/utils/exporter.js` | CSV + PDF export (same as Phase 2) |
| `Phase 3/public/index.html` | Full two-sided UI — Auth screen + Recruiter view + Candidate view |
| `Phase 3/1-INSTALL.bat` | One-click install |
| `Phase 3/2-START.bat` | One-click start |

#### What's new vs Phase 2

| Capability | Phase 2 | Phase 3 |
|---|---|---|
| Auth | None | bcryptjs + JWT, 7-day tokens |
| Roles | Single user | recruiter / candidate |
| Candidate portal | None | Full — profile, matches, gap analysis |
| Meta CV Builder | None | AI builds profile from plain English |
| Bi-directional matching | None | Candidate → JDs scored + ranked |
| Gap analysis | None | Readiness %, severity-tagged gaps, action plan |
| Pipeline | None | Kanban — 6 stages, drag between columns |
| UI | 5 tabs | Auth screen → role-based dashboard |

#### Smoke test — Phase 3
- ✅ Register as recruiter → JWT issued, recruiter dashboard loads
- ✅ Register as candidate → JWT issued, candidate portal loads
- ✅ Role enforcement — candidate blocked from `/api/candidates` with 403
- ✅ Candidate `/api/meta-cvs/me` returns null until profile is built
- ✅ Pipeline GET returns stages array
- ✅ Login flow works — correct token re-issued

---

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
- [x] Strict domain-only scoring — no soft-skill inflation
- [x] `temperature: 0` — consistent scores across identical queries
- [x] All code pushed to GitHub (ankitg296-sys/JaGcode)

### Phase 3 ✅ Complete
- [x] User accounts + auth (email/password, bcryptjs + JWT)
- [x] Roles: recruiter and candidate — fully separated views
- [x] Meta CV Builder — AI builds candidate profile from plain English
- [x] Candidate profile chat — conversational interface to build/update profile
- [x] CV import in chat — upload PDF/DOCX, auto-parsed, AI summarises instantly
- [x] Download Profile PDF — nicely formatted PDF export of candidate's MetaCV
- [x] Submit to Recruiter Pool — one-click to make profile visible to recruiters
- [x] Candidate portal — matched roles, gap analysis
- [x] Bi-directional matching — candidate profile ranked against all JDs
- [x] Skills gap analysis — readiness score, severity-tagged gaps, action plan
- [x] Recruiter pipeline kanban — Applied → Screening → Interview → Offer → Hired / Rejected
- [x] All Phase 2 recruiter features inherited (upload, search, saved searches, JD library, CSV import, export)
- [x] TalentMatch-Users.xlsx — registered users reference sheet
- [ ] Multi-user / org isolation (all users share one DB — Phase 4)
- [ ] Cloud / web deployment (Phase 4)

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
| 🔴 Critical | Smoke test Phase 3 with real CVs + real users | 🔲 Pending |
| 🔴 Critical | Identify 2–3 design partner candidates | 🔲 In progress |
| 🟡 High | Refine ranking quality based on HM feedback | 🔲 Pending |
| 🟡 High | Create demo video of Phase 3 product | 🔲 Pending |
| 🟢 Medium | Define pricing and pilot terms for design partners | 🔲 Pending |
| 🟢 Medium | Plan Phase 4 — cloud / multi-org | 🔲 Pending |
