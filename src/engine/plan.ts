/* ────────────────────────────────────────────────────────────────────────────
 * GramUdaan — Advisory Plan Engine (single source of truth)
 *
 * One centralized business-plan model used by every advisory section:
 *   userCapital / targetInvestment / otherFunding
 *   → setup cost + initial working capital = total project cost
 *   → total available funding → funding gap (never negative)
 *   → required loan vs recommended borrowing range
 *   → EMI (reuses the shared repayment engine) → EMI stress test
 *   → operating profit → profit after EMI → cash-flow warning
 *   → 12-month projection → break-even (operating + investment payback)
 *   → conservative / expected / optimistic scenarios
 *   → risk (LOW/MEDIUM/HIGH with reasons) → feasibility score 0–100
 *
 * All figures are ESTIMATES for decision support, never guarantees.
 * ──────────────────────────────────────────────────────────────────────────── */

import { buildCostBreakdown, type CostContext } from "./costModel";
import { buildBusinessModel, type MonthProjection } from "./businessModel";
import { calculateRepayment } from "./financial";
import { formatIndianCurrency } from "@/data/assessment";

/* ─── Inputs ─── */

export interface PlanInput {
  businessId: string;
  subCategoryId?: string | null;
  placeStatus?: CostContext["placeStatus"];
  rentMonthly?: number;
  scaleChoice?: CostContext["scaleChoice"];
  /** USER_CAPITAL — money the user can invest from their own pocket. */
  userCapital: number;
  /** TARGET_INVESTMENT — what the user plans/willing to invest (kept distinct from capital). */
  targetInvestment?: number;
  /** Family / partner / grants / other legitimate funding, combined. */
  otherFunding?: number;
  /** Local competition density from the market analysis, when available. */
  competitionDensity?: "low" | "medium" | "high";
}

/* ─── Outputs ─── */

export interface CostSplit {
  setupCost: number;
  workingCapital: number;
  workingCapitalMonths: number; // buffer covered by the estimate
  totalProjectCost: number;
  components: { id: string; label: string; labelHi: string; amount: number; source: string }[];
  notes: string[];
}

export interface FundingSplit {
  userCapital: number;
  otherFunding: number;
  totalAvailableFunding: number;
  totalProjectCost: number;
  /** MAX(0, projectCost − available funding). Never negative. */
  fundingGap: number;
  /** Borrowing the entire gap. */
  loanRequired: number;
  /** Suggested borrowing — keeps ~1 month of operating expenses un-borrowed. */
  recommendedLoan: number;
  recommendedLoanMax: number;
  recommendationNote: string;
}

export interface LoanTerms {
  amount: number;
  interestRate: number;
  tenureYears: number;
  emi: number;
  totalInterest: number;
  totalRepayment: number;
  isEstimate: true;
}

export type StressLevel = "low" | "medium" | "high";

export interface EmiStress {
  emi: number;
  operatingProfit: number;
  /** EMI / operating profit. Null when there is no loan. */
  ratio: number | null;
  level: StressLevel;
  label: string;
  explanation: string;
}

export interface Scenario {
  id: "conservative" | "expected" | "optimistic";
  label: string;
  labelHi: string;
  revenueFactor: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  monthlyProfit: number;
  profitAfterEmi: number;
  paybackMonths: number | null; // investment payback estimate
  note: string;
}

export interface FeasibilityFactor {
  id: string;
  label: string;
  score: number;   // 0–100 for this factor
  weight: number;  // fraction of the total score
  detail: string;
}

export interface FeasibilityResult {
  score: number;
  factors: FeasibilityFactor[];
}

export interface RiskAssessment {
  level: StressLevel;
  label: string;
  reasons: { positive: string[]; concerns: string[] };
}

