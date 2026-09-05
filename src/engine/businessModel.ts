/* ────────────────────────────────────────────────────────────────────────────
 * GramUdaan — Business Operating Model
 *
 * Deterministic, business-specific revenue → expenses → profit → timeline →
 * break-even → scale → capital utilization. All values are ESTIMATES for
 * decision support, clearly labelled, never presented as verified figures.
 * ──────────────────────────────────────────────────────────────────────────── */

import {
  resolveSubCategory,
  SCALE_FACTORS,
  type ScaleChoice,
  type PlaceStatus,
} from "@/data/businessConfig";
import { buildCostBreakdown, type CostContext } from "./costModel";

export interface MonthProjection {
  month: number;
  label: string;
  revenue: number;
  expenses: number;
  profit: number;       // operating profit / (loss) for the month
  cumulative: number;   // cumulative cash position from operations
}

export interface ScaleOption {
  id: ScaleChoice;
  label: string;
  labelHi: string;
  investment: number;
  revenue: number;      // steady-state monthly revenue
  expenses: number;     // steady-state monthly expenses
  profit: number;       // steady-state monthly profit
  margin: number;       // profit / revenue, %
  risk: "low" | "medium" | "high";
  breakEvenMonth: number | null;
  note: string;
}

export interface CapitalUtilization {
  availableCapital: number;
  requiredInvestment: number;      // recommended-scale setup requirement
  fundingGap: number;              // max(required - capital, 0)
  remainingCapital: number;        // max(capital - required, 0)
  allocationSuggestions: string[];
}

export interface ProfitRisk {
  level: "low" | "medium" | "high";
  label: string;
  reasons: { positive: string[]; concerns: string[] };
}

export interface BusinessModel {
  subCategoryId: string;
  subCategoryName: string;
  placeStatus: PlaceStatus;
  monthlyRevenue: number;        // steady-state revenue at chosen scale
  monthlyFixedCosts: number;
  monthlyVariableCosts: number;
  monthlyExpenses: number;
  monthlyProfit: number;
  profitMargin: number;          // %
  timeline: MonthProjection[];
  breakEvenMonth: number | null; // first month cumulative operations turn positive
  breakEvenSales: number;        // estimated monthly sales needed to cover costs
  scales: ScaleOption[];
  capital: CapitalUtilization;
  risk: ProfitRisk;
  assumptions: string[];
}

/* ─── helpers ─── */

const SCALE_LABELS: Record<ScaleChoice, { label: string; labelHi: string; note: string }> = {
  small: { label: "Small Start", labelHi: "छोटी शुरुआत", note: "Minimum setup — lowest risk, leaner revenue" },
  recommended: { label: "Recommended Scale", labelHi: "अनुशंसित पैमाना", note: "Typical setup for this business type" },
  expanded: { label: "Expanded Scale", labelHi: "बड़ा पैमाना", note: "Larger capacity — more investment and revenue" },
};

/** Revenue ramp shape: starts at ~25% in month 1 and reaches steady state after
 *  rampMonths. A new rural business rarely opens at half its steady revenue —
 *  the low early fractions produce the honest loss months that break-even and
 *  the cash-flow warnings depend on. */
function revenueForMonth(steady: number, month: number, rampMonths: number): number {
  if (rampMonths <= 1 || month > rampMonths) return steady;
  const progress = (month - 1) / rampMonths;
  const fraction = 0.25 + 0.75 * progress;
  return Math.round(steady * fraction);
}

function riskForScale(scale: ScaleChoice, margin: number, fundingGap: number, capital: number): "low" | "medium" | "high" {
  let score = 0;
  if (margin >= 25) score += 1;
  if (margin >= 40) score += 1;
  if (fundingGap <= 0) score += 1;
  if (fundingGap > 0 && fundingGap / Math.max(1, capital) > 0.5) score -= 1;
  if (scale === "expanded") score -= 1;
  if (scale === "small") score += 1;
  return score >= 2 ? "low" : score >= 0 ? "medium" : "high";
}

