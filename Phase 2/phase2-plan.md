# TalentMatch AI — Phase 2 Plan
*Local-first Deployable Product*
*Status: ✅ COMPLETE — April 18, 2026*

---

## Goal
Turn the Phase 1 PoC into a polished, local desktop product that a design partner can install and use daily — with drag-and-drop CV uploads, saved searches, export, and scale support for large CV databases.

Everything runs on the user's machine. No internet required except for LLM API calls.

---

## Tech Stack — As Built

| Layer | Planned | Shipped | Note |
|---|---|---|---|
| Deployment | Local (localhost) | Local (localhost) | ✅ Same |
| File handling | Drag & drop → `uploads/` | Drag & drop → `uploads/` | ✅ Same |
| Scale / pre-filter | `vectra` vector DB | TF-IDF pre-filter | ✅ Same goal, simpler — no extra deps, no API cost |
| Auth | None (deferred) | None (deferred) | ⏭️ Phase 3 |
| Persistence | SQLite (`better-sqlite3`) | JSON files | ✅ Simpler, sufficient at this scale |
| Frontend | Vanilla JS | Vanilla JS | ✅ Same |
| Export | `json2csv` + `pdfkit` | Manual CSV + `pdfkit` | ✅ Same |
| Setup | `1-INSTALL.bat` + `2-START.bat` | Same | ✅ Same |

---

## Feature Status

| Feature | Status | Notes |
|---|---|---|
| 📂 File Upload UI (drag & drop PDF/DOCX) | ✅ Complete | Up to 100 files, upload progress, delete |
| 🗄️ Scale pre-filter (50→5,000+ CVs) | ✅ Complete | TF-IDF pre-filter, auto-activates above 30 candidates |
| 🧠 Meta JD Builder | ✅ Complete | Plain English → AI-structured JD, stored + reusable |
| 🔖 Saved Searches | ✅ Complete | Save, name, re-run with one click, delete |
| 📤 Export CSV | ✅ Complete | Full shortlist with scores, reasoning, contact info |
| 📤 Export PDF | ✅ Complete | Formatted report via pdfkit |
| 📋 ATS CSV Import | ✅ Complete | Greenhouse/Lever/any standard format |
| 🔍 Deep Dive Q&A | ✅ Complete | Per-candidate chat panel (carried from Phase 1) |
| 💬 Conversational search | ✅ Complete | Follow-up queries with 4-turn memory |
| 🎯 Strict scoring | ✅ Complete | Domain-only scoring, no soft-skill inflation |
| 🔒 Consistent scores | ✅ Complete | `temperature: 0` on ranking — same query = same scores |

---

## What's Deferred to Phase 3

| Feature | Reason |
|---|---|
| User accounts / auth | Single-user local tool for now |
| Web / cloud deployment | Not needed until design partner stage |
| S3 / cloud storage | Goes with cloud deployment |
| Multi-user / org support | Phase 3 |

---

## Post-Build Fixes

| Fix | Date | Detail |
|---|---|---|
| Strict scoring prompt | April 18, 2026 | Removed soft-skill credit; no-domain = 0–15 score |
| `temperature: 0` for ranking | April 18, 2026 | Eliminates score variance across identical queries |
| Removed 50% score gate | April 18, 2026 | Show all candidates, let HM decide the cutoff |

---

## How to Run

```
Phase 2/
├── 1-INSTALL.bat   ← Run once (installs node_modules)
└── 2-START.bat     ← Run to launch (opens http://localhost:3000)
```

Copy `Phase 2/.env.example` → `Phase 2/.env` and add `OPENROUTER_API_KEY`.

---

*Phase 2 complete: April 18, 2026*
*Next: Phase 3 — cloud deployment, auth, multi-user*
