import type {
  MarketReachData,
  OpportunityData,
  SWOTData,
  RiskData,
  CompetitorData,
  PricingData,
  SubScores,
} from "./types";
import { calculateProjectCost, calculateRepayment, calculateLoan } from "./financial";

/* ─── Market Reach ─── */

export function analyzeMarketReach(
  population: number,
  households: number,
  radiusKm: number,
  _businessId: string,
): MarketReachData {
  // Adjust density by radius
  const radiusFactor = radiusKm === 5 ? 1 : 1.6;
  const adjustedPop = Math.round(population * radiusFactor);
  const adjustedHH = Math.round(households * radiusFactor);

  const estimatedConsumers = Math.round(adjustedPop * 0.65);
  const nearbyVillages = radiusKm === 5 ? 6 : 12;

  const customerGroups = [
    { name: "Households", relevance: "high" as const },
    { name: "Tea shops & small vendors", relevance: "high" as const },
    { name: "Restaurants & eateries", relevance: "medium" as const },
    { name: "Farmers", relevance: "medium" as const },
    { name: "Students", relevance: "low" as const },
  ];

  const distributionChannels = [
    "Direct retail",
    "Wholesale market",
    "Home delivery",
    "Weekly haat (market day)",
  ];

  const summary = `Your selected location reaches approximately ${adjustedHH.toLocaleString("en-IN")} households with an estimated ${adjustedPop.toLocaleString("en-IN")} people. The ${radiusKm} km radius includes ${nearbyVillages} nearby settlements.`;

  return {
    population: adjustedPop,
    households: adjustedHH,
    estimatedConsumers,
    nearbyVillages,
    customerGroups,
    distributionChannels,
    summary,
    confidence: radiusKm <= 5 ? "high" : "medium",
  };
}

/* ─── Opportunity Analysis ─── */

export function analyzeOpportunity(
  businessId: string,
  locationId: string,
): OpportunityData {
  // Business density data per location (mock — API-ready)
  const densityData: Record<string, Record<string, { name: string; count: number }[]>> = {
    default: {
      "loc-1": [
        { name: "Grocery", count: 35 },
        { name: "Dairy", count: 18 },
        { name: "Clothing", count: 12 },
        { name: "Mobile Repair", count: 8 },
        { name: "Poultry Feed", count: 1 },
        { name: "Food Processing", count: 5 },
      ],
    },
  };

  const businesses = densityData.default[locationId] || densityData.default["loc-1"];
  const totalExistingUnits = businesses.reduce((sum, b) => sum + b.count, 0);

  // Find the selected business count
  const selectedBiz = businesses.find(
    (b) => b.name.toLowerCase().replace(/\s+/g, "-") === businessId,
  );
  const selectedBizCount = selectedBiz?.count || 0;

  // Density per thousand households (assume ~4200 households baseline)
  const densityPerThousand = Math.round((totalExistingUnits / 4200) * 1000 * 10) / 10;

  // Find underserved category (lowest count)
  const sorted = [...businesses].sort((a, b) => a.count - b.count);
  const underserved = sorted[0];

  // Opportunity score: lower density of own business = higher opportunity
  let opportunityScore: number;
  if (selectedBizCount <= 2) opportunityScore = 90;
  else if (selectedBizCount <= 5) opportunityScore = 75;
  else if (selectedBizCount <= 15) opportunityScore = 60;
  else if (selectedBizCount <= 25) opportunityScore = 45;
  else opportunityScore = 30;

  const alternatives = ["Organic produce", "Cold storage services", "Digital payment services"];

  let summary = "";
  let highCompetitionWarning: string | undefined;

  if (selectedBizCount <= 3) {
    summary = `${selectedBiz?.name || "Your business category"} is underserved in this area with only ${selectedBizCount} existing unit${selectedBizCount === 1 ? "" : "s"}. This presents a strong opportunity.`;
  } else if (selectedBizCount <= 15) {
    summary = `${selectedBizCount} existing ${selectedBiz?.name || "businesses"} found. Competition is moderate — differentiation and service quality will be key.`;
  } else {
    summary = `${selectedBizCount} existing ${selectedBiz?.name || "businesses"} found. The market is competitive.`;
    highCompetitionWarning = `Your selected business faces relatively high competition with ${selectedBizCount} existing operators. Consider exploring these alternatives.`;
  }

  return {
    existingBusinesses: businesses,
    totalExistingUnits,
    densityPerThousand,
    underservedCategory: underserved.name,
    underservedDetail: `${underserved.name} appears underserved with only ${underserved.count} existing unit${underserved.count === 1 ? "" : "s"} serving the area.`,
    alternatives,
    opportunityScore,
    summary,
    highCompetitionWarning,
  };
}

