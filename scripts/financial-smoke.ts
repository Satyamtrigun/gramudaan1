/**
 * Scenario smoke test for the business-context-aware financial model
 * (replaces the old contribution × 10 behaviour).
 *
 * Run: bun scripts/financial-smoke.ts
 */
import { calculateProjectCost, calculateLoan, calculateAffordability, startupCostRange } from "../src/engine/financial";
import { generateFeasibility } from "../src/data/feasibility";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

let failures = 0;
function check(label: string, cond: boolean, detail: string) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!cond) failures++;
}

/* ── Scenario A: Dairy + ₹2,00,000 ── */
{
  const pc = calculateProjectCost(200000, "dairy");
  const loan = calculateLoan(200000, "dairy");
  const range = startupCostRange("dairy");
  const gap = Math.max(0, pc.totalProjectCost - 200000);
  console.log(`\nScenario A — Dairy, ₹2L (range ${inr(range.min)}–${inr(range.max)})`);
  console.log(`  projectCost=${inr(pc.totalProjectCost)} gap=${inr(gap)} loan=${loan ? inr(loan.loanAmount) : "none"}`);
  check("A: NOT the old ₹20L (10x) figure", pc.totalProjectCost !== 2000000, `cost is ${inr(pc.totalProjectCost)}`);
  check("A: cost within dairy range", pc.totalProjectCost >= range.min && pc.totalProjectCost <= range.max, inr(pc.totalProjectCost));
  check("A: funding gap is a realistic ₹1L", gap === 100000, inr(gap));
}

/* ── Scenario B: Mobile Repair + ₹50,000 ── */
{
  const pc = calculateProjectCost(50000, "mobile-repair");
  const loan = calculateLoan(50000, "mobile-repair");
  const range = startupCostRange("mobile-repair");
  const gap = Math.max(0, pc.totalProjectCost - 50000);
  console.log(`\nScenario B — Mobile Repair, ₹50K (range ${inr(range.min)}–${inr(range.max)})`);
  console.log(`  projectCost=${inr(pc.totalProjectCost)} gap=${inr(gap)} loan=${loan ? inr(loan.loanAmount) : "none"}`);
  check("B: NOT 10x (₹5L)", pc.totalProjectCost !== 500000, `cost is ${inr(pc.totalProjectCost)}`);
  check("B: small-business scale (< ₹2L)", pc.totalProjectCost < 200000, inr(pc.totalProjectCost));
  check("B: gap equals typical − contribution", gap === 65000, inr(gap));
}

/* ── Scenario C: Grocery + ₹5,00,000 ── */
{
  const pc = calculateProjectCost(500000, "grocery");
  const loan = calculateLoan(500000, "grocery");
  const range = startupCostRange("grocery");
  const gap = Math.max(0, pc.totalProjectCost - 500000);
  console.log(`\nScenario C — Grocery, ₹5L (range ${inr(range.min)}–${inr(range.max)})`);
  console.log(`  projectCost=${inr(pc.totalProjectCost)} gap=${inr(gap)} loan=${loan ? inr(loan.loanAmount) : "none"}`);
  check("C: cost capped at typical grocery scope", pc.totalProjectCost <= range.max, inr(pc.totalProjectCost));
  check("C: no artificial loan", loan === null || loan.loanAmount === 0, loan ? inr(loan.loanAmount) : "none");
}

/* ── Scenario D: Contribution covers the estimated project cost → ₹0 gap ── */
{
  const pc = calculateProjectCost(600000, "dairy"); // above dairy max 5L
  const loan = calculateLoan(600000, "dairy");
  const gap = Math.max(0, pc.totalProjectCost - 600000);
  const aff = calculateAffordability(600000, "dairy", "loc-1");
  console.log(`\nScenario D — Dairy, ₹6L (contribution covers typical setup)`);
  console.log(`  projectCost=${inr(pc.totalProjectCost)} gap=${inr(gap)} loan=${loan ? inr(loan.loanAmount) : "none"}`);
  check("D: funding gap is ₹0", gap === 0, inr(gap));
  check("D: no financing manufactured", loan === null || loan.loanAmount === 0, loan ? inr(loan.loanAmount) : "none");
  check("D: affordability is comfortable", aff.rating === "comfortable", aff.ratingLabel);
}

/* ── End-to-end: analysis payload matches the engine (single source of truth) ── */
{
  const f = generateFeasibility("dairy", 200000, "loc-1", 10);
  const pc = calculateProjectCost(200000, "dairy");
  console.log(`\nEnd-to-end — Dairy ₹2L dashboard payload`);
  console.log(`  dashboard totalProjectCost=${inr(f.financial.totalProjectCost)} engine=${inr(pc.totalProjectCost)}`);
  check("Payload project cost matches engine", f.financial.totalProjectCost === pc.totalProjectCost, inr(f.financial.totalProjectCost));
  check("Payload is consistent (≠ ₹20L)", f.financial.totalProjectCost !== 2000000, inr(f.financial.totalProjectCost));
}

console.log(failures === 0 ? "\nALL SCENARIOS PASSED" : `\n${failures} SCENARIO FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
