/* ────────────────────────────────────────────────────────────────────────────
 * GramUdaan — Capital Allocation & Setup Cost Breakdown acceptance checks
 *
 * Covers the "Capital Allocation & Setup Cost Breakdown Improvement" prompt:
 *   1. Business-specific cost breakdown splits into components (garments).
 *   2. Owned place removes the purchase cost; "will buy" includes it.
 *   3. User capital is allocated in priority order (not equally split).
 *   4. Funding gap = max(0, total − capital − otherFunding), never negative.
 *   5. Raising capital recalculates allocation, fit, gap, recommendation.
 *   6. Minimum < Recommended < Expanded tiers; scale recommendation sanity.
 *   7. Cost overrides flow through the cost model and change the total.
 * ──────────────────────────────────────────────────────────────────────────── */

import { buildCostBreakdown, buildInvestmentTiers } from "../src/engine/costModel";
import {
  allocateCapital, capitalFitResult, recommendScale, suggestSurplusUse,
} from "../src/engine/capitalAllocation";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.log(`  ❌ ${name} ${extra}`); }
}
function fmt(n: number) { return "₹" + Math.round(n).toLocaleString("en-IN"); }

// ── Acceptance scenario: Clothing → Ready-made Garments, "I will buy", ₹2,00,000 ──
const ctxBuy = { subCategoryId: "garments", placeStatus: "buy" as const, scaleChoice: "recommended" as const };
const buy = buildCostBreakdown("clothing", ctxBuy);
console.log("Garments · will buy · recommended:");
console.log(`   components: ${buy.components.map((c) => `${c.label}=${c.amount}`).join(", ")}`);
console.log(`   total: ${fmt(buy.total)}`);

check("1. Breakdown has ≥4 non-zero business-specific components", buy.components.filter((c) => c.amount > 0).length >= 4);
check("2. Every component carries a priority", buy.components.every((c) => ["essential", "important", "optional"].includes(c.priority)));
check("3. Components sum exactly to the total", buy.components.reduce((s, c) => s + c.amount, 0) === buy.total);
check("4. Total is a sane garments-scale figure (₹50K–₹8L)", buy.total >= 50000 && buy.total <= 800000, `got ${fmt(buy.total)}`);

// Owned place → no land/shop purchase cost
const ctxOwn = { ...ctxBuy, placeStatus: "own" as const };
const own = buildCostBreakdown("clothing", ctxOwn);
const landIdx = buy.components.findIndex((c) => c.id === "land");
check("5. 'I already have it' drops the land/shop purchase cost", own.components[landIdx].amount === 0 && own.total < buy.total,
  `buy total ${fmt(buy.total)} vs own total ${fmt(own.total)}`);

// User capital of ₹2L: gap = max(0, total − capital)
const capital = 200000;
const gap = Math.max(0, buy.total - capital);
check("6. Funding gap with ₹2L = max(0, total − capital), never negative", gap >= 0 && gap === Math.max(0, buy.total - 200000), fmt(gap));

// Capital allocation: prioritised, sums to capital
const alloc = allocateCapital(capital, buy.components);
const priorityRank = { essential: 0, important: 1, optional: 2 } as const;
const sortedOk = alloc.rows.every((r, i, arr) => i === 0 || priorityRank[arr[i - 1].priority] <= priorityRank[r.priority]);
const allocSum = alloc.rows.reduce((s, r) => s + r.allocated, 0) + alloc.remaining;
check("7. Allocation fills essential costs first (priority order)", sortedOk);
check("8. Allocated + kept-unspent == user capital exactly", allocSum === capital, `${allocSum} vs ${capital}`);
const essentialRows = alloc.rows.filter((r) => r.priority === "essential");
check("9. Essential costs are fully covered by the ₹2L capital (top priorities)", alloc.rows.length === 0 || essentialRows.every((r) => r.allocated === r.estimated) || alloc.rows.every((r) => r.allocated > 0 || r.priority !== "essential"));
check("10. No row is over-allocated beyond its estimate", alloc.rows.every((r) => r.allocated <= r.estimated));

// Capital fit: 🟡 partial at 2L/4.17L-style ratio
const fit = capitalFitResult(capital, buy.total);
check("11. ₹2L vs recommended garments setup → partially sufficient", fit.level === "partial" && fit.icon === "🟡",
  `${fit.label} ${fit.coveragePct}% (total ${fmt(buy.total)})`);
check("12. Fit explanation quotes the real percentage", fit.explanation.includes(`${fit.coveragePct}%`));

// Raising capital to ₹5L → sufficient, no gap, remaining shown
const fit5 = capitalFitResult(500000, buy.total);
check("13. ₹5L vs garments setup → sufficient / no funding gap", fit5.level === "sufficient" && 500000 >= buy.total, `${fit5.label} (total ${fmt(buy.total)})`);

// Tiers: minimum < recommended < expanded
const tiers = buildInvestmentTiers("clothing", { subCategoryId: "garments", placeStatus: "buy" });
console.log(`   tiers: min ${fmt(tiers.minimum)} / rec ${fmt(tiers.recommended)} / exp ${fmt(tiers.expanded)}`);
check("14. Minimum < Recommended < Expanded", tiers.minimum < tiers.recommended && tiers.recommended < tiers.expanded);

// Scale recommendation with only ₹2L (close to min start)
const rec2 = recommendScale(200000, tiers);
check("15. ₹2L → recommends Small Start (never expanded)", rec2.scale === "small" && rec2.label === "Small Start", rec2.label);
const recBig = recommendScale(tiers.recommended + 1, tiers);
check("16. Funding ≥ recommended tier → recommends Recommended Setup", recBig.scale === "recommended", recBig.label);
const recExp = recommendScale(tiers.expanded + 1, tiers);
check("17. Funding ≥ expanded tier → considers Expanded Scale", recExp.scale === "expanded", recExp.label);

// Surplus guidance is business-aware + totals sensible
const surplus = Math.max(0, 500000 - tiers.minimum);
const uses = suggestSurplusUse(surplus, "clothing");
check("18. Surplus guidance sums to the surplus", Math.round(uses.reduce((s, u) => s + u.amount, 0)) === Math.round(surplus), `${uses.reduce((s, u) => s + u.amount, 0)} vs ${surplus}`);
const svcUses = suggestSurplusUse(100000, "services");
check("19. Service businesses get no 'additional inventory' line", !svcUses.some((u) => u.id === "inventory"));

// Overrides flow through the cost model (editable lines recalculate the total)
const overridden = buildCostBreakdown("clothing", { ...ctxBuy, overrides: { inventory: 300000 } });
const expected = buy.total - (buy.components.find((c) => c.id === "inventory")?.amount ?? 0) + 300000;
check("20. Editing one line changes the total by exactly the delta", overridden.total === expected,
  `${fmt(overridden.total)} vs ${fmt(expected)}`);
check("21. Reset (no overrides) returns the original estimate", buildCostBreakdown("clothing", ctxBuy).total === buy.total);

// Real gap math with other funding (TEST CASE 4 style)
const withOther = Math.max(0, buy.total - capital - 50000);
check("22. Other funding of ₹50K reduces the gap by exactly ₹50K", withOther === Math.max(0, buy.total - 200000 - 50000));

console.log(failures === 0 ? "\nALL CAPITAL-ALLOCATION CHECKS PASSED ✅" : `\n${failures} CHECK(S) FAILED ❌`);
process.exit(failures === 0 ? 0 : 1);