/* ─── SWOT Analysis ─── */

export function generateSWOT(
  businessId: string,
  locationId: string,
  contribution: number,
): SWOTData {
  // Business-specific strengths
  const bizStrengths: Record<string, string[]> = {
    dairy: [
      "Consistent daily demand for milk and dairy products",
      "Government support through dairy cooperatives",
      "Potential for value-added products (paneer, curd, ghee)",
    ],
    grocery: [
      "Essential daily-need business with steady demand",
      "Low technical skill requirement to operate",
      "Multiple revenue streams (FMCG, staples, household items)",
    ],
    poultry: [
      "Growing demand for eggs and chicken in semi-urban areas",
      "Relatively quick return on investment",
      "Government subsidies available for poultry farming",
    ],
    "poultry-feed": [
      "Critical supply chain link for poultry farms",
      "Recurring purchase cycle — farmers buy regularly",
      "Low spoilage risk compared to perishable goods",
    ],
    clothing: [
      "Consistent demand across seasons",
      "High-margin potential on ready-made garments",
      "Can serve both urban and rural customer bases",
    ],
    "mobile-repair": [
      "Growing smartphone penetration drives demand",
      "Low initial investment required",
      "Recurring revenue from accessories and recharges",
    ],
  };

  const defaultStrengths = [
    "Serves a real local need",
    "Scalable with growing customer base",
    "Flexible operating model",
  ];

  const strengths = bizStrengths[businessId] || defaultStrengths;

  // Location-specific weaknesses
  const weaknesses = [
    "Limited cold storage and preservation facilities nearby",
    "Seasonal demand fluctuations across the year",
    "Higher transportation costs from wholesale markets",
    "Limited availability of skilled local workforce",
  ];

  // Capital-specific opportunities
  const capitalOpportunities: string[] = [];
  if (contribution >= 200000) {
    capitalOpportunities.push("Sufficient capital to set up a well-stocked operation");
  } else {
    capitalOpportunities.push("Lean startup model — start small and reinvest profits");
  }
  capitalOpportunities.push(
    "Government subsidies for micro-enterprises (PMEGP, MUDRA)",
    "Growing digital payment adoption in rural areas",
    "Expanding to nearby villages through weekly market days",
    "Partnerships with local self-help groups (SHGs)",
  );

  // Threats
  const threats = [
    "New competitors may enter if the market grows",
    "Rising transportation and fuel costs affect margins",
    "Seasonal demand drops during certain months",
    "Supply chain disruptions from wholesale markets",
  ];

  return {
    strengths,
    weaknesses,
    opportunities: capitalOpportunities,
    threats,
  };
}

/* ─── Local Risk Identification ─── */

