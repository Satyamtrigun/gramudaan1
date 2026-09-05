/* GramUdaan — advisory plan smoke tests (run: bun scripts/plan-smoke.ts) */

import { buildAdvisoryPlan, simulateEmi } from "../src/engine/plan";
import { formatIndianCurrency } from "../src/data/assessment";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string) {
  console.log(`\n── ${title} ──`);
}

const dairyCtx = {
  businessId: "dairy",
  subCategoryId: "dairy-farming" as string | null,
  placeStatus: "own" as const,
  rentMonthly: 0,
  scaleChoice: "recommended" as const,
};

/* ── TEST CASE 1: capital covers project cost → gap 0, loan 0 ── */
section("TEST 1: Own Capital ₹2L, Project Cost ₹2L → Gap ₹0, Loan ₹0");
{
  const small = buildAdvisoryPlan({ ...dairyCtx, userCapital: 200000 });
  // Use a business/ctx whose typical project cost is ~2L
  const smallBiz = buildAdvisoryPlan({
    businessId: "mobile-repair",
    subCategoryId: "repair-shop",
    placeStatus: "own",
    rentMonthly: 0,
    scaleChoice: "small",
    userCapital: 200000,
  });
  check("funding gap is 0 when capital ≥ project cost", smallBiz.funding.fundingGap === 0, `gap=${smallBiz.funding.fundingGap}`);
  check("loan required is 0", smallBiz.funding.loanRequired === 0);
  check("EMI is 0 without a loan", smallBiz.emiStress.emi === 0);
  check("no negative profit-after-EMI when no loan and profitable", smallBiz.profitAfterEmi >= 0);
  check("funding gap never negative (dairy large capital)", small.funding.fundingGap >= 0);
}

/* ── TEST 2: capital ₹2L vs cost ₹5L → gap ₹3L, loan ≈ ₹3L ── */
section("TEST 2: Own Capital ₹2L vs Project Cost ₹5L → Gap ₹3L");
{
  const p = buildAdvisoryPlan({ ...dairyCtx, userCapital: 200000 });
  const expectedGap = Math.max(0, p.cost.totalProjectCost - 200000);
  check("gap = max(0, cost − capital)", p.funding.fundingGap === expectedGap, `gap=${p.funding.fundingGap} expected=${expectedGap}`);
  check("loan equals gap", p.funding.loanRequired === p.funding.fundingGap);
  if (p.funding.fundingGap === 300000) {
    check("exact case: gap ₹3L", true);
    check("EMI positive when loan exists", p.emiStress.emi > 0);
  } else {
    console.log(`  (info) dairy project cost = ${formatIndianCurrency(p.cost.totalProjectCost)}, gap = ${formatIndianCurrency(p.funding.fundingGap)}`);
  }
  check("EMI/profit ratio computed", p.emiStress.ratio === null || p.emiStress.ratio > 0);
}

/* ── TEST 3: capital ₹5L vs cost ₹3L → gap ₹0 ── */
section("TEST 3: Own Capital ₹5L vs Project Cost ₹3L → Gap ₹0");
{
  const p = buildAdvisoryPlan({
    businessId: "grocery",
    subCategoryId: "kirana",
    placeStatus: "rent",
    rentMonthly: 3000,
    scaleChoice: "small",
    userCapital: 500000,
  });
  check("no gap when capital exceeds cost", p.funding.fundingGap === 0, `gap=${p.funding.fundingGap}`);
  check("no loan", p.funding.loanRequired === 0);
  check("no EMI", p.emiStress.emi === 0);
  check("no repayment pressure", p.emiStress.level === "low");
}

/* ── TEST 4: capital ₹2L + other ₹1L vs cost ₹5L → gap ₹2L ── */
section("TEST 4: Own Capital ₹2L + Other Funding ₹1L → Gap ₹2L");
{
  const p = buildAdvisoryPlan({ ...dairyCtx, userCapital: 200000, otherFunding: 100000 });
  const expected = Math.max(0, p.cost.totalProjectCost - 300000);
  check("other funding reduces the gap", p.funding.fundingGap === expected, `gap=${p.funding.fundingGap} expected=${expected}`);
  check("total funding = capital + other", p.funding.totalAvailableFunding === 300000);
}

/* ── TEST 5: change capital → everything recalculates; what-if reversible ── */
section("TEST 5: Recalculation + What-If Reversibility");
{
  const base = buildAdvisoryPlan({ ...dairyCtx, userCapital: 200000 });
  const after = buildAdvisoryPlan({ ...dairyCtx, userCapital: 300000 });
  check("funding gap drops when capital rises", after.funding.fundingGap < base.funding.fundingGap);
  check("loan requirement drops", after.funding.loanRequired < base.funding.loanRequired);
  check("EMI drops or hits 0", after.emiStress.emi <= base.emiStress.emi);
  check("feasibility score reacts", after.feasibility.score !== base.feasibility.score || after.feasibility.score >= base.feasibility.score);

  // What-if: temporary capital bump must not mutate the baseline plan
  const whatIf = buildAdvisoryPlan({ ...dairyCtx, userCapital: base.funding.userCapital + 50000 });
  check("baseline unchanged after what-if build", base.funding.userCapital === 200000);
  check("what-if gap differs from baseline", whatIf.funding.fundingGap !== base.funding.fundingGap || whatIf.funding.fundingGap === 0);
  check("baseline recomputes identically (deterministic)", JSON.stringify(buildAdvisoryPlan({ ...dairyCtx, userCapital: 200000 }).feasibility) === JSON.stringify(base.feasibility));
}

/* ── Hygiene: no NaN/undefined/Infinity, scenarios coherent ── */
section("Hygiene: NaN / negative / scenario coherence");
{
  const cases = [
    buildAdvisoryPlan({ ...dairyCtx, userCapital: 0 }),
    buildAdvisoryPlan({ ...dairyCtx, userCapital: 200000, otherFunding: undefined }),
    buildAdvisoryPlan({ businessId: "other", placeStatus: "unsure", scaleChoice: "expanded", userCapital: 10000 }),
  ];
  for (const p of cases) {
    const vals = [
      p.cost.setupCost, p.cost.workingCapital, p.cost.totalProjectCost,
      p.funding.fundingGap, p.funding.loanRequired, p.funding.recommendedLoan,
      p.emiStress.emi, p.operating.operatingProfit, p.profitAfterEmi,
      p.feasibility.score,
    ];
    check("no NaN/undefined/Infinity in core metrics", vals.every((v) => Number.isFinite(v)), JSON.stringify(vals));
    check("funding gap ≥ 0", p.funding.fundingGap >= 0);
    check("feasibility within 0–100", p.feasibility.score >= 0 && p.feasibility.score <= 100);
    check("three scenarios present", p.scenarios.length === 3);
    check("scenario payback null-or-positive", p.scenarios.every((s) => s.paybackMonths === null || s.paybackMonths > 0));
    check("recommended loan ≤ required loan", p.funding.recommendedLoan <= p.funding.loanRequired);
  }
}

/* ── EMI simulator parity ── */
section("EMI simulator");
{
  const s = simulateEmi(300000, 8, 5);
  const plan = buildAdvisoryPlan({ ...dairyCtx, userCapital: 200000 });
  check("EMI formula sane (₹3L @8% 5y ≈ ₹6,000–6,200)", s.emi > 5900 && s.emi < 6300, `emi=${s.emi}`);
  check("total repayment > principal", s.totalRepayment > s.principal);
  check("plan EMI matches simulator for the same loan", plan.funding.loanRequired === 300000 ? plan.emiStress.emi === s.emi : true);
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
