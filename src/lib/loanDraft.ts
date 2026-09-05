// ─── Loan Application Draft domain ───
// Single source of truth for the "Prepare Application Draft" workflow.
//
// Everything numeric is anchored to the SAME values the feasibility engine
// displays (financial overview / scheme matching / report). Nothing here is
// invented: text sections are generated deterministically from the analysis,
// and the PDF never claims eligibility or approval.

import type { FeasibilityData } from "@/data/feasibility-types";
import type { BusinessCategory } from "@/data/businesses";
import type { Location } from "@/data/locations";
import type { GovernmentScheme } from "@/data/schemes";
import { governmentSchemes } from "@/data/schemes";

// ─── Types ───

export interface LoanAnchors {
  /** Stable identity of the analysis this draft was built from. */
  analysisKey: string;
  businessId: string;
  businessName: string;
  category: string;
  businessDescription: string;
  locationId: string;
  locationName: string;
  district: string;
  state: string;
  pincode: string;
  ownContribution: number;
  projectCost: number;
  fundingRequirement: number;
  loanAmount: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  monthlyProfit: number;
  monthlyRepayment: number;
  schemeId: string | null;
  schemeName: string | null;
}

export interface LoanDraft {
  meta: {
    createdAt: string;
    updatedAt: string;
    /** 1 = auto-built from the analysis; incremented on save snapshots. */
    draftNo: number;
  };
  anchors: LoanAnchors;
  applicant: {
    name: string;
    mobile: string;
    email: string;
    address: string;
  };
  business: {
    name: string;
    category: string;
    description: string;
    stage: string;
    experience: string;
    locationLabel: string;
  };
  project: {
    purpose: string;
    description: string;
    equipment: string;
    workingCapital: string;
  };
  financial: {
    ownContribution: number;
    projectCost: number;
    fundingRequirement: number;
    proposedLoan: number;
    otherSources: string;
    monthlyRevenue: number;
    monthlyExpenses: number;
    monthlyProfit: number;
  };
  market: {
    targetCustomers: string;
    opportunity: string;
    competition: string;
    pricing: string;
    justification: string;
  };
  schemeId: string | null;
  includeBusinessPlan: boolean;
  extraDocuments: string[];
}

export interface DraftInput {
  feasibility: FeasibilityData;
  business: BusinessCategory | null;
  location: Location | null;
  capital: number;
  scheme?: GovernmentScheme | null;
}

/** Deterministic financial anchors from the CURRENT feasibility engine. */
export function analysisAnchors(input: DraftInput): LoanAnchors | null {
  const { feasibility: f, business, location, capital } = input;
  if (!business || !location || !f) return null;
  const fin = f.financial;
  const brk = fin.projectCostBreakdown;
  const isCompliant = brk?.isLimitExceeded && brk.compliantProjectCost != null;
  const projectCost = isCompliant ? (brk!.compliantProjectCost as number) : fin.totalProjectCost;
  const ownContribution = brk?.entrepreneurContribution ?? fin.availableContribution ?? capital ?? 0;
  const fundingRequirement = Math.max(0, fin.potentialLoan ?? projectCost - ownContribution);
  const aff = fin.affordability;
  return {
    analysisKey: [business.id, location.id, String(capital || 0)].join("|"),
    businessId: business.id,
    businessName: business.name,
    category: business.category,
    businessDescription: business.description,
    locationId: location.id,
    locationName: location.name,
    district: location.district,
    state: location.state,
    pincode: location.pincode,
    ownContribution,
    projectCost,
    fundingRequirement,
    loanAmount: Math.min(fundingRequirement, fin.loanDetails?.amount ?? fundingRequirement),
    monthlyRevenue: aff?.expectedRevenue ?? 0,
    monthlyExpenses: aff?.operatingCosts ?? 0,
    monthlyProfit: aff?.cashFlow ?? 0,
    monthlyRepayment: aff?.monthlyRepayment ?? 0,
    schemeId: input.scheme?.id ?? null,
    schemeName: input.scheme?.name ?? null,
  };
}

function inr(n: number): string {
  return n.toLocaleString("en-IN");
}

// ─── Deterministic text generators (grounded in the analysis) ───

function buildPurpose(a: LoanAnchors, scheme: GovernmentScheme | null): string {
  const base = `The applicant proposes to establish a ${a.businessName.toLowerCase()} business in ${a.locationName}, ${a.district}, ${a.state}, and seeks financing of approximately Rs. ${inr(Math.round(a.fundingRequirement))} to support the project setup and working-capital requirements analysed by GramUdaan.`;
  if (scheme) {
    return `${base} ${scheme.name} is being explored as a potentially relevant financing option based on GramUdaan's preliminary scheme matching.`;
  }
  return base;
}