export function identifyRisks(
  businessId: string,
  _locationId: string,
  contribution: number,
): RiskData[] {
  const risks: RiskData[] = [
    {
      id: "risk-supply",
      name: "Supply Risk",
      nameHi: "आपूर्ति जोखिम",
      category: "supply",
      severity: "high",
      impact: "Can stop operations temporarily",
      explanation:
        "Your area appears dependent on a limited number of wholesale suppliers. Disruptions can halt your business.",
      mitigation:
        "Identify at least two alternative suppliers. Build relationships with local producers to reduce dependency.",
    },
    {
      id: "risk-seasonal",
      name: "Seasonal Demand",
      nameHi: "मौसमी मांग",
      category: "seasonality",
      severity: "medium",
      impact: "Revenue may dip 20–30% during off-season",
      explanation:
        "Demand patterns show significant variation across months. Some months see lower footfall.",
      mitigation:
        "Diversify your product range. Offer complementary products during off-season periods.",
    },
    {
      id: "risk-transport",
      name: "Transportation",
      nameHi: "परिवहन",
      category: "transportation",
      severity: "medium",
      impact: "Can increase costs and delay deliveries",
      explanation:
        "Road conditions and distances to wholesale markets affect your margins and reliability.",
      mitigation:
        "Plan bulk procurement to reduce trip frequency. Negotiate delivery terms with suppliers.",
    },
    {
      id: "risk-pricing",
      name: "Pricing Pressure",
      nameHi: "मूल्य दबाव",
      category: "pricing",
      severity: "low",
      impact: "May compress margins if undercut by competitors",
      explanation:
        "Competitors may engage in price wars, especially for common products.",
      mitigation:
        "Differentiate through service quality, reliability and product variety rather than competing on price alone.",
    },
  ];

  // Business-specific risks
  if (businessId === "dairy") {
    risks.push({
      id: "risk-cold-chain",
      name: "Cold Chain",
      nameHi: "शीत श्रृंखला",
      category: "infrastructure",
      severity: "high",
      impact: "Product spoilage and revenue loss",
      explanation:
        "Milk and dairy products require consistent cold storage. Power outages and lack of refrigeration are real risks.",
      mitigation:
        "Invest in a backup power source for refrigeration. Start with smaller daily batches to minimize spoilage.",
    });
  }

  if (businessId === "poultry" || businessId === "poultry-feed") {
    risks.push({
      id: "risk-disease",
      name: "Disease Outbreak",
      nameHi: "रोग प्रकोप",
      category: "healthcare",
      severity: "high",
      impact: "Can devastate entire stock",
      explanation:
        "Poultry farms in the region are susceptible to periodic disease outbreaks.",
      mitigation:
        "Maintain strict hygiene protocols. Keep a relationship with a local veterinarian. Vaccinate on schedule.",
    });
  }

  if (contribution < 100000) {
    risks.push({
      id: "risk-capital",
      name: "Capital Constraint",
      nameHi: "पूंजी बाधा",
      category: "pricing",
      severity: "medium",
      impact: "Limits inventory and growth potential",
      explanation:
        "With a smaller contribution, your initial setup will be lean. This may limit stock variety and storage capacity.",
      mitigation:
        "Start with high-demand items. Reinvest profits before expanding. Consider a micro-finance loan.",
    });
  }

  return risks;
}

/* ─── Competitor Mapping ─── */

export function mapCompetitors(
  businessId: string,
  locationId: string,
  radiusKm: number,
): CompetitorData {
  // Mock competitor data — API-ready interface
  const allCompetitors: { name: string; type: string; distance: string }[] = [
    { name: "Sharma General Store", type: "Grocery", distance: "0.5 km" },
    { name: "Raj Dairy Farm", type: "Dairy", distance: "1.2 km" },
    { name: "Patel Traders", type: "Agriculture Inputs", distance: "0.8 km" },
    { name: "Kumar Mobile Shop", type: "Mobile Repair", distance: "0.3 km" },
    { name: "Singh Cloth House", type: "Clothing", distance: "1.5 km" },
    { name: "Verma Poultry Farm", type: "Poultry", distance: "2.0 km" },
    { name: "Gupta Kirana", type: "Grocery", distance: "0.7 km" },
    { name: "Ali Mobile Center", type: "Mobile Repair", distance: "1.0 km" },
    { name: "Devi Dairy", type: "Dairy", distance: "1.8 km" },
    { name: "New旦旦 Store", type: "Grocery", distance: "0.4 km" },
    { name: "Ravi Traders", type: "Poultry Feed", distance: "3.2 km" },
    { name: "Sunita Clothing", type: "Clothing", distance: "1.1 km" },
  ];

  // Filter by radius
  const maxDist = radiusKm;
  const filtered = allCompetitors.filter((c) => {
    const dist = parseFloat(c.distance);
    return dist <= maxDist;
  });

  const totalBusinesses = filtered.length;
  let density: "high" | "medium" | "low";
  let densityLabel: string;

  if (totalBusinesses >= 15) {
    density = "high";
    densityLabel = "High";
  } else if (totalBusinesses >= 8) {
    density = "medium";
    densityLabel = "Medium";
  } else {
    density = "low";
    densityLabel = "Low";
  }

  const summary = `${totalBusinesses} competing businesses found within your ${radiusKm} km analysis radius. Competition density is ${densityLabel.toLowerCase()}.`;

  return {
    totalBusinesses,
    density,
    densityLabel,
    competitors: filtered,
    summary,
  };
}

/* ─── Product Pricing ─── */

