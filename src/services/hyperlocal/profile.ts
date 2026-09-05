// ─── Hyperlocal Market Intelligence ───
// Turns the EXISTING RuralBiz analysis (location + radius + business + capital
// → FeasibilityData) into a transparent, business-specific local-market read.
//
// Trust rules (very intentional):
//  • NO new statistics are invented here. Every number comes from the current
//    feasibility object (itself labelled "estimated/simulated" in the app) or
//    is a pure derivation of those numbers (e.g. households per km², consumers
//    per visible business).
//  • Every insight carries a sourceType + confidence so the UI and AI Advisor
//    can say *how* something was determined instead of pretending it is
//    verified local data.
//  • Wording is deliberately cautious ("potential gap", "limited visible
//    competition", "possible underserved segment") — never absolute claims.
//  • This layer NEVER mutates the feasibility score. It only explains how the
//    location/radius/business influenced the existing sub-scores.

import type { Location } from "@/data/locations";
import type { BusinessCategory } from "@/data/businesses";
import type { FeasibilityData } from "@/data/feasibility-types";

// ─── Public types ───

export type SourceType =
  | "VERIFIED_DATA"
  | "USER_PROVIDED"
  | "CALCULATED"
  | "AI_INFERENCE"
  | "ESTIMATE"
  | "UNAVAILABLE";

export type Confidence = "high" | "medium" | "low";

export interface Insight {
  /** Short human label of the finding. */
  value: string;
  /** How this finding was obtained. */
  sourceType: SourceType;
  confidence: Confidence;
  /** Why — always grounded in actual analysis numbers. */
  explanation: string;
}

export type DemandLevel = "high" | "moderate-high" | "moderate" | "limited";
export type GapType =
  | "product"
  | "service"
  | "location"
  | "price-value"
  | "customer-segment"
  | "convenience";
export type GapStrength = "clear-potential" | "possible" | "limited";
export type ImpactDirection = "positive" | "mixed" | "caution";

export interface MarketGap {
  type: GapType;
  strength: GapStrength;
  title: string;
  statement: string;
  sourceType: SourceType;
  confidence: Confidence;
}

export interface HyperlocalRisk {
  id: string;
  name: string;
  severity: "high" | "medium" | "low";
  explanation: string;
  mitigation: string;
  sourceType: SourceType;
}

export interface LocationFactor {
  effect: "+" | "−";
  label: string;
  detail: string;
}

export interface HyperlocalMarketProfile {
  meta: {
    placeName: string;
    district: string;
    state: string;
    pincode?: string;
    radiusKm: number;
    /** Human band: 2 km → immediate neighbourhood, 5 km → local market… */
    radiusBand: string;
    businessId: string;
    businessName: string;
    category: string;
    capital: number;
    generatedAt: string;
  };
  demand: {
    level: DemandLevel;
    /** Level shown to users ("Moderate–High"). */
    levelLabel: string;
    /** Deterministic 0–100 expression of the demand signal. */
    score: number;
    insights: Insight[];
  };
  marketGaps: MarketGap[];
  competition: {
    density: "high" | "medium" | "low";
    totalVisible: number;
    sameCategoryVisible: number;
    /** Consumers per visible business inside the analysis radius. */
    consumersPerBusiness: number;
    summary: string;
    insight: Insight;
  };
  customerOpportunity: {
    primary: string;
    secondary: string[];
    buyingFactors: string[];
    insight: Insight;
  };
  risks: HyperlocalRisk[];
  locationFit: {
    statement: string;
    capitalNote: string;
    marketNote: string;
    competitionNote: string;
  };
  locationImpact: {
    direction: ImpactDirection;
    factors: LocationFactor[];
    explanation: string;
    /** States plainly that the overall score was not changed by this layer. */
    scoreNote: string;
  };
  confidence: Confidence;
  caveats: string[];
  sources: string[];
}

// ─── Small helpers ───

const SOURCES = [
  "India Post All-India pincode directory (location context)",
  "GramUdaan estimated market model — reachable households, population & consumer estimates (calibrated demo baselines)",
  "GramUdaan category-presence dataset — visible business counts (simulated for demonstration)",
  "GramUdaan financial/scheme engine (project & funding values)",
];

