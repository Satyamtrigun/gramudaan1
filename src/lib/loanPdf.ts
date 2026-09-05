// ─── Loan Application Draft → PDF ───
// Client-side PDF (jsPDF). Clean A4 layout, headed sections, page numbers and
// a fixed disclaimer footer. Plain ASCII fonts only — all currency/glyphs are
// converted ("₹" → "Rs.") so nothing renders as tofu.

import { jsPDF } from "jspdf";
import type { LoanDraft } from "./loanDraft";
import { documentChecklist, schemeById } from "./loanDraft";

function sanitize(s: string): string {
  return s
    .replace(/₹/g, "Rs. ")
    .replace(/[—–]/g, "-")
    .replace(/≈/g, "~")
    .replace(/’|‘|'/g, "'")
    .replace(/“|”|"/g, '"')
    .replace(/•|·/g, "-")
    .replace(/[^\x20-\x7E\n\t]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER = 12;

const GREEN: [number, number, number] = [23, 80, 56];
const DARK: [number, number, number] = [34, 40, 36];
const MUTED: [number, number, number] = [100, 110, 102];

const rup = (n: number) => `Rs. ${n.toLocaleString("en-IN")}`;

export interface PdfSectionLine {
  label?: string;
  value: string;
}

export class PdfWriter {
  doc: jsPDF;
  y: number;

  constructor() {
    this.doc = new jsPDF({ unit: "mm", format: "a4" });
    this.y = MARGIN;
  }

  private ensureSpace(needed: number): void {
    if (this.y + needed > PAGE_H - FOOTER - 8) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  heading(text: string, size = 13): void {
    this.ensureSpace(12);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(size);
    this.doc.setTextColor(...GREEN);
    this.doc.text(sanitize(text), MARGIN, this.y);
    this.y += 6;
    this.doc.setDrawColor(180, 200, 185);
    this.doc.setLineWidth(0.3);
    this.doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y);
    this.y += 3;
  }

  sub(text: string): void {
    this.ensureSpace(6);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9.5);
    this.doc.setTextColor(...DARK);
    this.doc.text(sanitize(text), MARGIN, this.y);
    this.y += 5;
  }

  paragraph(text: string, opts: { size?: number; color?: [number, number, number] } = {}): void {
    const size = opts.size ?? 9.5;
    const lines = this.doc.splitTextToSize(sanitize(text), CONTENT_W) as string[];
    for (const ln of lines) {
      this.ensureSpace(5);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(size);
      this.doc.setTextColor(...(opts.color ?? DARK));
      this.doc.text(ln, MARGIN, this.y);
      this.y += 4.6;
    }
  }

  kv(label: string, value: string): void {
    const text = `${label}: ${value}`;
    const lines = this.doc.splitTextToSize(sanitize(text), CONTENT_W) as string[];
    lines.forEach((ln, i) => {
      this.ensureSpace(5);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(9.5);
      this.doc.setTextColor(...DARK);
      if (i === 0) {
        // Bold label portion
        const labelLen = sanitize(label).length + 2;
        this.doc.setFont("helvetica", "bold");
        this.doc.text(ln.slice(0, labelLen), MARGIN, this.y, { charSpace: 0 });
        this.doc.setFont("helvetica", "normal");
        this.doc.setTextColor(...MUTED);
        this.doc.text(ln.slice(labelLen), MARGIN + this.doc.getTextWidth(ln.slice(0, labelLen)), this.y);
        this.doc.setTextColor(...DARK);
      } else {
        this.doc.text(ln, MARGIN + 10, this.y);
      }
      this.y += 4.6;
    });
  }

  bullet(text: string): void {
    const lines = this.doc.splitTextToSize(sanitize(text), CONTENT_W - 6) as string[];
    lines.forEach((ln, i) => {
      this.ensureSpace(5);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(9.5);
      this.doc.setTextColor(...DARK);
      this.doc.text(i === 0 ? "-" : "", MARGIN, this.y);
      this.doc.text(ln, MARGIN + 5, this.y);
      this.y += 4.6;
    });
  }

  spacer(h = 3): void {
    this.y += h;
  }

  addFooters(): void {
    const count = this.doc.getNumberOfPages();
    for (let i = 1; i <= count; i++) {
      this.doc.setPage(i);
      this.doc.setDrawColor(200, 205, 198);
      this.doc.setLineWidth(0.3);
      this.doc.line(MARGIN, PAGE_H - FOOTER - 8, PAGE_W - MARGIN, PAGE_H - FOOTER - 8);
      this.doc.setFont("helvetica", "italic");
      this.doc.setFontSize(6.8);
      this.doc.setTextColor(...MUTED);
      const disclaimer =
        "Prepared with GramUdaan. This document is an AI-generated application draft for preparation purposes. Final application format, eligibility, documentation, loan amount, interest rate and approval are determined by the concerned bank/financial institution or implementing authority.";
      const discLines = this.doc.splitTextToSize(sanitize(disclaimer), CONTENT_W - 30) as string[];
      discLines.forEach((ln, idx) => {
        this.doc.text(ln, MARGIN, PAGE_H - FOOTER - 4 + idx * 3);
      });
      this.doc.setFont("helvetica", "normal");
      this.doc.text(`Page ${i} of ${count}`, PAGE_W - MARGIN, PAGE_H - FOOTER - 4, { align: "right" });
      this.doc.text("GramUdaan - Loan Application Draft", MARGIN, PAGE_H - FOOTER - 4);
    }
  }
}

/** Build the full PDF document from a draft. */
export function buildLoanPdf(draft: LoanDraft): jsPDF {
  const w = new PdfWriter();
  const d = w.doc;
  const scheme = schemeById(draft.schemeId);

  // Brand header band
  d.setFillColor(...GREEN);
  d.rect(0, 0, PAGE_W, 20, "F");
  d.setFont("helvetica", "bold");
  d.setFontSize(14);
  d.setTextColor(255, 255, 255);
  d.text("GramUdaan", MARGIN, 10);
  d.setFontSize(8);
  d.setFont("helvetica", "normal");
  d.text("Rural business feasibility & financial advisory", MARGIN, 15);

  d.setFontSize(18);
  d.setFont("helvetica", "bold");
  d.setTextColor(...GREEN);
  d.text("Loan Application Draft", MARGIN, 34);
  d.setFontSize(9);
  d.setFont("helvetica", "italic");
  d.setTextColor(...MUTED);
  d.text("AI-generated draft for preparation purposes - not an official bank or government form", MARGIN, 39);

  d.setFont("helvetica", "normal");
  d.setFontSize(8.5);
  d.setTextColor(...DARK);
  const dateStr = new Date(draft.meta.updatedAt || Date.now()).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  d.text(`Application date: ${dateStr}    |    Draft no: ${draft.meta.draftNo}`, MARGIN, 45);

  w.y = 52;

  // 1. Applicant
  w.heading("1. Applicant Details");
  w.kv("Full name", draft.applicant.name || "Not provided");
  w.kv("Mobile number", draft.applicant.mobile || "Not provided");
  w.kv("Email", draft.applicant.email || "Not provided");
  w.kv("Address", draft.applicant.address || "Not provided");
  w.kv("District / State / PIN", `${draft.anchors.district}, ${draft.anchors.state} - ${draft.anchors.pincode}`);
  w.spacer(2);

  // 2. Business
  w.heading("2. Business Details");
  w.kv("Proposed business", `${draft.business.name} (category: ${draft.business.category})`);
  w.kv("Business description", draft.business.description || "Not provided");
  w.kv("Business location", draft.business.locationLabel);
  w.kv("Stage", draft.business.stage || "Not provided");
  w.kv("Relevant experience", draft.business.experience || "Not provided");
  w.spacer(2);

  // 3. Project
  w.heading("3. Project Summary");
  w.paragraph(draft.project.purpose);
  w.spacer(1);
  w.kv("Project description", draft.project.description);
  w.kv("Equipment / assets required", draft.project.equipment || "Not provided");
  w.kv("Working-capital requirement", draft.project.workingCapital || "Not provided");
  w.spacer(2);

  // 4. Financial
  w.heading("4. Financial Requirement");
  const fin = draft.financial;
  w.kv("Applicant's own contribution", rup(fin.ownContribution));
  w.kv("Estimated total project cost", rup(fin.projectCost));
  w.kv("Funding requirement (calculated)", rup(fin.fundingRequirement));
  w.kv("Proposed loan amount", rup(fin.proposedLoan));
  w.kv("Other funding sources", fin.otherSources || "None stated");
  w.spacer(2);

  w.heading("5. Business Projections (GramUdaan estimate)");
  w.kv("Expected monthly revenue", rup(fin.monthlyRevenue));
  w.kv("Estimated monthly expenses", rup(fin.monthlyExpenses));
  w.kv("Estimated monthly surplus", rup(fin.monthlyProfit));
  w.paragraph("These projections are GramUdaan estimates generated from the feasibility analysis. Actual revenue depends on market conditions and business execution.", { size: 8, color: MUTED });
  w.spacer(2);

  // 6. Market
  w.heading("6. Market Overview");
  w.kv("Target customers", draft.market.targetCustomers);
  w.kv("Local opportunity", draft.market.opportunity);
  w.kv("Competition", draft.market.competition);
  w.kv("Pricing rationale", draft.market.pricing);
  w.spacer(2);

  // 7. Justification
  w.heading("7. Business Justification");
  w.paragraph(draft.market.justification);
  w.spacer(2);

  // 8. Scheme
  w.heading("8. Scheme / Financing Context");
  if (scheme) {
    w.paragraph(`Potential financing option explored: ${scheme.name}. Selected from GramUdaan's preliminary scheme matching - it is not an approval or an eligibility certificate.`);
    scheme.supportStructure.forEach((s) => w.kv(s.label, s.text));
    w.paragraph("Preliminary match - final eligibility, benefits and loan terms must be confirmed by the concerned bank/financial institution or implementing authority.", { size: 8.5, color: MUTED });
  } else {
    w.paragraph("No specific scheme was selected for this draft. Review 'Government Schemes & Financing' on the GramUdaan dashboard for potentially relevant options before submitting.", { size: 8.5, color: MUTED });
  }
  w.spacer(2);

  // 9. Documents
  w.heading("9. Documents Checklist");
  const docs = [...documentChecklist(draft.anchors, draft.schemeId), ...draft.extraDocuments.filter(Boolean)];
  docs.forEach((x) => w.bullet(x));
  w.paragraph("Final document requirements are determined by the concerned bank/authority.", { size: 8, color: MUTED });
  w.spacer(2);

  // 10. Declaration placeholder
  w.heading("10. Declaration");
  w.paragraph("I confirm that the information provided in this application draft is true to the best of my knowledge, and I understand that the final application will be processed by the concerned bank/financial institution or implementing authority.");
  w.spacer(4);
  w.paragraph("Applicant signature: ______________________________          Date: ______________", { size: 9 });

  w.addFooters();
  return d;
}

/** Download the generated PDF (browser). */
export function downloadLoanPdf(draft: LoanDraft): void {
  const doc = buildLoanPdf(draft);
  const date = new Date(draft.meta.updatedAt || Date.now()).toISOString().slice(0, 10);
  doc.save(`GramUdaan-Loan-Application-Draft-${date}.pdf`);
}
