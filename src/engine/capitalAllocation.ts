/* ────────────────────────────────────────────────────────────────────────────
 * GramUdaan — Capital Allocation Engine
 *
 * Pure, deterministic helpers that decide where the user's own capital goes:
 *   • allocateCapital      — fills costs in priority order (essential first),
 *                            never dividing money equally across categories.
 *   • capitalFitResult     — 🟢/🟡/🔴 sufficiency with real percentages.
 *   • recommendScale       — smallest tier the available funding can cover.
 *   • suggestSurplusUse    — guidance for money left over above minimum start.
 *
 * Everything here derives from the shared cost model — no numbers are
 * duplicated in React components.
 * ──────────────────────────────────────────────────────────────────────────── */

import { formatIndianCurrency } from "@/data/assessment";
import type { CostComponent, CostPriority, InvestmentTiers } from "./costModel";
import type { ScaleChoice } from "@/data/businessConfig";

const PRIORITY_RANK: Record<CostPriority, number> = { essential: 0, important: 1, optional: 2 };

export interface CapitalAllocationRow {
  id: string;
  label: string;
  labelHi: string;
  estimated: number;
  allocated: number;
  pctOfCapital: number; // 0..1 share of the user's own capital
  priority: CostPriority;
}

export interface CapitalAllocation {
  rows: CapitalAllocationRow[];
  totalAllocated: number;
  remaining: number;
}

/** Fill each cost line in priority order (essential → important → optional),
 *  taking as much as each line needs until the capital runs out. */
export function allocateCapital(capital: number, components: CostComponent[]): CapitalAllocation {
  const c = Math.max(0, capital);
  const rows: CapitalAllocationRow[] = components
    .filter((comp) => comp.amount > 0)
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        b.amount - a.amount,
    )
    .map((comp) => ({
      id: comp.id,
      label: comp.label,
      labelHi: comp.labelHi,
      estimated: comp.amount,
      allocated: 0,
      pctOfCapital: 0,
      priority: comp.priority,
    }));

  let remaining = c;
  for (const row of rows) {
    const take = Math.min(row.estimated, remaining);
    row.allocated = take;
    remaining -= take;
  }

  return {
    rows,
    totalAllocated: c - remaining,
    remaining: Math.max(0, remaining),
  };
}

export type CapitalFitLevel = "sufficient" | "partial" | "insufficient";

export interface CapitalFit {
  level: CapitalFitLevel;
  icon: string;
  label: string;
  coveragePct: number; // actual % of the setup requirement the funding covers
  explanation: string;
}

export function capitalFitResult(totalAvailable: number, totalRequired: number): CapitalFit {
  const available = Math.max(0, totalAvailable);
  const required = Math.max(0, totalRequired);
  const coverage = required > 0 ? available / required : 1;
  const coveragePct = Math.round(coverage * 100);
  const gap = Math.max(0, required - available);

  if (coverage >= 1) {
    return {
      level: "sufficient",
      icon: "🟢",
      label: "Sufficient",
      coveragePct: Math.min(coveragePct, 100),
      explanation: `Your available funding of ${formatIndianCurrency(available)} covers the estimated setup requirement of ${formatIndianCurrency(required)} — no external funding is needed under current assumptions.${
        available > required ? ` You would have ${formatIndianCurrency(available - required)} left over to keep as a buffer or use for growth.` : ""
      }`,
    };
  }
  if (coverage >= 0.4) {
    return {
      level: "partial",
      icon: "🟡",
      label: "Partially sufficient",
      coveragePct,
      explanation: `Your current funding can cover approximately ${coveragePct}% of the estimated setup requirement. Additional funding of approximately ${formatIndianCurrency(gap)} may be required.`,
    };
  }
  return {
    level: "insufficient",
    icon: "🔴",
    label: "Significant funding gap",
    coveragePct,
    explanation: `Your current funding covers only about ${coveragePct}% of the estimated setup requirement. Starting at a smaller scale or arranging more funding first is strongly recommended.`,
  };
}

export interface ScaleRecommendation {
  scale: ScaleChoice;
  label: string;
  reason: string;
}

/** Smallest tier the available funding can cover — never over-recommends. */
export function recommendScale(totalAvailable: number, tiers: InvestmentTiers): ScaleRecommendation {
  const available = Math.max(0, totalAvailable);
  if (available >= tiers.expanded) {
    return {
      scale: "expanded",
      label: "Expanded Scale",
      reason: "Your available funding covers the expanded setup — you can plan for higher capacity and inventory from day one.",
    };
  }
  if (available >= tiers.recommended) {
    return {
      scale: "recommended",
      label: "Recommended Setup",
      reason: "Your available funding covers the recommended setup for this business type.",
    };
  }
  if (available >= tiers.minimum) {
    return {
      scale: "small",
      label: "Small Start",
      reason: "Your available funding is close to the minimum start requirement — starting smaller can reduce borrowing and financial risk.",
    };
  }
  return {
    scale: "small",
    label: "Small Start",
    reason: "Your available funding is below even the minimum start estimate. Start very small and grow step by step, or arrange more funding first.",
  };
}

export interface SurplusUseRow {
  id: string;
  label: string;
  hint: string;
  pct: number; // 0..1 share of the surplus
  amount: number;
}

/** Suggested use of money left over after the minimum start — guidance only.
 *  The split is business-family aware (stock-heavy businesses get an
 *  inventory line; service businesses do not). */
export function suggestSurplusUse(surplus: number, businessId: string): SurplusUseRow[] {
  const s = Math.max(0, surplus);
  const hasInventory = businessId !== "services";
  const splits: { id: string; label: string; hint: string; pct: number }[] = [
    { id: "workingCapital", label: "Working capital reserve", hint: "Cash to cover slow months without stress", pct: 0.3 },
    ...(hasInventory ? [{ id: "inventory", label: "Additional inventory / stock", hint: "Better variety attracts more customers", pct: 0.25 }] : []),
    { id: "equipment", label: "Equipment upgrade", hint: "Faster or better output over time", pct: 0.15 },
    { id: "marketing", label: "Marketing & branding", hint: "Signage, local ads, launch offers", pct: 0.1 },
    { id: "emergency", label: "Emergency reserve", hint: "Keep aside for unexpected costs", pct: 0.1 },
    { id: "keep", label: "Keep unspent", hint: "No pressure to invest every rupee", pct: 0.1 },
  ];
  return splits.map((r) => ({ ...r, amount: Math.round(s * r.pct) }));
}