const radiusBand = (r: number): string => {
  if (r <= 2) return "immediate neighbourhood";
  if (r <= 5) return "nearby local market";
  if (r <= 10) return "wider rural market";
  return "larger surrounding market";
};

/** Category label used by the competition/opportunity datasets for a business. */
function datasetLabel(biz: BusinessCategory): string {
  const map: Record<string, string> = {
    dairy: "Dairy",
    grocery: "Grocery",
    poultry: "Poultry",
    "poultry-feed": "Poultry Feed",
    clothing: "Clothing",
    "mobile-repair": "Mobile Repair",
    "food-processing": "Food Processing",
    "agri-inputs": "Agriculture Inputs",
    retail: "Retail",
    services: "Services",
    manufacturing: "Manufacturing",
  };
  return map[biz.id] ?? biz.name;
}

function sameCategoryCount(
  f: FeasibilityData,
  biz: BusinessCategory,
): { count: number | null; available: boolean } {
  const label = datasetLabel(biz).toLowerCase();
  const entry = f.opportunity.existingBusinesses.find(
    (b) => b.name.toLowerCase() === label,
  );
  if (entry) return { count: entry.count, available: true };
  // Poultry is reported as "Poultry Feed" only in the category-presence list.
  if (biz.id === "poultry") {
    const feed = f.opportunity.existingBusinesses.find(
      (b) => b.name.toLowerCase() === "poultry feed",
    );
    if (feed) return { count: null, available: false };
  }
  return { count: null, available: false };
}

function visibleCompetitorsOfType(
  f: FeasibilityData,
  biz: BusinessCategory,
): number {
  const label = datasetLabel(biz).toLowerCase();
  return f.competition.competitors.filter(
    (c) => c.type.toLowerCase() === label,
  ).length;
}

// ─── Demand ───
// Continuous deterministic signal: reachable-household density within the
// analysis radius dominates, then absolute reachable scale tops it up. Level
// labels are derived from the score so small area differences still show.

function computeDemand(households: number, population: number, densityPerKm2: number): { level: DemandLevel; score: number; label: string } {
  const densityScore = Math.min(46, densityPerKm2 * 0.72);
  const householdScore = Math.min(28, households * 0.0016);
  const populationScore = Math.min(22, population * 0.00025);
  const score = Math.min(96, Math.round(26 + densityScore + householdScore + populationScore));
  const level: DemandLevel = score >= 80 ? "high" : score >= 62 ? "moderate-high" : score >= 45 ? "moderate" : "limited";
  const label: Record<DemandLevel, string> = {
    high: "High",
    "moderate-high": "Moderate–High",
    moderate: "Moderate",
    limited: "Limited",
  };
  return { level, score, label: label[level] };
}

/** Demand driver note per business — expressed as an AI-derived read of the
 *  same reachable-household/population signals, never as verified data. */
function demandNote(biz: BusinessCategory): string {
  const notes: Record<string, string> = {
    dairy:
      "Household presence is the core demand signal for daily milk; tea shops, eateries and institutions are secondary buyers where present.",
    grocery:
      "Daily-essentials demand tracks resident households closely — reachable household count is the strongest available signal.",
    poultry:
      "Poultry demand reads off household and eatery presence; peri-urban household density is the proxy used here.",
    "poultry-feed":
      "Feed demand depends on poultry farms in the area rather than households — limited direct farm-presence data is available.",
    "mobile-repair":
      "Smartphone penetration is not measured locally; reachable population is used as an indicative proxy for repair demand.",
    "agri-inputs":
      "Crop/input intensity is not measured locally; reachable farming households are the indicative signal used.",
    clothing:
      "Clothing demand follows household count and festival/seasonal cycles; reachable households are the proxy used here.",
    "food-processing":
      "Packaged-food demand tracks household and retailer presence; reachable households are the indicative signal.",
  };
  return (
    notes[biz.id] ??
    "Reachable households and population are used as the indicative demand proxy — no verified local consumption data is available."
  );
}

// ─── Build the profile ───