export interface AdvisoryPlan {
  cost: CostSplit;
  funding: FundingSplit;
  loan: LoanTerms;
  emiStress: EmiStress;
  /** Monthly operating figures at the chosen scale. */
  operating: {
    monthlyRevenue: number;
    monthlyFixedCosts: number;
    monthlyVariableCosts: number;
    monthlyExpenses: number;
    operatingProfit: number;
    profitMargin: number;
  };
  projection: MonthProjection[];
  /** Monthly cash available after EMI at steady state. */
  profitAfterEmi: number;
  cashFlowWarning: string | null;
  breakEven: {
    operatingBreakEvenMonth: number | null;
    operatingBreakEvenSales: number;
    investmentPaybackMonths: number | null;
    explanation: string;
  };
  scenarios: Scenario[];
  risk: RiskAssessment;
  feasibility: FeasibilityResult;
  confidence: { label: string; level: "high" | "medium" | "low"; why: string }[];
  assumptions: string[];
}

/* ─── Loan defaults by size (PMEGP/MUDRA-style indicative terms) ─── */

const MICRO_LOAN_MAX = 125000;
const MICRO_RATE = 6.5;
const TERM_RATE = 8;
const DEFAULT_TENURE = 5;

/* ─── Engine ─── */

export function buildAdvisoryPlan(input: PlanInput): AdvisoryPlan {
  const ctx: CostContext = {
    subCategoryId: input.subCategoryId ?? null,
    placeStatus: input.placeStatus,
    rentMonthly: input.rentMonthly,
    scaleChoice: input.scaleChoice,
  };

  const userCapital = safeNumber(input.userCapital);
  const otherFunding = safeNumber(input.otherFunding);
  const targetInvestment = safeNumber(input.targetInvestment);

  /* ── Cost split: setup vs initial working capital (from the shared cost model) ── */
  const breakdown = buildCostBreakdown(input.businessId, ctx);
  const setupCost = breakdown.total - breakdown.workingCapitalCost;
  // The cost model's working-capital weight targets roughly a 1–2 month buffer
  // for a typical rural micro-business; state the assumption transparently.
  const workingCapitalMonths = 2;
  const cost: CostSplit = {
    setupCost,
    workingCapital: breakdown.workingCapitalCost,
    workingCapitalMonths,
    totalProjectCost: breakdown.total,
    components: breakdown.components,
    notes: breakdown.notes,
  };

  /* ── Operating model (existing engine — one source for revenue/expenses) ── */
  const model = buildBusinessModel(input.businessId, userCapital, ctx);

  /* ── Funding split ── */
  const totalAvailableFunding = userCapital + otherFunding;
  const fundingGap = Math.max(0, cost.totalProjectCost - totalAvailableFunding);
  const loanRequired = fundingGap;
  // Recommended borrowing: try NOT to borrow ~1 month of operating expenses —
  // arrange that from own/family sources so a slow first month can't default the EMI.
  const oneMonthOps = Math.max(0, model.monthlyExpenses);
  const recommendedLoan = Math.max(0, Math.min(loanRequired, loanRequired - Math.min(loanRequired, oneMonthOps)));
  const funding: FundingSplit = {
    userCapital,
    otherFunding,
    totalAvailableFunding,
    totalProjectCost: cost.totalProjectCost,
    fundingGap,
    loanRequired,
    recommendedLoan,
    recommendedLoanMax: loanRequired,
    recommendationNote:
      loanRequired <= 0
        ? "Your total funding covers the estimated project cost — no loan is needed under current assumptions."
        : recommendedLoan < loanRequired
          ? `Try arranging about ${formatIndianCurrency(Math.min(loanRequired, oneMonthOps))} (≈1 month of operating expenses) from your own or family sources, and borrow only the remaining ${formatIndianCurrency(recommendedLoan)}.`
          : `The estimated funding gap is ${formatIndianCurrency(loanRequired)} — check the EMI against your operating profit before borrowing the full amount.`,
  };

  /* ── Loan + EMI via the shared repayment engine (single math source) ── */
  const loanAmount = fundingGap > 0 ? fundingGap : 0;
  const interestRate = loanAmount <= MICRO_LOAN_MAX ? MICRO_RATE : TERM_RATE;
  const tenureYears = loanAmount <= MICRO_LOAN_MAX ? 3 : DEFAULT_TENURE;
  const emi = monthlyEmi(loanAmount, interestRate, tenureYears);
  const schedule = loanAmount > 0
    ? calculateRepayment(loanAmount, interestRate, tenureYears, 0, "monthly")
    : null;
  const loan: LoanTerms = {
    amount: loanAmount,
    interestRate,
    tenureYears,
    emi,
    totalInterest: schedule?.totalInterest ?? 0,
    totalRepayment: schedule?.totalPayment ?? 0,
    isEstimate: true,
  };

  /* ── Profitability & EMI stress ── */
  const operatingProfit = model.monthlyProfit;
  const profitAfterEmi = operatingProfit - emi;
  const stressRatio = emi > 0 && operatingProfit > 0 ? emi / operatingProfit : null;
  let stressLevel: StressLevel;
  let stressLabel: string;
  let stressExplanation: string;
  if (emi <= 0) {
    stressLevel = "low";
    stressLabel = "No repayment pressure";
    stressExplanation = "No loan is needed under current assumptions — there is no EMI to service.";
  } else if (operatingProfit <= 0) {
    stressLevel = "high";
    stressLabel = "High repayment pressure";
    stressExplanation = "Estimated operating profit does not cover the EMI — reduce the loan, the scale, or the costs before borrowing.";
  } else if (stressRatio !== null && stressRatio <= 0.3) {
    stressLevel = "low";
    stressLabel = "Low repayment pressure";
    stressExplanation = `The estimated EMI uses about ${Math.round((stressRatio ?? 0) * 100)}% of the estimated operating profit — comfortably manageable.`;
  } else if (stressRatio !== null && stressRatio <= 0.5) {
    stressLevel = "medium";
    stressLabel = "Medium repayment pressure";
    stressExplanation = `The estimated EMI uses about ${Math.round((stressRatio ?? 0) * 100)}% of the estimated operating profit — manageable, but a slow month will feel tight.`;
  } else {
    stressLevel = "high";
    stressLabel = "High repayment pressure";
    stressExplanation = `The estimated EMI would use about ${stressRatio !== null ? Math.round(stressRatio * 100) : 100}% of the estimated operating profit — consider borrowing less or starting at a smaller scale.`;
  }
  const emiStress: EmiStress = { emi, operatingProfit, ratio: stressRatio, level: stressLevel, label: stressLabel, explanation: stressExplanation };

  /* ── Cash-flow warning ── */
  const cashFlowWarning =
    profitAfterEmi < 0
      ? `After the estimated EMI of ${formatIndianCurrency(emi)}, projected monthly cash is negative (${formatIndianCurrency(profitAfterEmi)}). Consider a smaller loan, a longer tenure, a smaller scale, or more own funding.`
      : null;

  /* ── Break-even: operating break-even (existing model) + investment payback ── */
  const monthlyOperatingSurplus = Math.max(1, operatingProfit);
  const investmentPaybackMonths =
    operatingProfit > 0 ? Math.ceil(cost.totalProjectCost / monthlyOperatingSurplus) : null;
  const breakEven = {
    operatingBreakEvenMonth: model.breakEvenMonth,
    operatingBreakEvenSales: model.breakEvenSales,
    investmentPaybackMonths: investmentPaybackMonths !== null ? investmentPaybackMonths : null,
    explanation:
      "Break-even is the estimated point at which your business recovers its initial investment. Operating break-even is when monthly revenue covers monthly costs; payback is when cumulative profit has covered the whole project cost.",
  };

  /* ── Scenarios ─── (optimistic is never presented as guaranteed) ── */
  const scenarios: Scenario[] = ([
    { id: "conservative", label: "Conservative", labelHi: "सावधान", rf: 0.75, note: "Slower customer build-up or softer prices — plan to survive this case." },
    { id: "expected", label: "Expected", labelHi: "सामान्य", rf: 1, note: "Typical outcome under the current assumptions." },
    { id: "optimistic", label: "Optimistic", labelHi: "अच्छी स्थिति", rf: 1.25, note: "If demand comes in stronger than expected — possible, not guaranteed." },
  ] as const).map((s) => {
    const revenue = Math.round(model.monthlyRevenue * s.rf);
    const expenses = Math.round(model.monthlyFixedCosts + revenue * (model.monthlyVariableCosts / Math.max(1, model.monthlyRevenue)));
    const profit = revenue - expenses;
    const afterEmi = profit - emi;
    const payback = profit > 0 ? Math.ceil(cost.totalProjectCost / profit) : null;
    return {
      id: s.id,
      label: s.label,
      labelHi: s.labelHi,
      revenueFactor: s.rf,
      monthlyRevenue: revenue,
      monthlyExpenses: expenses,
      monthlyProfit: profit,
      profitAfterEmi: afterEmi,
      paybackMonths: payback !== null ? Math.min(payback, 36) : null,
      note: s.note,
    };
  });

  /* ── Risk ── */
  const concerns: string[] = [];
  const positives: string[] = [];
  const gapRatio = cost.totalProjectCost > 0 ? fundingGap / cost.totalProjectCost : 0;
  if (fundingGap <= 0) positives.push("Your total funding covers the estimated project cost — no loan dependency");
  else if (gapRatio > 0.5) concerns.push(`${Math.round(gapRatio * 100)}% of the project depends on borrowed money`);
  else concerns.push(`A funding gap of ${formatIndianCurrency(fundingGap)} needs financing`);
  if (stressLevel === "high") concerns.push("The estimated EMI takes most of the operating profit");
  else if (stressLevel === "medium") concerns.push("EMI pressure is moderate — keep an emergency buffer");
  else if (emi > 0) positives.push("The estimated EMI is a small share of operating profit");
  if (model.profitMargin < 15) concerns.push(`Thin estimated margin of ${model.profitMargin}% leaves little room for shocks`);
  else if (model.profitMargin >= 25) positives.push(`Healthy estimated margin of ${model.profitMargin}%`);
  if (investmentPaybackMonths === null) concerns.push("Estimated payback exceeds 3 years under current assumptions");
  else if (investmentPaybackMonths <= 18) positives.push(`Estimated payback in about ${investmentPaybackMonths} months`);
  else concerns.push(`Estimated payback of ~${investmentPaybackMonths} months is long`);
  if (input.competitionDensity === "high") concerns.push("High local competition — customer acquisition may be slower");
  else if (input.competitionDensity === "low") positives.push("Low local competition in this category");
  if (model.monthlyFixedCosts / Math.max(1, model.monthlyRevenue) > 0.45) concerns.push("High fixed-cost share — sensitive to demand dips");
  if (concerns.length === 0) concerns.push("Limited local data — treat all figures as preliminary estimates");

  const riskLevel: StressLevel = concerns.length <= 1 && positives.length >= 2 ? "low" : concerns.length <= 2 ? "medium" : "high";
  const risk: RiskAssessment = {
    level: riskLevel,
    label: riskLevel === "low" ? "Low risk" : riskLevel === "medium" ? "Medium risk" : "High risk",
    reasons: { positive: positives, concerns },
  };

  /* ── Feasibility score (not profit-only) ── */
  const capitalRatio = cost.totalProjectCost > 0 ? totalAvailableFunding / cost.totalProjectCost : 0;
  const capitalFit = clamp01((capitalRatio - 0.2) / 0.8);
  const marginScore = clamp01(model.profitMargin / 30);
  const stressScore = emi <= 0 ? 1 : operatingProfit <= 0 ? 0 : clamp01(1 - stressRatio! / 0.6);
  const paybackScore =
    investmentPaybackMonths === null ? 0
      : investmentPaybackMonths <= 12 ? 1
      : clamp01(1 - (investmentPaybackMonths - 12) / 24);
  const competitionScore =
    input.competitionDensity === "low" ? 0.85 : input.competitionDensity === "high" ? 0.4 : 0.65;

  const factors: FeasibilityFactor[] = [
    { id: "capital", label: "Capital compatibility", score: pct(capitalFit), weight: 0.25, detail: `${formatIndianCurrency(totalAvailableFunding)} available vs ${formatIndianCurrency(cost.totalProjectCost)} estimated project cost` },
    { id: "profit", label: "Profitability", score: pct(marginScore), weight: 0.25, detail: `Estimated operating margin ${model.profitMargin}% at the chosen scale` },
    { id: "emi", label: "EMI affordability", score: pct(stressScore), weight: 0.2, detail: emi > 0 ? `EMI ${formatIndianCurrency(emi)} vs operating profit ${formatIndianCurrency(operatingProfit)}` : "No loan needed under current assumptions" },
    { id: "payback", label: "Break-even & payback", score: pct(paybackScore), weight: 0.15, detail: investmentPaybackMonths !== null ? `Estimated payback ~${investmentPaybackMonths} months` : "Payback not reached within 3 years under assumptions" },
    { id: "competition", label: "Competition", score: pct(competitionScore), weight: 0.15, detail: input.competitionDensity ? `${cap(input.competitionDensity)} estimated competition in the analysis area` : "Competition not yet analysed — using a neutral estimate" },
  ];
  const score = Math.round(factors.reduce((sum, f) => sum + f.score * f.weight, 0));
  const feasibility: FeasibilityResult = { score, factors };

  /* ── Data confidence ── */
  const confidence: AdvisoryPlan["confidence"] = [
    {
      label: "Cost estimates",
      level: input.placeStatus === "own" || input.placeStatus === "rent" ? "medium" : "low",
      why: input.placeStatus === "own" || input.placeStatus === "rent"
        ? "Based on your place arrangement and business-type cost weights — verify with local supplier quotations."
        : "Place status not decided — a typical arrangement was assumed. Confirm it to sharpen the estimate.",
    },
    {
      label: "Revenue estimates",
      level: "medium",
      why: "Based on typical performance for this business type in similar rural/semi-urban markets — verify local selling prices.",
    },
    {
      label: "Loan & EMI estimates",
      level: "medium",
      why: "EMI is calculated with standard formulae at indicative interest rates — actual bank terms decide the final EMI. Loan approval is never guaranteed.",
    },
    {
      label: "Competition & market",
      level: input.competitionDensity ? "medium" : "low",
      why: input.competitionDensity
        ? "Derived from the local market analysis for your location and radius."
        : "Not yet analysed — run the market analysis for your location for a sharper score.",
    },
  ];

  const assumptions = [
    ...model.assumptions,
    `Working capital of ${formatIndianCurrency(cost.workingCapital)} covers roughly the first ${workingCapitalMonths} months of operations.`,
    "Loan figures use indicative interest rates and a standard EMI formula — estimates only, never a guarantee of approval.",
  ];

  return {
    cost,
    funding,
    loan,
    emiStress,
    operating: {
      monthlyRevenue: model.monthlyRevenue,
      monthlyFixedCosts: model.monthlyFixedCosts,
      monthlyVariableCosts: model.monthlyVariableCosts,
      monthlyExpenses: model.monthlyExpenses,
      operatingProfit,
      profitMargin: model.profitMargin,
    },
    projection: model.timeline,
    profitAfterEmi,
    cashFlowWarning,
    breakEven,
    scenarios,
    risk,
    feasibility,
    confidence,
    assumptions,
  };
}

/** EMI simulator entry — keeps the exact same monthly EMI maths as the plan. */
export function simulateEmi(principal: number, annualRate: number, tenureYears: number) {
  const p = Math.max(0, safeNumber(principal));
  const emi = monthlyEmi(p, annualRate, tenureYears);
  const schedule = p > 0 ? calculateRepayment(p, annualRate, tenureYears, 0, "monthly") : null;
  return {
    principal: p,
    annualRate,
    tenureYears,
    emi,
    totalInterest: schedule?.totalInterest ?? 0,
    totalRepayment: schedule?.totalPayment ?? 0,
  };
}

/* ─── helpers ─── */

function monthlyEmi(principal: number, annualRatePct: number, tenureYears: number): number {
  const p = Math.max(0, safeNumber(principal));
  const n = Math.max(1, Math.round(tenureYears * 12));
  const r = annualRatePct / 12 / 100;
  if (p <= 0) return 0;
  if (r <= 0) return Math.round(p / n);
  const emi = (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return Math.round(emi);
}

function safeNumber(v: number | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return 0;
  return Math.round(v);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function pct(v: number): number {
  return Math.round(clamp01(v) * 100);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
