/* ────────────────────────────────────────────────────────────────────────────
 * GramUdaan smoke test — judge-requested scenarios.
 * Run: bun scripts/gramudaan-smoke.ts
 * ──────────────────────────────────────────────────────────────────────────── */
import { generateFeasibility } from "../src/data/feasibility";
import { buildCostBreakdown } from "../src/engine/costModel";
import { buildBusinessModel } from "../src/engine/businessModel";
import { rankAlternativeBusinesses } from "../src/engine/alternatives";
import { locations } from "../src/data/locations";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${detail}`);
  }
}

const loc = locations.find((l) => l.id === "loc-1") || locations[0];

console.log("\n=== 1. Ownership-aware costing (Dairy, own land vs rent, ₹2L) ===");
const own = buildCostBreakdown("dairy", { subCategoryId: "dairy-farming", placeStatus: "own", scaleChoice: "recommended" });
const rent = buildCostBreakdown("dairy", { subCategoryId: "dairy-farming", placeStatus: "rent", scaleChoice: "recommended" });
console.log(`  own: land=₹${own.landCost} total=₹${own.total}; rent: land=₹${rent.landCost} total=₹${rent.total}`);
check("Own land → land purchase cost is 0", own.landCost === 0);
check("Rent → land purchase cost is 0", rent.landCost === 0);
check("Own-place total ≤ rent total (rent keeps fit-out)", own.total <= rent.total);
check("Renting carries a monthly rent estimate", rent.monthlyRentEstimate > 0);
check("Breakdown components sum to total", own.components.reduce((s, c) => s + c.amount, 0) === own.total);

console.log("\n=== 2. Buy vs own (Grocery shop) ===");
const buyShop = buildCostBreakdown("grocery", { subCategoryId: "kirana", placeStatus: "buy" });
const ownShop = buildCostBreakdown("grocery", { subCategoryId: "kirana", placeStatus: "own" });
check("Buy → shop purchase included", buyShop.landCost > 0);
check("Own → shop purchase excluded", ownShop.landCost === 0);
check("Buy total > own total", buyShop.total > ownShop.total);

console.log("\n=== 3. Capital sufficiency — Grocery ₹5L (no manufactured loan) ===");
const grocery = generateFeasibility("grocery", 500000, "loc-1", 5, {
  subCategoryId: "kirana", placeStatus: "own", scaleChoice: "recommended",
});
check("Funding gap is ₹0", grocery.financial.potentialLoan === 0 || grocery.financial.projectCostBreakdown?.agencyFunding === 0);
check("profitModel.capital.fundingGap = 0", grocery.profitModel?.capital.fundingGap === 0);
check("Remaining capital > 0 with allocation ideas", (grocery.profitModel?.capital.remainingCapital ?? 0) > 0 && (grocery.profitModel?.capital.allocationSuggestions.length ?? 0) > 0);

console.log("\n=== 4. Realistic small scale — Mobile Repair ₹50K ===");
const mobile = generateFeasibility("mobile-repair", 50000, "loc-1", 5, {
  subCategoryId: "repair-shop", placeStatus: "rent", rentMonthly: 3000, scaleChoice: "small",
});
const mobileTotal = mobile.financial.totalProjectCost;
console.log(`  mobile repair small-scale project cost: ₹${mobileTotal.toLocaleString("en-IN")}`);
check("Project cost is realistic (< ₹3L, not ₹20L)", mobileTotal > 0 && mobileTotal < 300000);
check("Profit timeline exists (12 months)", mobile.profitModel?.timeline.length === 12);
check("Scale options exist (small/recommended/expanded)", (mobile.profitModel?.scales.length ?? 0) === 3);
const small = mobile.profitModel!.scales[0];
const expanded = mobile.profitModel!.scales[2];
check("Expanded investment > small investment", expanded.investment > small.investment);
check("Expanded profit ≥ small profit", expanded.profit >= small.profit);

console.log("\n=== 5. Sub-category changes cost & revenue (Dairy variants) ===");
const farm = buildBusinessModel("dairy", 200000, { subCategoryId: "dairy-farming", placeStatus: "own" });
const collection = buildBusinessModel("dairy", 200000, { subCategoryId: "milk-collection", placeStatus: "own" });
console.log(`  dairy-farming rev=₹${farm.monthlyRevenue}; milk-collection rev=₹${collection.monthlyRevenue}`);
check("Sub-categories produce different revenue estimates", farm.monthlyRevenue !== collection.monthlyRevenue);
const fFarm = generateFeasibility("dairy", 200000, "loc-1", 5, { subCategoryId: "dairy-farming", placeStatus: "own" });
const fCollection = generateFeasibility("dairy", 200000, "loc-1", 5, { subCategoryId: "milk-collection", placeStatus: "own" });
check("Dashboard cost differs by sub-category", fFarm.costBreakdown!.total !== fCollection.costBreakdown!.total);

console.log("\n=== 6. Profit timeline / loss-to-profit / break-even ===");
const dairy = generateFeasibility("dairy", 200000, "loc-1", 5, {
  subCategoryId: "dairy-farming", placeStatus: "own", scaleChoice: "recommended",
});
const tl = dairy.profitModel!.timeline;
console.log(`  Dairy M1=₹${tl[0].profit} · M6=₹${tl[5].profit} · M12=₹${tl[11].profit} (high-margin — no loss month expected)`);
const profitBy12 = tl.some((p) => p.profit >= 0);
check("Profit appears within 12 months", profitBy12);
check("Break-even month computed", dairy.profitModel!.breakEvenMonth !== null && dairy.profitModel!.breakEvenMonth! >= 1);
check("Break-even sales > 0", dairy.profitModel!.breakEvenSales > 0);
check("Revenue ramps up over months", tl[11].revenue > tl[0].revenue);

// Kirana has a high variable-cost ratio — early months should show a loss.
const kirana = generateFeasibility("grocery", 100000, "loc-1", 5, {
  subCategoryId: "kirana", placeStatus: "rent", rentMonthly: 4000, scaleChoice: "recommended",
});
const ktl = kirana.profitModel!.timeline;
console.log(`  Kirana M1=₹${ktl[0].profit} · M6=₹${ktl[5].profit} · M12=₹${ktl[11].profit}`);
check("Kirana early months show a loss (loss-to-profit progression)", ktl[0].profit < 0);
check("Kirana turns profitable within 12 months", ktl.some((p) => p.profit >= 0));

console.log("\n=== 7. Alternatives ranked for capital (Dairy ₹2L at loc-1) ===");
const alts = rankAlternativeBusinesses("dairy", 200000, loc, 5);
check("At least 3 alternatives returned", alts.length >= 3);
check("Ranked by fit score desc", alts.every((a, i) => i === 0 || alts[i - 1].fitScore >= a.fitScore));
console.log(`  top: ${alts.slice(0, 3).map((a) => `${a.business.name}(${a.fitScore})`).join(", ")}`);
check("Alternatives include reasons", alts[0].reasons.length > 0);
const feasibility = generateFeasibility("dairy", 200000, "loc-1", 5, { subCategoryId: "dairy-farming", placeStatus: "own" });
check("Alternatives surfaced on feasibility payload", (feasibility.alternatives?.length ?? 0) >= 3);

console.log("\n=== 8. Profit-based risk present ===");
check("Risk level + reasons on model", dairy.profitModel!.risk.level !== null && (dairy.profitModel!.risk.reasons.positive.length + dairy.profitModel!.risk.reasons.concerns.length) > 0);

console.log("\n=== 9. Scale change re-runs feasibility consistently ===");
const smallScale = generateFeasibility("dairy", 200000, "loc-1", 5, { subCategoryId: "dairy-farming", placeStatus: "own", scaleChoice: "small" });
check("Small scale costs less than recommended", smallScale.costBreakdown!.total < dairy.costBreakdown!.total);
check("Small scale has lower monthly profit", smallScale.profitModel!.monthlyProfit < dairy.profitModel!.monthlyProfit);

console.log("\n=== 10. No place change (unsure) uses typical arrangement ===");
const unsure = buildCostBreakdown("grocery", { subCategoryId: "kirana", placeStatus: "unsure" });
check("Unsure → typical full breakdown (land included)", unsure.landCost > 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);