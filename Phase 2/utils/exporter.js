const path = require("path");
const os = require("os");
const fs = require("fs");

// ── CSV Export ────────────────────────────────────────────────────────────────

function toCSV(candidates, query) {
  const headers = [
    "Rank", "Name", "Score", "Verdict", "Title", "Experience (yrs)",
    "Location", "Current Company", "Skills", "Match Reasons", "Gaps",
    "Email", "Phone", "Industries",
  ];

  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const rows = candidates.map((c, i) => [
    i + 1,
    c.name || c.fileName,
    c.score ?? "",
    c.verdict ?? "",
    c.title ?? "",
    c.total_experience_years ?? "",
    c.location ?? "",
    c.current_company ?? "",
    (c.skills || []).join("; "),
    (c.match_reasons || []).join("; "),
    (c.gaps || []).join("; "),
    c.email ?? "",
    c.phone ?? "",
    (c.industries || []).join("; "),
  ].map(esc).join(","));

  const meta = `"TalentMatch AI Export","Query: ${query?.replace(/"/g, '""') || ""}","Generated: ${new Date().toLocaleString()}"`;
  return [meta, "", headers.map(esc).join(","), ...rows].join("\r\n");
}

function exportCSV(candidates, query) {
  const content = toCSV(candidates, query);
  const tmpFile = path.join(os.tmpdir(), `talentmatch-export-${Date.now()}.csv`);
  fs.writeFileSync(tmpFile, content, "utf8");
  return tmpFile;
}

// ── PDF Export ────────────────────────────────────────────────────────────────