function buildJustification(a: LoanAnchors, feasibility: FeasibilityData): string {
  const m = feasibility.marketReach;
  const o = feasibility.opportunity;
  const c = feasibility.competition;
  const p = feasibility.pricing;
  const f = feasibility.financial;
  const parts: string[] = [];
  parts.push(
    `GramUdaan's feasibility analysis for ${a.businessName} in ${a.locationName} (${a.district}, ${a.state}) estimates an overall score of ${feasibility.overallScore}/100 (${feasibility.verdictLabel}).`,
  );
  if (m?.potentialCustomers != null) {
    parts.push(
      `The estimated local customer base within the analysis area is approximately ${inr(Math.round(m.potentialCustomers))} people (GramUdaan estimate).`,
    );
  }
  if (o?.summary) parts.push(`Opportunity: ${o.summary}`);
  if (o?.underserved) parts.push(`Underserved need identified: ${o.underserved}.`);
  if (c?.summary) parts.push(`Competition: ${c.summary}.`);
  if (p?.recommendedPrice) parts.push(`Pricing: GramUdaan suggests a recommended price of ${p.recommendedPrice}${p.unit ? ` per ${p.unit}` : ""}, within the observed regional range (${p.competitorRange ?? "not available"}).`);
  if (f?.affordability?.ratingLabel) {
    parts.push(`Financial fit: the projected cash flow is rated "${f.affordability.ratingLabel}" by GramUdaan's affordability model (estimated).`);
  }
  parts.push(
    "These figures are GramUdaan estimates based on simulated market data and the applicant's stated contribution; they are not guarantees of revenue, profit or loan approval.",
  );
  return parts.join(" ");
}

function buildCustomerGroups(feasibility: FeasibilityData): string {
  const g = feasibility.marketReach?.customerGroups;
  return g && g.length > 0 ? g.join(", ") : "Local households and nearby villages (as per GramUdaan market reach analysis)";
}

function buildOpportunity(feasibility: FeasibilityData): string {
  return (
    feasibility.opportunity?.summary ??
    "Local demand for this service/product appears underserved based on GramUdaan's analysis (estimated)."
  );
}

function buildCompetition(feasibility: FeasibilityData): string {
  const c = feasibility.competition;
  return c?.summary ?? "Competition data not available in the current analysis.";
}

function buildPricing(feasibility: FeasibilityData): string {
  const p = feasibility.pricing;
  return p?.explanation ?? (p?.recommendedPrice ? `Recommended price ${p.recommendedPrice} (GramUdaan estimate).` : "Pricing rationale not available.");
}

function buildProjectDescription(a: LoanAnchors): string {
  return `Establishment of a ${a.businessName.toLowerCase()} enterprise in ${a.locationName}, ${a.district}, ${a.state} as analysed by GramUdaan.`;
}

// ─── Documents checklist (base + scheme-aware) ───

const BASE_DOCUMENTS = [
  "Identity / KYC document (Aadhaar, voter ID or PAN)",
  "Address proof",
  "Bank account details",
  "Business / project proposal",
  "Quotations or cost estimates for the proposed setup",
];

const SCHEME_DOCUMENTS: Record<string, string[]> = {
  "pm-mudra": ["Existing business proof or new-enterprise declaration as per Mudra norms"],
  "pmegp": ["Beneficiary category certificate where applicable", "Project report in the required format"],
  "deds-dairy": ["Land/space ownership or lease document", "Veterinary/health-related approvals where applicable"],
  cgtmse: ["Existing business registration details", "Bank's loan-processing documents"],
};

export function documentChecklist(anchors: LoanAnchors | null, schemeId: string | null): string[] {
  const list = [...BASE_DOCUMENTS];
  if (schemeId && SCHEME_DOCUMENTS[schemeId]) list.push(...SCHEME_DOCUMENTS[schemeId]);
  if (anchors?.category === "agriculture") {
    list.push("Proof of land/space availability (owned or leased)");
  }
  return [...new Set(list)];
}

/** Optional scheme metadata used inside the draft. */
export function schemeById(id: string | null): GovernmentScheme | null {
  if (!id) return null;
  return governmentSchemes.find((s) => s.id === id) ?? null;
}

