import { businessCategories, type BusinessCategory } from "./businesses";
import { type Location } from "./locations";

export interface BusinessRecommendation {
  business: BusinessCategory;
  reason: string;
  opportunityScore: number;
  competitionLevel: "low" | "medium" | "high";
  rank: number;
}

const locationProfiles: Record<
  string,
  {
    topBusinesses: string[];
    reasons: Record<string, string>;
    scores: Record<string, number>;
    competition: Record<string, "low" | "medium" | "high">;
  }
> = {
  "loc-1": {
    topBusinesses: ["poultry-feed", "dairy", "agri-inputs"],
    reasons: {
      "poultry-feed": "Strong farmer demand and very few existing suppliers in the area",
      dairy: "Established daily demand for milk and dairy products",
      "agri-inputs": "Large farming community with seasonal input needs",
    },
    scores: { "poultry-feed": 92, dairy: 78, "agri-inputs": 72 },
    competition: { "poultry-feed": "low", dairy: "medium", "agri-inputs": "medium" },
  },
  "loc-2": {
    topBusinesses: ["mobile-repair", "grocery", "clothing"],
    reasons: {
      "mobile-repair": "Growing smartphone usage with limited repair services",
      grocery: "Daily-need business with steady footfall near the town centre",
      clothing: "Moderate demand for ready-made garments in the market area",
    },
    scores: { "mobile-repair": 88, grocery: 74, clothing: 68 },
    competition: { "mobile-repair": "low", grocery: "high", clothing: "medium" },
  },
  "loc-3": {
    topBusinesses: ["dairy", "food-processing", "poultry-feed"],
    reasons: {
      dairy: "Strong cooperative network and consistent local demand",
      "food-processing": "Value-added processing has high margin potential",
      "poultry-feed": "Underserved supply chain for nearby poultry farms",
    },
    scores: { dairy: 85, "food-processing": 80, "poultry-feed": 75 },
    competition: { dairy: "medium", "food-processing": "low", "poultry-feed": "low" },
  },
  "loc-4": {
    topBusinesses: ["grocery", "dairy", "retail"],
    reasons: {
      grocery: "High foot traffic supports a steady customer base",
      dairy: "Daily essentials with consistent demand",
      retail: "General retail opportunity in a busy market area",
    },
    scores: { grocery: 72, dairy: 70, retail: 65 },
    competition: { grocery: "high", dairy: "medium", retail: "medium" },
  },
};

const defaultProfile = {
  topBusinesses: ["dairy", "grocery", "services"],
  reasons: {
    dairy: "Consistent demand for milk and dairy in most localities",
    grocery: "Essential daily-need business with broad customer appeal",
    services: "Low-investment business with flexible operating hours",
  } as Record<string, string>,
  scores: { dairy: 75, grocery: 70, services: 65 },
  competition: { dairy: "medium", grocery: "medium", services: "low" } as Record<
    string,
    "low" | "medium" | "high"
  >,
};

export function getRecommendations(location: Location): BusinessRecommendation[] {
  const profile = locationProfiles[location.id] || {
    ...defaultProfile,
    topBusinesses:
      defaultProfile.topBusinesses as string[],
  };

  return profile.topBusinesses.map((bizId, index) => {
    const biz = businessCategories.find((b) => b.id === bizId);
    if (!biz) return null;
    return {
      business: biz,
      reason: profile.reasons[bizId] || "Based on available local market indicators",
      opportunityScore: profile.scores[bizId] || 60,
      competitionLevel: profile.competition[bizId] || "medium",
      rank: index + 1,
    };
  }).filter(Boolean) as BusinessRecommendation[];
}