function exportPDF(candidates, query, callback) {
  const PDFDocument = require("pdfkit");
  const tmpFile = path.join(os.tmpdir(), `talentmatch-report-${Date.now()}.pdf`);
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const stream = fs.createWriteStream(tmpFile);

  doc.pipe(stream);

  const COLORS = {
    bg: "#0f1117", accent: "#6366f1", success: "#10b981",
    warning: "#f59e0b", danger: "#ef4444", muted: "#94a3b8",
    text: "#1e293b", border: "#e2e8f0",
  };

  const verdictColor = v => {
    if (v?.includes("Strong")) return COLORS.success;
    if (v?.includes("Good")) return COLORS.accent;
    if (v?.includes("Partial")) return COLORS.warning;
    return COLORS.danger;
  };

  // ── Header ──────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 80).fill(COLORS.bg);
  doc.fillColor("#ffffff").fontSize(20).font("Helvetica-Bold").text("🎯 TalentMatch AI", 50, 25);
  doc.fillColor(COLORS.muted).fontSize(10).font("Helvetica").text("Candidate Shortlist Report", 50, 52);
  doc.fillColor("#ffffff").fontSize(10).text(new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }), 0, 52, { align: "right", width: doc.page.width - 50 });

  doc.moveDown(3);

  // ── Search query block ──────────────────────────────────────────────────
  doc.rect(50, doc.y, doc.page.width - 100, 36).fill("#f1f5f9").stroke(COLORS.border);
  doc.fillColor(COLORS.text).fontSize(9).font("Helvetica").text("Search Query:", 62, doc.y - 30);
  doc.fillColor(COLORS.text).fontSize(11).font("Helvetica-Bold").text(`"${query || "—"}"`, 62, doc.y - 18);

  doc.moveDown(1.5);
  doc.fillColor(COLORS.muted).fontSize(9).font("Helvetica")
    .text(`${candidates.length} candidate${candidates.length !== 1 ? "s" : ""} in this shortlist`, 50, doc.y);
  doc.moveDown(1.5);

  // ── Candidate cards ─────────────────────────────────────────────────────
  candidates.forEach((c, i) => {
    const cardHeight = estimateCardHeight(c);

    // Page break if needed
    if (doc.y + cardHeight > doc.page.height - 60) doc.addPage();

    const cardY = doc.y;
    const cardWidth = doc.page.width - 100;

    // Card background
    doc.rect(50, cardY, cardWidth, cardHeight).fill("#f8fafc").stroke(COLORS.border);

    // Rank badge
    doc.circle(72, cardY + 22, 14).fill(i < 3 ? COLORS.accent : "#cbd5e1");
    doc.fillColor("#ffffff").fontSize(10).font("Helvetica-Bold")
      .text(`#${i + 1}`, 63, cardY + 16, { width: 18, align: "center" });

    // Score circle
    const scoreColor = c.score >= 80 ? COLORS.success : c.score >= 55 ? COLORS.warning : COLORS.danger;
    doc.circle(doc.page.width - 82, cardY + 22, 18).fill(scoreColor);
    doc.fillColor("#ffffff").fontSize(11).font("Helvetica-Bold")
      .text(String(c.score ?? "—"), doc.page.width - 100, cardY + 16, { width: 36, align: "center" });

    // Name & title
    doc.fillColor(COLORS.text).fontSize(13).font("Helvetica-Bold")
      .text(c.name || c.fileName, 92, cardY + 10, { width: cardWidth - 80 });
    doc.fillColor(COLORS.muted).fontSize(10).font("Helvetica")
      .text([c.title, c.total_experience_years != null ? `${c.total_experience_years}yrs` : null, c.location].filter(Boolean).join("  ·  "), 92, cardY + 26, { width: cardWidth - 80 });

    // Verdict
    const vColor = verdictColor(c.verdict);
    doc.fillColor(vColor).fontSize(9).font("Helvetica-Bold")
      .text(c.verdict || "", 92, cardY + 42);

    let y = cardY + 58;

    // Match reasons
    if (c.match_reasons?.length) {
      doc.fillColor(COLORS.success).fontSize(8).font("Helvetica-Bold").text("✓ STRENGTHS", 62, y);
      y += 13;
      c.match_reasons.forEach(r => {
        doc.fillColor(COLORS.text).fontSize(9).font("Helvetica").text(`• ${r}`, 68, y, { width: cardWidth - 30 });
        y += 13;
      });
    }

    // Gaps
    if (c.gaps?.length) {
      doc.fillColor(COLORS.warning).fontSize(8).font("Helvetica-Bold").text("△ GAPS", 62, y);
      y += 13;
      c.gaps.forEach(g => {
        doc.fillColor(COLORS.muted).fontSize(9).font("Helvetica").text(`• ${g}`, 68, y, { width: cardWidth - 30 });
        y += 13;
      });
    }

    // Skills
    if (c.skills?.length) {
      const skillText = c.skills.slice(0, 8).join("  ·  ");
      doc.fillColor(COLORS.muted).fontSize(8).font("Helvetica").text(skillText, 62, y + 4, { width: cardWidth - 20 });
      y += 18;
    }

    // Contact
    const contact = [c.email, c.phone].filter(Boolean).join("   ");
    if (contact) {
      doc.fillColor(COLORS.accent).fontSize(8).font("Helvetica").text(contact, 62, y + 4);
    }

    doc.y = cardY + cardHeight + 10;
  });

  // ── Footer ──────────────────────────────────────────────────────────────
  if (doc.y + 40 > doc.page.height - 60) doc.addPage();
  doc.moveDown(2);
  doc.fillColor(COLORS.muted).fontSize(8).font("Helvetica")
    .text("Generated by TalentMatch AI · Confidential", 50, doc.y, { align: "center", width: doc.page.width - 100 });

  doc.end();
  stream.on("finish", () => callback(null, tmpFile));
  stream.on("error", err => callback(err));
}

function estimateCardHeight(c) {
  let h = 70;
  if (c.match_reasons?.length) h += 13 + c.match_reasons.length * 13;
  if (c.gaps?.length) h += 13 + c.gaps.length * 13;
  if (c.skills?.length) h += 22;
  if (c.email || c.phone) h += 16;
  return h + 10;
}

module.exports = { exportCSV, exportPDF };