// ─── Build a fresh draft (always from the current analysis) ───

export function createDraft(input: DraftInput): LoanDraft | null {
  const anchors = analysisAnchors(input);
  if (!anchors) return null;
  const f = input.feasibility;
  const scheme = schemeById(input.scheme?.id ?? anchors.schemeId);

  const now = new Date().toISOString();
  return {
    meta: { createdAt: now, updatedAt: now, draftNo: 1 },
    anchors,
    applicant: { name: "", mobile: "", email: "", address: "" },
    business: {
      name: anchors.businessName,
      category: anchors.category,
      description: anchors.businessDescription,
      stage: "",
      experience: "",
      locationLabel: `${anchors.locationName}, ${anchors.district}, ${anchors.state}`,
    },
    project: {
      purpose: buildPurpose(anchors, scheme),
      description: buildProjectDescription(anchors),
      equipment: "",
      workingCapital: "",
    },
    financial: {
      ownContribution: anchors.ownContribution,
      projectCost: anchors.projectCost,
      fundingRequirement: anchors.fundingRequirement,
      proposedLoan: anchors.loanAmount,
      otherSources: "",
      monthlyRevenue: anchors.monthlyRevenue,
      monthlyExpenses: anchors.monthlyExpenses,
      monthlyProfit: anchors.monthlyProfit,
    },
    market: {
      targetCustomers: buildCustomerGroups(f),
      opportunity: buildOpportunity(f),
      competition: buildCompetition(f),
      pricing: buildPricing(f),
      justification: buildJustification(anchors, f),
    },
    schemeId: scheme?.id ?? null,
    includeBusinessPlan: true,
    extraDocuments: [],
  };
}

/** Regenerate AI-grounded text sections from the current analysis. */
export function regenerateText(draft: LoanDraft, feasibility: FeasibilityData): LoanDraft {
  const scheme = schemeById(draft.schemeId);
  const purpose = draft.project.purpose.startsWith("The applicant proposes") ? "" : draft.project.purpose;
  const justification = draft.market.justification.startsWith("GramUdaan's feasibility") ? "" : draft.market.justification;
  return {
    ...draft,
    meta: { ...draft.meta, updatedAt: new Date().toISOString() },
    project: {
      ...draft.project,
      purpose: purpose || buildPurpose(draft.anchors, scheme),
      description: buildProjectDescription(draft.anchors),
    },
    market: {
      ...draft.market,
      justification: justification || buildJustification(draft.anchors, feasibility),
      targetCustomers: buildCustomerGroups(feasibility),
      opportunity: buildOpportunity(feasibility),
      competition: buildCompetition(feasibility),
      pricing: buildPricing(feasibility),
    },
  };
}

/** Re-derive calculated fields (funding requirement) after user edits. */
export function recalcFinancial(d: LoanDraft): LoanDraft {
  const pc = Math.max(0, Math.round(d.financial.projectCost));
  const oc = Math.max(0, Math.round(d.financial.ownContribution));
  const funding = Math.max(0, pc - oc);
  const proposed = Math.min(Math.max(0, Math.round(d.financial.proposedLoan)), pc);
  return {
    ...d,
    financial: { ...d.financial, projectCost: pc, ownContribution: oc, fundingRequirement: funding, proposedLoan: proposed },
    meta: { ...d.meta, updatedAt: new Date().toISOString() },
  };
}

// ─── Validation ───

export interface DraftIssue {
  field: string;
  label: string;
  message: string;
  severity: "error" | "warning";
}