export function buildBusinessModel(
  businessId: string,
  capital: number,
  ctx: CostContext = {},
): BusinessModel {
  const sub = resolveSubCategory(businessId, ctx.subCategoryId);
  const placeStatus: PlaceStatus = ctx.placeStatus ?? "unsure";
  const scaleChoice: ScaleChoice = ctx.scaleChoice ?? "recommended";

  // Steady-state monthly revenue at recommended scale (midpoint of range)
  const steadyRecommended = Math.round((sub.monthlyRevenue[0] + sub.monthlyRevenue[1]) / 2);
  const factor = SCALE_FACTORS[scaleChoice] ?? 1;
  const monthlyRevenue = Math.round(steadyRecommended * factor);

  // Breakdown for this scale — the same ownership-aware model the cost engine uses
  const breakdown = buildCostBreakdown(businessId, { ...ctx, scaleChoice });
  const rent = placeStatus === "rent" ? breakdown.monthlyRentEstimate : 0;
  const monthlyFixedCosts = Math.round(sub.monthlyFixedCosts * factor) + rent;
  const monthlyVariableCosts = Math.round(monthlyRevenue * sub.variableCostRatio);
  const monthlyExpenses = monthlyFixedCosts + monthlyVariableCosts;
  const monthlyProfit = monthlyRevenue - monthlyExpenses;
  const profitMargin = monthlyRevenue > 0 ? Math.round((monthlyProfit / monthlyRevenue) * 100) : 0;

  // 12-month timeline
  const rampMonths = sub.rampMonths;
  const timeline: MonthProjection[] = [];
  let cumulative = 0;
  for (let m = 1; m <= 12; m++) {
    const revenue = revenueForMonth(monthlyRevenue, m, rampMonths);
    const expenses = Math.round(monthlyFixedCosts + revenue * sub.variableCostRatio);
    const profit = revenue - expenses;
    cumulative += profit;
    timeline.push({
      month: m,
      label: `M${m}`,
      revenue,
      expenses,
      profit,
      cumulative,
    });
  }

  // Break-even: first month where cumulative operating position turns non-negative
  let breakEvenMonth: number | null = null;
  for (const p of timeline) {
    if (p.cumulative >= 0) {
      breakEvenMonth = p.month;
      break;
    }
  }
  // Break-even sales: monthly revenue needed to cover all monthly costs
  const breakEvenSales = monthlyRevenue > 0
    ? Math.round(monthlyFixedCosts / Math.max(0.01, 1 - sub.variableCostRatio))
    : 0;

  // Capital utilization at recommended scale
  const recommendedBreakdown = buildCostBreakdown(businessId, { ...ctx, scaleChoice: "recommended" });
  const requiredInvestment = recommendedBreakdown.total;
  const fundingGap = Math.max(0, requiredInvestment - capital);
  const remainingCapital = Math.max(0, capital - requiredInvestment);

  const allocationSuggestions: string[] = [];
  if (remainingCapital > 0) {
    allocationSuggestions.push("Additional inventory for a wider product range");
    allocationSuggestions.push("Better / higher-capacity equipment");
    allocationSuggestions.push("Extra working capital buffer for the first 2–3 months");
    allocationSuggestions.push("Marketing & local promotions");
    if (remainingCapital > 50000) allocationSuggestions.push("Small expansion reserve for capacity growth");
  } else if (fundingGap > 0) {
    allocationSuggestions.push(`Funding gap of ₹${fundingGap.toLocaleString("en-IN")} — explore a smaller start scale or a financing option`);
  } else {
    allocationSuggestions.push("Your capital covers the recommended setup — keep an emergency reserve");
  }

  // Scale options (small / recommended / expanded)
  const scales: ScaleOption[] = (["small", "recommended", "expanded"] as ScaleChoice[]).map((sc) => {
    const f = SCALE_FACTORS[sc];
    const rev = Math.round(steadyRecommended * f);
    const inv = Math.round(breakdownTotalForScale(businessId, ctx, sc));
    const fixed = Math.round(sub.monthlyFixedCosts * f) + (placeStatus === "rent" ? breakdown.monthlyRentEstimate : 0);
    const varCosts = Math.round(rev * sub.variableCostRatio);
    const exp = fixed + varCosts;
    const profit = rev - exp;
    const margin = rev > 0 ? Math.round((profit / rev) * 100) : 0;
    const gapAtScale = Math.max(0, inv - capital);
    const risk = riskForScale(sc, margin, gapAtScale, capital);
    // break-even month at this scale (simple ramp estimate)
    let be: number | null = null;
    let cum = 0;
    for (let m = 1; m <= 12; m++) {
      const r = revenueForMonth(rev, m, sub.rampMonths);
      cum += r - Math.round(fixed + r * sub.variableCostRatio);
      if (cum >= 0) {
        be = m;
        break;
      }
    }
    return {
      id: sc,
      label: SCALE_LABELS[sc].label,
      labelHi: SCALE_LABELS[sc].labelHi,
      investment: inv,
      revenue: rev,
      expenses: exp,
      profit,
      margin,
      risk,
      breakEvenMonth: be,
      note: SCALE_LABELS[sc].note,
    };
  });

  // Profit-based risk assessment
  const riskReasons: { positive: string[]; concerns: string[] } = { positive: [], concerns: [] };
  if (profitMargin >= 25) riskReasons.positive.push(`Healthy estimated profit margin of ${profitMargin}%`);
  if (fundingGap <= 0) riskReasons.positive.push("Your capital covers the recommended setup — no loan dependency");
  if (breakEvenMonth !== null && breakEvenMonth <= 5) riskReasons.positive.push(`Estimated operating break-even around month ${breakEvenMonth}`);
  if (placeStatus === "own") riskReasons.positive.push("Own place — no rent or purchase burden");
  if (profitMargin < 15) riskReasons.concerns.push(`Thin estimated margin of ${profitMargin}% leaves little room for shocks`);
  if (fundingGap > 0) riskReasons.concerns.push(`Funding gap of ₹${fundingGap.toLocaleString("en-IN")} needs financing`);
  if (breakEvenMonth === null || breakEvenMonth > 9) riskReasons.concerns.push("Estimated break-even takes 9+ months — long payback under these assumptions");
  if (monthlyFixedCosts / Math.max(1, monthlyRevenue) > 0.45) riskReasons.concerns.push("High fixed-cost share of revenue — sensitive to demand dips");
  if (riskReasons.concerns.length === 0 && riskReasons.positive.length === 0) {
    riskReasons.concerns.push("Limited local data — treat all figures as preliminary estimates");
  }

  let riskLevel: "low" | "medium" | "high";
  if (riskReasons.concerns.length === 0) riskLevel = "low";
  else if (riskReasons.concerns.length <= 1 && riskReasons.positive.length >= 2) riskLevel = "low";
  else if (riskReasons.concerns.length <= 2) riskLevel = "medium";
  else riskLevel = "high";

  const assumptions = [
    `Revenue is estimated for a typical ${sub.name.toLowerCase()} setup in a rural/semi-urban market (steady-state month ${rampMonths}).`,
    "Expenses include fixed costs (rent, basic staff, utilities) and variable costs proportional to revenue.",
    "Profit shown is operating profit before loan repayment and taxes.",
    "Actual results vary with local prices, demand, season and management.",
  ];

  return {
    subCategoryId: sub.id,
    subCategoryName: sub.name,
    placeStatus,
    monthlyRevenue,
    monthlyFixedCosts,
    monthlyVariableCosts,
    monthlyExpenses,
    monthlyProfit,
    profitMargin,
    timeline,
    breakEvenMonth,
    breakEvenSales,
    scales,
    capital: {
      availableCapital: capital,
      requiredInvestment,
      fundingGap,
      remainingCapital,
      allocationSuggestions,
    },
    risk: { level: riskLevel, label: riskLevel === "low" ? "Lower risk" : riskLevel === "medium" ? "Moderate risk" : "Higher risk", reasons: riskReasons },
    assumptions,
  };
}

function breakdownTotalForScale(businessId: string, ctx: CostContext, scale: ScaleChoice): number {
  return buildCostBreakdown(businessId, { ...ctx, scaleChoice: scale }).total;
}