export function buildHyperlocalProfile(input: {
  location: Location;
  business: BusinessCategory;
  capital: number;
  radiusKm: number;
  feasibility: FeasibilityData;
}): HyperlocalMarketProfile {
  const { location, business, capital, radiusKm, feasibility: f } = input;

  const areaKm2 = Math.max(0.5, Math.PI * radiusKm * radiusKm);
  const households = f.marketReach.households;
  const population = f.marketReach.population;
  const densityPerKm2 = households / areaKm2;

  const demand = computeDemand(households, population, densityPerKm2);
  const demandLevel = demand.level;
  const demandScore = demand.score;
  const demandLabel = demand.label;

  const { count: categoryPresence, available: categoryPresenceAvailable } =
    sameCategoryCount(f, business);
  const sameCategoryVisible = visibleCompetitorsOfType(f, business);
  const totalVisible = f.competition.totalBusinesses;
  const consumersPerBusiness = Math.round(
    population / Math.max(1, totalVisible),
  );

  const demandInsights: Insight[] = [
    {
      value: `Reachable base ≈ ${households.toLocaleString("en-IN")} households`,
      sourceType: "CALCULATED",
      confidence: f.marketReach.confidence,
      explanation: `Read straight from the current ${radiusKm} km analysis: about ${households.toLocaleString("en-IN")} households and ${population.toLocaleString("en-IN")} people are estimated within the analysis radius.`,
    },
    {
      value: `Household density ≈ ${densityPerKm2.toFixed(1)}/km² (${demandLabel.toLowerCase()})`,
      sourceType: "CALCULATED",
      confidence: "medium",
      explanation: `Derived from reachable households (${households.toLocaleString("en-IN")}) spread over ≈ ${Math.round(areaKm2)} km². Denser areas support convenience businesses; wider radii dilute density but add total customers.`,
    },
    {
      value: `${demandLabel} local demand signal`,
      sourceType: "AI_INFERENCE",
      confidence: "medium",
      explanation: demandNote(business),
    },
  ];

  // ─── Market gaps (cautious wording throughout) ───
  // Compared against the category-presence estimate only — never claims
  // "zero competition" or guaranteed demand.

  const marketGaps: MarketGap[] = [];
  const counts = f.opportunity.existingBusinesses.map((b) => b.count);
  const maxCount = Math.max(...counts);

  if (categoryPresenceAvailable && categoryPresence !== null) {
    const presenceRatio = categoryPresence / Math.max(1, maxCount);
    if (categoryPresence <= 3) {
      marketGaps.push({
        type: business.category === "services" || business.id === "dairy" || business.id === "poultry" ? "service" : "product",
        strength: "clear-potential",
        title: `${business.name} appears thinly served here`,
        statement: `Around ${categoryPresence} visible ${business.name.toLowerCase()} unit${categoryPresence === 1 ? "" : "s"} are reported in the local category-presence estimate against ≈ ${households.toLocaleString("en-IN")} reachable households. That may indicate a potential gap — validate with direct footfall checks before concluding.`,
        sourceType: "ESTIMATE",
        confidence: "medium",
      });
    } else if (presenceRatio <= 0.25) {
      marketGaps.push({
        type: business.category === "services" ? "service" : "product",
        strength: "possible",
        title: `Possible ${business.name.toLowerCase()} gap`,
        statement: `${categoryPresence} visible ${business.name.toLowerCase()} unit${categoryPresence === 1 ? "" : "s"} are reported against other categories in the local estimate — thinner than the largest category (${maxCount} units). Indicative only; verify locally.`,
        sourceType: "ESTIMATE",
        confidence: "low",
      });
    } else if (presenceRatio >= 0.8) {
      marketGaps.push({
        type: "price-value",
        strength: "limited",
        title: `${business.name} presence is already dense here`,
        statement: `${categoryPresence} visible ${business.name.toLowerCase()} unit${categoryPresence === 1 ? "" : "s"} make this one of the best-served categories in the local estimate — entering will need a clearly differentiated offer rather than a low-price copy.`,
        sourceType: "ESTIMATE",
        confidence: "medium",
      });
    } else {
      marketGaps.push({
        type: "customer-segment",
        strength: "possible",
        title: `Moderate ${business.name.toLowerCase()} presence — differentiation room`,
        statement: `${categoryPresence} visible ${business.name.toLowerCase()} unit${categoryPresence === 1 ? "" : "s"} put this category mid-field in the local estimate. The opening is likely in an under-served customer segment or service level, not in volume.`,
        sourceType: "AI_INFERENCE",
        confidence: "low",
      });
    }
  } else {
    marketGaps.push({
      type: "product",
      strength: "limited",
      title: "Limited category-level visibility",
      statement: `The local category-presence estimate does not break out ${business.name} separately — treat competition signals as partial and verify on the ground.`,
      sourceType: "UNAVAILABLE",
      confidence: "low",
    });
  }

  if (densityPerKm2 >= 12) {
    marketGaps.push({
      type: "convenience",
      strength: densityPerKm2 >= 55 ? "clear-potential" : "possible",
      title: "Convenience-oriented positioning possible",
      statement: `With an estimated ${households.toLocaleString("en-IN")} reachable households across ≈ ${Math.round(areaKm2)} km², a convenience angle (timings, home delivery, weekly-haat presence where relevant) may help you serve customers existing general retailers under-serve. Indicative only.`,
      sourceType: "AI_INFERENCE",
      confidence: "medium",
    });
  }

  if (f.competition.density === "high" || f.competition.density === "medium") {
    marketGaps.push({
      type: "price-value",
      strength: "possible",
      title: "Differentiate beyond price",
      statement: `Visible competition is ${f.competition.density} (${totalVisible} businesses in the ${radiusKm} km radius). Competing on price alone is risky — reliability, service quality and assortment are the more defensible openings.`,
      sourceType: "AI_INFERENCE",
      confidence: "medium",
    });
  }

  // ─── Competition ───

  const competitionSummary = `${totalVisible} similar businesses are visible within the ${radiusKm} km radius (density ${f.competition.density}); roughly ${consumersPerBusiness.toLocaleString("en-IN")} estimated people per visible business.`;

  const competitionInsight: Insight = {
    value:
      f.competition.density === "low"
        ? "Low visible competition"
        : f.competition.density === "medium"
          ? "Moderate visible competition"
          : "High visible competition",
    sourceType: "CALCULATED",
    confidence: "medium",
    explanation:
      sameCategoryVisible > 0
        ? `${sameCategoryVisible} of the visible businesses are in your exact category (${business.name}); the rest operate in adjacent categories shown on the competition map. Figures come from the current ${radiusKm} km analysis.`
        : `The visible set has no exact ${business.name} match in the local dataset — the total of ${totalVisible} includes adjacent retail/service categories. Treat this as limited category-level visibility, not proof of absence.`,
  };

  // ─── Customer opportunity ───

  const groups = f.marketReach.customerGroups;
  const primary =
    groups[0] ??
    (business.category === "agriculture" ? "Farming households" : "Nearby households");
  const secondary = groups.slice(1, 4).filter((g) => g !== primary);
  if (secondary.length === 0) secondary.push("Local institutions / small retailers");

  const customerInsight: Insight = {
    value: `Primary segment: ${primary}`,
    sourceType: "AI_INFERENCE",
    confidence: "medium",
    explanation: `Segments are drawn from the analysis customer groups (${groups
      .slice(0, 3)
      .join(", ")}) — an AI-derived read of which buyer type each business leans on, not a verified customer survey.`,
  };

  // ─── Local risks (top of the existing risk stack, tagged) ───

  const severityOrder = { high: 0, medium: 1, low: 2 } as const;
  const risks: HyperlocalRisk[] = [...f.risks]
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 3)
    .map((r) => ({
      id: r.id,
      name: r.name,
      severity: r.severity,
      explanation: r.explanation,
      mitigation: r.mitigation,
      sourceType: "ESTIMATE" as const,
    }));

  // ─── Why this business may fit this location ───

  const afford = f.financial.affordability;
  const capitalNote = afford
    ? `Your ${formatLakh(capital)} contribution lands in the "${afford.ratingLabel}" affordability band against the estimated project cost of ${inr(f.financial.totalProjectCost)} (from your financial analysis).`
    : `Capital fit could not be determined from the financial analysis.`;

  const marketNote = `The analysis estimates ${households.toLocaleString(
    "en-IN",
  )} reachable households at ${radiusKm} km — a ${demandLabel} demand signal for ${business.name} in this area.`;

  const competitionNote =
    f.competition.density === "low"
      ? "Visible competition is low, which may make entry easier — verify by visiting the area."
      : f.competition.density === "medium"
        ? "Visible competition is moderate; positioning and service quality will decide how much room there is."
        : "Visible competition is high — entering will require a clearly differentiated offer.";

  const fitStatement = `For ${business.name} in ${location.name} (${radiusBand(radiusKm)}, ${radiusKm} km), the combination of an estimated ${households.toLocaleString(
    "en-IN",
  )} reachable households, ${totalVisible} visible similar businesses (${
    f.competition.density
  } density) and a ${demandLabel.toLowerCase()} demand signal points to a ${
    f.verdict === "good" ? "workable" : f.verdict === "caution" ? "workable-with-caution" : "challenging"
  } local setup. The overall feasibility score (${f.overallScore}/100, ${f.verdictLabel}) already reflects these factors.`;

  // ─── Location impact on the existing score (explained, never mutated) ───

  const factors: LocationFactor[] = [];
  const reachableGood = households >= 3500;
  factors.push({
    effect: reachableGood ? "+" : "−",
    label: "Location reach",
    detail: `${households.toLocaleString("en-IN")} reachable households ${
      reachableGood ? "support" : "limit"
    } the market score (${f.subScores.marketScore}/100).`,
  });
  factors.push({
    effect:
      f.subScores.opportunityScore >= 65
        ? "+"
        : f.subScores.opportunityScore >= 45
          ? "−"
          : "−",
    label: "Category presence",
    detail: `${categoryPresenceAvailable && categoryPresence !== null
      ? `Around ${categoryPresence} ${business.name.toLowerCase()} unit(s) reported locally`
      : "Exact category presence not separately reported"
    } → opportunity ${f.subScores.opportunityScore}/100.`,
  });
  factors.push({
    effect:
      f.competition.density === "low"
        ? "+"
        : f.competition.density === "medium"
          ? "−"
          : "−",
    label: "Visible competition",
    detail: `${f.competition.density} density (${totalVisible} visible) → competition score ${f.subScores.competitionScore}/100.`,
  });
  const riskScore = f.subScores.riskScore;
  factors.push({
    effect: riskScore >= 65 ? "+" : "−",
    label: "Local risks",
    detail: `Risk score ${riskScore}/100 from the local risk set (top: ${risks
      .slice(0, 2)
      .map((r) => r.name)
      .join(", ")}).`,
  });

  const positives = factors.filter((x) => x.effect === "+").length;
  const direction: ImpactDirection =
    positives >= 3 ? "positive" : positives >= 2 ? "mixed" : "caution";

  return {
    meta: {
      placeName: location.name,
      district: location.district,
      state: location.state,
      pincode: location.pincode,
      radiusKm,
      radiusBand: radiusBand(radiusKm),
      businessId: business.id,
      businessName: business.name,
      category: business.category,
      capital,
      generatedAt: new Date().toISOString(),
    },
    demand: {
      level: demandLevel,
      levelLabel: demandLabel,
      score: demandScore,
      insights: demandInsights,
    },
    marketGaps,
    competition: {
      density: f.competition.density,
      totalVisible,
      sameCategoryVisible,
      consumersPerBusiness,
      summary: competitionSummary,
      insight: competitionInsight,
    },
    customerOpportunity: {
      primary,
      secondary,
      buyingFactors: [
        "Convenience (proximity to reachable households)",
        "Price consistency vs. visible competitors",
        "Reliability / service quality (AI-derived assumption)",
      ],
      insight: customerInsight,
    },
    risks,
    locationFit: {
      statement: fitStatement,
      capitalNote,
      marketNote,
      competitionNote,
    },
    locationImpact: {
      direction,
      factors,
      explanation: `Location and radius shaped the market, opportunity, competition and risk sub-scores shown above — which together produce the overall ${f.overallScore}/100 score (${f.verdictLabel}).`,
      scoreNote:
        "The hyperlocal read is an explanation layer on top of the existing feasibility analysis — it does not change the overall score.",
    },
    confidence: f.marketReach.confidence,
    caveats: [
      "Limited verified local data available — insights are derived from available location, business and estimated market signals.",
      "Category-presence figures are simulated for demonstration; treat every claim as indicative until verified on the ground.",
    ],
    sources: SOURCES,
  };
}

/** Tiny helpers used by text builders (kept local — no new formatting API). */
function formatLakh(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)} lakh`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)} thousand`;
  return `₹${n}`;
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