export function validateDraft(d: LoanDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const fin = d.financial;
  if (!d.applicant.name.trim()) issues.push({ field: "applicant.name", label: "Applicant full name", message: "Applicant name is missing.", severity: "error" });
  const mobile = d.applicant.mobile.replace(/\D/g, "");
  if (mobile && mobile.length !== 10) issues.push({ field: "applicant.mobile", label: "Mobile number", message: "Mobile number should be 10 digits.", severity: "warning" });
  if (!d.applicant.mobile.trim()) issues.push({ field: "applicant.mobile", label: "Mobile number", message: "Mobile number is missing — add it for the final draft.", severity: "warning" });
  if (d.applicant.email && !/^\S+@\S+\.\S+$/.test(d.applicant.email)) issues.push({ field: "applicant.email", label: "Email", message: "Email address looks invalid.", severity: "warning" });
  if (fin.ownContribution <= 0) issues.push({ field: "financial.ownContribution", label: "Own contribution", message: "Own contribution must be more than zero.", severity: "error" });
  if (fin.projectCost <= 0) issues.push({ field: "financial.projectCost", label: "Project cost", message: "Project cost must be more than zero.", severity: "error" });
  if (fin.ownContribution > fin.projectCost) issues.push({ field: "financial.ownContribution", label: "Own contribution", message: "Own contribution cannot exceed the total project cost.", severity: "error" });
  if (fin.fundingRequirement < 0) issues.push({ field: "financial.fundingRequirement", label: "Funding requirement", message: "Funding requirement cannot be negative.", severity: "error" });
  if (fin.proposedLoan > fin.fundingRequirement && fin.fundingRequirement >= 0) {
    issues.push({
      field: "financial.proposedLoan",
      label: "Proposed loan amount",
      message: "Your proposed loan amount is higher than the calculated funding requirement. Please review the financial details.",
      severity: "error",
    });
  }
  if (fin.monthlyRevenue < 0 || fin.monthlyExpenses < 0) {
    issues.push({ field: "financial.monthlyRevenue", label: "Projections", message: "Revenue/expense projections cannot be negative.", severity: "error" });
  }
  return issues;
}

