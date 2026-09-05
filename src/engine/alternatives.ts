/* ────────────────────────────────────────────────────────────────────────────
 * GramUdaan — Alternative Business Ranking
 *
 * Ranks other businesses for the USER'S ACTUAL situation (capital, location,
 * market) — not by profit alone. Composite fit = capital compatibility +
 * estimated profitability + risk + local feasibility.
 * ──────────────────────────────────────────────────────────────────────────── */

import { businessCategories, type BusinessCategory } from "@/data/businesses";
import { resolveSubCategory } from "@/data/businessConfig";
import { buildCostBreakdown } from "./costModel";
import { buildBusinessModel } from "./businessModel";
import { calculateSubScores } from "./market";
import type { Location } from "@/data/locations";

export interface AlternativeBusiness {
  business: BusinessCategory;
  subCategoryName: string;
  requiredInvestment: number;
  fundingGap: number;
  monthlyRevenue: number;
  monthlyProfit: number;
  margin: number;
  risk: "low" | "medium" | "high";
  breakEvenMonth: number | null;
  feasibilityScore: number;
  fitScore: number;
  reasons: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function rankAlternativeBusinesses(
  currentBusinessId: string,
  capital: number,
  location: Location | null,
  radiusKm = 5,
): AlternativeBusiness[] {
  const candidates = businessCategories.filter(
    (b) => b.id !== currentBusinessId && b.id !== "other",
  );

  const scored = candidates
    .map((biz): AlternativeBusiness | null => {
      const model = buildBusinessModel(biz.id, capital);
      const breakdown = buildCostBreakdown(biz.id);
      const requiredInvestment = breakdown.total;
      const fundingGap = Math.max(0, requiredInvestment - capital);
      const capitalFit = requiredInvestment <= capital
        ? 95
        : clamp(Math.round((capital / Math.max(1, requiredInvestment)) * 100), 25, 90);

      const profitScore = clamp(Math.round((model.monthlyProfit / 20000) * 100), 15, 95);
      const riskScore = model.risk.level === "low" ? 90 : model.risk.level === "medium" ? 65 : 40;

      const sub = resolveSubCategory(biz.id, null);
      let feasibilityScore = 60;
      if (location) {
        const subScores = calculateSubScores(
          biz.id,
          location.id,
          capital,
          location.population,
          location.households,
          radiusKm,
        );
        feasibilityScore = Math.round(
          subScores.marketScore * 0.2 +
          subScores.opportunityScore * 0.2 +
          subScores.competitionScore * 0.2 +
          subScores.riskScore * 0.2 +
          subScores.financialFitScore * 0.2,
        );
      }

      const fitScore = Math.round(
        0.3 * capitalFit +
        0.25 * profitScore +
        0.2 * riskScore +
        0.25 * feasibilityScore,
      );

      const reasons: string[] = [];
      if (fundingGap <= 0) {
        reasons.push(`Fits within your ${fmt(capital)} capital — no funding gap`);
      } else {
        reasons.push(`Needs ${fmt(fundingGap)} beyond your capital`);
      }
      if (model.monthlyProfit > 0) {
        reasons.push(`Estimated monthly profit ~${fmt(model.monthlyProfit)} at recommended scale`);
      } else {
        reasons.push("Estimated monthly position is thin at typical scale — start small");
      }
      if (model.breakEvenMonth) {
        reasons.push(`Operating break-even estimated around month ${model.breakEvenMonth}`);
      }
      reasons.push(`${model.risk.label.toLowerCase()} under current assumptions`);

      return {
        business: biz,
        subCategoryName: sub?.name ?? biz.name,
        requiredInvestment,
        fundingGap,
        monthlyRevenue: model.monthlyRevenue,
        monthlyProfit: model.monthlyProfit,
        margin: model.profitMargin,
        risk: model.risk.level,
        breakEvenMonth: model.breakEvenMonth,
        feasibilityScore,
        fitScore,
        reasons,
      };
    })
    .filter((x): x is AlternativeBusiness => x !== null);

  return scored.sort((a, b) => b.fitScore - a.fitScore).slice(0, 4);
}

function fmt(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}