export function analyzePricing(
  businessId: string,
  _locationId: string,
): PricingData {
  const pricingData: Record<string, PricingData> = {
    dairy: {
      unit: "1 litre milk",
      regionalPrice: 58,
      competitorRangeLow: 54,
      competitorRangeHigh: 64,
      recommendedPrice: 58,
      purchasingPower: "medium",
      demandIndicator: "high",
      explanation:
        "Milk pricing is sensitive. Matching the regional average ensures competitiveness while maintaining margins. Avoid pricing above ₹60 initially.",
    },
    grocery: {
      unit: "Standard basket",
      regionalPrice: 500,
      competitorRangeLow: 450,
      competitorRangeHigh: 580,
      recommendedPrice: 500,
      purchasingPower: "medium",
      demandIndicator: "high",
      explanation:
        "Grocery pricing varies by product mix. Competitive pricing on staples drives footfall; margins come from FMCG and household items.",
    },
    poultry: {
      unit: "1 kg chicken",
      regionalPrice: 160,
      competitorRangeLow: 145,
      competitorRangeHigh: 180,
      recommendedPrice: 155,
      purchasingPower: "medium",
      demandIndicator: "medium",
      explanation:
        "Poultry pricing fluctuates with feed costs and demand cycles. Slightly undercutting competitors builds initial customer loyalty.",
    },
    "poultry-feed": {
      unit: "50 kg bag",
      regionalPrice: 1400,
      competitorRangeLow: 1350,
      competitorRangeHigh: 1500,
      recommendedPrice: 1380,
      purchasingPower: "medium",
      demandIndicator: "high",
      explanation:
        "Feed pricing is driven by wholesale procurement costs. Competitive pricing with reliable supply builds long-term farmer relationships.",
    },
  };

  const defaultPricing: PricingData = {
    unit: "Standard unit",
    regionalPrice: 100,
    competitorRangeLow: 85,
    competitorRangeHigh: 120,
    recommendedPrice: 95,
    purchasingPower: "medium",
    demandIndicator: "medium",
    explanation:
      "Pricing is based on regional averages and competitor analysis. Slightly below average pricing helps attract initial customers.",
  };

  return pricingData[businessId] || defaultPricing;
}

/* ─── Sub-Scores ─── */

export function calculateSubScores(
  businessId: string,
  locationId: string,
  contribution: number,
  population: number,
  households: number,
  radiusKm: number,
): SubScores {
  const market = analyzeMarketReach(population, households, radiusKm, businessId);
  const opportunity = analyzeOpportunity(businessId, locationId);
  const competitors = mapCompetitors(businessId, locationId, radiusKm);
  const risks = identifyRisks(businessId, locationId, contribution);

  // Market score: based on reach
  const marketScore = Math.min(
    95,
    Math.round(
      40 + (market.households / 100) * 0.3 + (market.estimatedConsumers / 100) * 0.2 + radiusKm * 2,
    ),
  );

  // Opportunity score: from analysis
  const opportunityScore = opportunity.opportunityScore;

  // Competition score: inverse of density
  const competitionScore =
    competitors.density === "low" ? 85 : competitors.density === "medium" ? 65 : 40;

  // Risk score: based on severity distribution
  const highRisks = risks.filter((r) => r.severity === "high").length;
  const medRisks = risks.filter((r) => r.severity === "medium").length;
  const riskScore = Math.max(20, 85 - highRisks * 15 - medRisks * 5);

  // Financial fit score — business-aware project cost; higher own-capital share
  // of the realistic project cost = stronger fit. No scheme-limit penalty for
  // scale the business never needs.
  const projectCost = calculateProjectCost(contribution, businessId);
  const loan = calculateLoan(contribution, businessId);
  let financialFitScore = 55;

  if (loan && loan.loanAmount > 0) {
    const contributionRatio = contribution / Math.max(1, projectCost.totalProjectCost);
    if (contributionRatio >= 0.7) financialFitScore = 88;
    else if (contributionRatio >= 0.45) financialFitScore = 80;
    else if (contributionRatio >= 0.25) financialFitScore = 70;
    else financialFitScore = 58;
    if (projectCost.isLimitExceeded) financialFitScore = Math.max(30, financialFitScore - 20);
  } else {
    // No financing needed — contribution already covers the typical setup.
    financialFitScore = 92;
  }

  return {
    marketScore: Math.min(95, marketScore),
    opportunityScore: Math.min(95, opportunityScore),
    competitionScore: Math.min(95, competitionScore),
    riskScore: Math.min(95, riskScore),
    financialFitScore: Math.min(95, financialFitScore),
  };
}