export function hasBlockingIssues(issues: DraftIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

// ─── Consistency with the latest analysis ───

export interface DraftDiff {
  label: string;
  draftValue: string;
  analysisValue: string;
}

export function consistencyDiffs(d: LoanDraft, anchors: LoanAnchors | null): DraftDiff[] {
  if (!anchors) return [];
  const diffs: DraftDiff[] = [];
  const r = (n: number) => `Rs. ${n.toLocaleString("en-IN")}`;
  if (anchors.analysisKey !== d.anchors.analysisKey) {
    diffs.push({ label: "Business / location profile", draftValue: "this draft", analysisValue: "your latest analysis" });
  }
  if (Math.abs(anchors.ownContribution - d.financial.ownContribution) > 1) diffs.push({ label: "Own contribution", draftValue: r(d.financial.ownContribution), analysisValue: r(anchors.ownContribution) });
  if (Math.abs(anchors.projectCost - d.financial.projectCost) > 1) diffs.push({ label: "Project cost", draftValue: r(d.financial.projectCost), analysisValue: r(anchors.projectCost) });
  if (Math.abs(anchors.fundingRequirement - d.financial.fundingRequirement) > 1) diffs.push({ label: "Funding requirement", draftValue: r(d.financial.fundingRequirement), analysisValue: r(anchors.fundingRequirement) });
  if (Math.abs(anchors.monthlyRevenue - d.financial.monthlyRevenue) > 1) diffs.push({ label: "Monthly revenue", draftValue: r(d.financial.monthlyRevenue), analysisValue: r(anchors.monthlyRevenue) });
  if (Math.abs(anchors.monthlyExpenses - d.financial.monthlyExpenses) > 1) diffs.push({ label: "Monthly expenses", draftValue: r(d.financial.monthlyExpenses), analysisValue: r(anchors.monthlyExpenses) });
  return diffs;
}

// ─── Missing information ───

export function missingSections(d: LoanDraft): string[] {
  const missing: string[] = [];
  if (!d.applicant.name.trim()) missing.push("Applicant name");
  if (!d.applicant.mobile.trim()) missing.push("Mobile number");
  if (!d.project.equipment.trim()) missing.push("Equipment / asset details (optional — add if known)");
  if (!d.project.workingCapital.trim()) missing.push("Working-capital requirement (optional — add if known)");
  if (!d.applicant.address.trim()) missing.push("Applicant address");
  if (!d.business.stage.trim()) missing.push("Business stage (new or existing)");
  return missing;
}

// ─── Plain-text rendering (copy) ───

export function renderDraftText(d: LoanDraft): string {
  const L: string[] = [];
  const sec = (t: string) => L.push(`\n${t}\n${"-".repeat(Math.min(t.length, 40))}`);
  L.push("RURALBIZ AI — LOAN APPLICATION DRAFT");
  L.push("AI-generated draft for preparation only — not an official form or submission.");
  sec("Applicant Details");
  L.push(`Full name: ${d.applicant.name || "Not provided"}`);
  L.push(`Mobile: ${d.applicant.mobile || "Not provided"}`);
  L.push(`Email: ${d.applicant.email || "Not provided"}`);
  L.push(`Address: ${d.applicant.address || "Not provided"}`);
  sec("Business Details");
  L.push(`Proposed business: ${d.business.name} (${d.business.category})`);
  L.push(`Description: ${d.business.description || "Not provided"}`);
  L.push(`Location: ${d.business.locationLabel}`);
  L.push(`Stage: ${d.business.stage || "Not provided"}`);
  L.push(`Experience: ${d.business.experience || "Not provided"}`);
  sec("Project Summary");
  L.push(`Purpose of loan: ${d.project.purpose}`);
  L.push(`Project description: ${d.project.description}`);
  L.push(`Equipment/assets: ${d.project.equipment || "Not provided"}`);
  L.push(`Working capital: ${d.project.workingCapital || "Not provided"}`);
  sec("Financial Requirement");
  L.push(`Own contribution: Rs. ${d.financial.ownContribution.toLocaleString("en-IN")}`);
  L.push(`Estimated project cost: Rs. ${d.financial.projectCost.toLocaleString("en-IN")}`);
  L.push(`Funding requirement (calculated): Rs. ${d.financial.fundingRequirement.toLocaleString("en-IN")}`);
  L.push(`Proposed loan amount: Rs. ${d.financial.proposedLoan.toLocaleString("en-IN")}`);
  L.push(`Other sources: ${d.financial.otherSources || "None stated"}`);
  sec("Business Projections (GramUdaan estimate)");
  L.push(`Expected monthly revenue: Rs. ${d.financial.monthlyRevenue.toLocaleString("en-IN")}`);
  L.push(`Estimated monthly expenses: Rs. ${d.financial.monthlyExpenses.toLocaleString("en-IN")}`);
  L.push(`Estimated monthly surplus: Rs. ${d.financial.monthlyProfit.toLocaleString("en-IN")}`);
  sec("Market Overview");
  L.push(`Target customers: ${d.market.targetCustomers}`);
  L.push(`Opportunity: ${d.market.opportunity}`);
  L.push(`Competition: ${d.market.competition}`);
  L.push(`Pricing: ${d.market.pricing}`);
  sec("Business Justification");
  L.push(d.market.justification);
  sec("Scheme / Financing Context");
  const scheme = schemeById(d.schemeId);
  if (scheme) {
    L.push(`Potential financing option explored: ${scheme.name}`);
    scheme.supportStructure.forEach((s) => L.push(`- ${s.label}: ${s.text}`));
    L.push("Preliminary match only — final eligibility is decided by the implementing authority.");
  } else {
    L.push("No specific scheme selected — see Government Schemes on your dashboard for matched options.");
  }
  sec("Documents Checklist");
  const docs = [...documentChecklist(d.anchors, d.schemeId), ...d.extraDocuments.filter(Boolean)];
  docs.forEach((x) => L.push(`- ${x}`));
  L.push("Final document requirements are determined by the concerned bank/authority.");
  L.push("");
  L.push("DISCLAIMER: Prepared with GramUdaan. This document is an AI-generated application draft for preparation purposes. Final application format, eligibility, documentation, loan amount, interest rate and approval are determined by the concerned bank/financial institution or implementing authority.");
  return L.join("\n");
}

// ─── Persistence (latest + version snapshots) ───

const CURRENT_KEY = "ruralbiz.loan.draft.current.v1";
const HISTORY_KEY = "ruralbiz.loan.draft.history.v1";
const MAX_VERSIONS = 6;

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadCurrentDraft(): LoanDraft | null {
  return safeParse<LoanDraft>(typeof localStorage === "undefined" ? null : localStorage.getItem(CURRENT_KEY));
}

export function saveCurrentDraft(d: LoanDraft): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(d));
  } catch {
    // Storage full / blocked — draft stays in memory.
  }
}

export interface DraftVersion {
  savedAt: string;
  draftNo: number;
  draft: LoanDraft;
}

export function listVersions(): DraftVersion[] {
  return safeParse<DraftVersion[]>(typeof localStorage === "undefined" ? null : localStorage.getItem(HISTORY_KEY)) ?? [];
}

export function snapshotVersion(d: LoanDraft): DraftVersion[] {
  const history = listVersions();
  const nextNo = (history[0]?.draftNo ?? d.meta.draftNo) + 1;
  const entry: DraftVersion = { savedAt: new Date().toISOString(), draftNo: nextNo, draft: { ...d, meta: { ...d.meta, draftNo: nextNo, updatedAt: new Date().toISOString() } } };
  const next = [entry, ...history].slice(0, MAX_VERSIONS);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  return next;
}
