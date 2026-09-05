import { analyzeMarketReach, analyzeOpportunity, generateSWOT, identifyRisks, mapCompetitors, analyzePricing, calculateSubScores } from "@/engine/market";
import { calculateProjectCost, calculateRepayment, calculateLoan, calculateAffordability } from "@/engine/financial";
import type { CostContext } from "@/engine/costModel";
import { buildCostBreakdown } from "@/engine/costModel";
import { buildBusinessModel } from "@/engine/businessModel";
import { rankAlternativeBusinesses } from "@/engine/alternatives";
import type { FeasibilityData } from "./feasibility-types";
import { locations } from "./locations";

export type { FeasibilityData };

export function generateFeasibility(
  businessId: string,
  capital: number,
  locationId: string,
  radiusKm = 5,
  options?: CostContext,
): FeasibilityData {
  // Get location data
  const location = locations.find((l) => l.id === locationId) || locations[0];

  // ─── Market Analysis ───
  const marketReach = analyzeMarketReach(
    location.population,
    location.households,
    radiusKm,
    businessId,
  );

  const opportunity = analyzeOpportunity(businessId, locationId);
  const swot = generateSWOT(businessId, locationId, capital);
  const risks = identifyRisks(businessId, locationId, capital);
  const competition = mapCompetitors(businessId, locationId, radiusKm);
  const pricing = analyzePricing(businessId, locationId);

  // ─── Financial Engine (business-context aware — no universal multiplier) ───
  const projectCost = calculateProjectCost(capital, businessId, options);
  const rawLoan = calculateLoan(capital, businessId, options);
  // Financing is only presented when there is a real gap between the estimated
  // project cost and the user's own contribution.
  const fundingGap = Math.max(0, projectCost.totalProjectCost - capital);
  const loanInfo = rawLoan && rawLoan.loanAmount > 0 && fundingGap > 0 ? rawLoan : null;
  const affordability = calculateAffordability(capital, businessId, locationId, options);

  // ─── GramUdaan: transparent cost breakdown, operating/profit model, alternatives ───
  const costBreakdown = buildCostBreakdown(businessId, options);
  const profitModel = buildBusinessModel(businessId, capital, options);
  const alternatives = rankAlternativeBusinesses(businessId, capital, location, radiusKm);

  // ─── Sub-Scores ───
  const subScores = calculateSubScores(
    businessId,
    locationId,
    capital,
    location.population,
    location.households,
    radiusKm,
  );

  // ─── Overall Score ───
  const overallScore = Math.round(
    subScores.marketScore * 0.2 +
    subScores.opportunityScore * 0.2 +
    subScores.competitionScore * 0.2 +
    subScores.riskScore * 0.2 +
    subScores.financialFitScore * 0.2,
  );

  const verdict: "good" | "caution" | "rethink" =
    overallScore >= 70 ? "good" : overallScore >= 50 ? "caution" : "rethink";

  const verdictLabel =
    verdict === "good"
      ? "Good Potential"
      : verdict === "caution"
        ? "Proceed Carefully"
        : "Consider Alternatives";

  // ─── Financial Display ───
  let repaymentDisplay = "N/A";
  let monthlyRepaymentDisplay = "N/A";

  if (loanInfo) {
    const schedule = calculateRepayment(
      loanInfo.loanAmount,
      loanInfo.interestRate,
      loanInfo.tenureYears,
      loanInfo.moratoriumMonths,
      "quarterly",
    );

    const payingEntries = schedule.entries.filter((e) => e.payment > 0);
    if (payingEntries.length > 0) {
      const avgQuarterly =
        payingEntries.reduce((sum, e) => sum + e.payment, 0) / payingEntries.length;
      const monthlyEquiv = Math.round(avgQuarterly / 3);
      repaymentDisplay = `₹${monthlyEquiv.toLocaleString("en-IN")} / month`;
      monthlyRepaymentDisplay = `₹${monthlyEquiv.toLocaleString("en-IN")} / month`;
    }
  }

  // ─── Decision ───
  const whyPoints: string[] = [];
  const watchOuts: string[] = [];

  if (marketReach.households > 3000) {
    whyPoints.push(`Strong reachable customer base of ${marketReach.households.toLocaleString("en-IN")} households`);
  } else {
    whyPoints.push(`Reachable market of ${marketReach.households.toLocaleString("en-IN")} households — smaller but viable`);
  }

  if (competition.density === "low") {
    whyPoints.push("Low competition in your business category");
  } else if (competition.density === "medium") {
    whyPoints.push("Moderate competition — room for differentiation");
  } else {
    watchOuts.push("High competition density — differentiation will be critical");
  }

  if (fundingGap <= 0) {
    whyPoints.push("Your contribution covers the estimated project cost — no external financing needed");
  } else if (!projectCost.isLimitExceeded) {
    whyPoints.push("The funding gap fits within an applicable financing framework");
  } else {
    watchOuts.push("Your project cost exceeds the scheme maximum — you will need a compliant structure");
  }

  if (fundingGap <= 0) {
    whyPoints.push("No loan repayment burden — cash flow stays with the business");
  } else if (affordability.rating === "comfortable") {
    whyPoints.push("Revenue projections suggest comfortable loan repayment");
  } else if (affordability.rating === "tight") {
    watchOuts.push("Loan repayment will be tight relative to expected revenue");
  } else {
    watchOuts.push("Revenue may not comfortably cover loan repayment — proceed with caution");
  }

  watchOuts.push("Supply dependency on limited wholesale markets");
  watchOuts.push("Seasonal demand variations throughout the year");

  // ─── Return ───
  return {
    overallScore,
    verdict,
    verdictLabel,
    subScores,

    marketReach: {
      population: marketReach.population,
      households: marketReach.households,
      potentialCustomers: marketReach.estimatedConsumers,
      nearbyVillages: marketReach.nearbyVillages,
      customerGroups: marketReach.customerGroups.map((c) => c.name),
      distributionChannels: marketReach.distributionChannels,
      summary: marketReach.summary,
      confidence: marketReach.confidence,
    },

    opportunity: {
      existingBusinesses: opportunity.existingBusinesses,
      underserved: opportunity.underservedDetail,
      alternatives: opportunity.alternatives,
      summary: opportunity.summary,
      opportunityScore: opportunity.opportunityScore,
      highCompetitionWarning: opportunity.highCompetitionWarning,
    },

    swot,

    risks: risks.map((r) => ({
      id: r.id,
      name: r.name,
      severity: r.severity,
      impact: r.impact,
      explanation: r.explanation,
      mitigation: r.mitigation,
    })),

    competition: {
      totalBusinesses: competition.totalBusinesses,
      density: competition.density,
      competitors: competition.competitors,
      summary: competition.summary,
    },

    pricing: {
      regionalPrice: `₹${pricing.regionalPrice}`,
      competitorRange: `₹${pricing.competitorRangeLow} – ₹${pricing.competitorRangeHigh}`,
      recommendedPrice: `₹${pricing.recommendedPrice}`,
      explanation: pricing.explanation,
      unit: pricing.unit,
      purchasingPower: pricing.purchasingPower,
      demandIndicator: pricing.demandIndicator,
    },

    financial: {
      availableContribution: capital,
      totalProjectCost: projectCost.totalProjectCost,
      potentialLoan: projectCost.agencyFunding,
      recommendedScheme: fundingGap <= 0
        ? "Not required — contribution covers the estimated project cost"
        : loanInfo
          ? loanInfo.scheme.name
          : "No applicable scheme",
      repayment: repaymentDisplay,
      monthlyEstimate: `Expected monthly revenue: ₹${affordability.expectedMonthlyRevenue.toLocaleString("en-IN")} – ₹${Math.round(affordability.expectedMonthlyRevenue * 1.4).toLocaleString("en-IN")}`,
      projectCostBreakdown: projectCost,
      loanDetails: loanInfo
        ? {
            amount: loanInfo.loanAmount,
            interestRate: loanInfo.interestRate,
            tenure: loanInfo.tenureYears,
            moratorium: loanInfo.moratoriumMonths,
          }
        : null,
      affordability: {
        rating: affordability.rating,
        ratingLabel: affordability.ratingLabel,
        ratingIcon: affordability.ratingIcon,
        expectedRevenue: affordability.expectedMonthlyRevenue,
        operatingCosts: affordability.operatingCosts,
        cashFlow: affordability.monthlyCashFlow,
        monthlyRepayment: affordability.monthlyRepayment,
        surplus: affordability.surplusOrDeficit,
        assumptions: affordability.assumptions,
      },
    },

    decision: {
      recommendation: verdict,
      whyPoints,
      watchOuts,
      financialFit: fundingGap <= 0
        ? `With ₹${(capital / 1000).toFixed(0)}K contribution you can cover the estimated project cost of ₹${(projectCost.totalProjectCost / 1000).toFixed(0)}K — no external financing required.`
        : `With ₹${(capital / 1000).toFixed(0)}K contribution against an estimated project cost of ₹${(projectCost.totalProjectCost / 1000).toFixed(0)}K, the funding gap is ₹${(fundingGap / 1000).toFixed(0)}K${loanInfo ? ` through ${loanInfo.scheme.name}` : ""} — ${affordability.ratingLabel.toLowerCase()} repayment affordability.`,
      summary: verdict === "good"
        ? "Your business shows good potential in the selected location. The market has room for your products and the financial structure appears viable."
        : verdict === "caution"
          ? "Your business idea has potential but carries notable risks. Careful planning and cost management will be important."
          : "Based on current inputs, this business may face significant challenges in this location. Consider alternatives or adjust your approach.",
    },

    nextSteps: [
      "Validate local customer demand through direct conversations",
      "Contact and negotiate with 2–3 alternative suppliers",
      "Compare prices from nearby competitors in person",
      "Finalize your starting investment and timeline",
      "Visit the District Industries Centre (DIC) for scheme eligibility",
      "Prepare documentation for loan application",
    ],

    costBreakdown: {
      components: costBreakdown.components.map((c) => ({
        id: c.id,
        label: c.label,
        labelHi: c.labelHi,
        amount: c.amount,
        source: c.source,
      })),
      total: costBreakdown.total,
      monthlyRentEstimate: costBreakdown.monthlyRentEstimate,
      notes: costBreakdown.notes,
    },

    profitModel: {
      subCategoryName: profitModel.subCategoryName,
      placeStatus: profitModel.placeStatus,
      monthlyRevenue: profitModel.monthlyRevenue,
      monthlyFixedCosts: profitModel.monthlyFixedCosts,
      monthlyVariableCosts: profitModel.monthlyVariableCosts,
      monthlyExpenses: profitModel.monthlyExpenses,
      monthlyProfit: profitModel.monthlyProfit,
      profitMargin: profitModel.profitMargin,
      timeline: profitModel.timeline,
      breakEvenMonth: profitModel.breakEvenMonth,
      breakEvenSales: profitModel.breakEvenSales,
      scales: profitModel.scales,
      capital: profitModel.capital,
      risk: profitModel.risk,
      assumptions: profitModel.assumptions,
    },

    alternatives: alternatives.map((a) => ({
      businessId: a.business.id,
      businessName: a.business.name,
      icon: a.business.icon,
      subCategoryName: a.subCategoryName,
      requiredInvestment: a.requiredInvestment,
      fundingGap: a.fundingGap,
      monthlyRevenue: a.monthlyRevenue,
      monthlyProfit: a.monthlyProfit,
      margin: a.margin,
      risk: a.risk,
      breakEvenMonth: a.breakEvenMonth,
      feasibilityScore: a.feasibilityScore,
      fitScore: a.fitScore,
      reasons: a.reasons,
    })),
  };
}
