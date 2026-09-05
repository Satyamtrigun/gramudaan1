// ─── Settlement classification & market-size estimation ───
// The feasibility engine sizes the market from a location's population /
// households. The India Post directory does not carry population data, so for
// places outside the calibrated demo dataset we derive an *estimated* 5 km
// catchment from (a) real Census 2011 anchors for the largest urban centres,
// and (b) a documented settlement-class model for everything else.
//
// These figures are estimates — the product UI labels them "≈ Estimated".

import type { GeoPlace } from "./pincodeData";

export type SettlementTier = "metro" | "large-city" | "town" | "village" | "city";

export interface DemographicsEstimate {
  /** Estimated population within the default analysis area. */
  population: number;
  /** Estimated households (≈ population / average household size 4.4). */
  households: number;
  tier: SettlementTier;
  basis: "census-2011-anchor" | "settlement-class-model";
}

/** Real Census-of-India 2011 anchors (city / UA population) for major centres. */
const CENSUS_2011_UA: Record<string, number> = {
  // District names as they appear in the pincode directory (upper-cased at match time)
  MUMBAI: 18_414_288,
  DELHI: 16_349_831, // Delhi (whole NCT is district-ish in directory)
  KOLKATA: 14_112_536,
  "BENGALURU URBAN": 8_728_906,
  HYDERABAD: 7_749_334,
  AHMEDABAD: 6_361_084,
  CHENNAI: 8_696_010,
  PUNE: 5_057_709,
  SURAT: 4_591_246,
  JAIPUR: 3_073_350,
  "KANPUR NAGAR": 2_920_067,
  LUCKNOW: 2_901_474,
  NAGPUR: 2_497_777,
  INDORE: 1_964_086,
  BHOPAL: 1_795_648,
  PATNA: 1_684_222,
  VADODARA: 1_670_806,
  LUDHIANA: 1_618_879,
  AGRA: 1_585_704,
  NASHIK: 1_486_973,
  FARIDABAD: 1_414_050,
  MEERUT: 1_309_023,
  RAJKOT: 1_286_995,
  VARANASI: 1_201_815,
  SRINAGAR: 1_192_792,
  AURANGABAD: 1_175_116,
  DHANBAD: 1_161_561,
  AMRITSAR: 1_159_227,
  PRAYAGRAJ: 1_117_094,
  RANCHI: 1_073_427,
  HOWRAH: 1_072_161,
  COIMBATORE: 1_061_447,
  JABALPUR: 1_054_336,
  GWALIOR: 1_053_505,
  VIJAYAWADA: 1_048_240,
  JODHPUR: 1_033_918,
  MADURAI: 1_017_955,
  RAIPUR: 1_010_087,
  KOTA: 1_001_694,
  CHANDIGARH: 1_025_682,
  GUWAHATI: 968_549,
  THIRUVANANTHAPURAM: 967_424,
  SOLAPUR: 951_118,
  TIRUCHIRAPPALLI: 916_857,
  SALEM: 917_414,
  MYSURU: 990_900,
  TIRUPPUR: 962_982,
  KOCHI: 2_117_990, // Kochi UA
  KOZHIKODE: 2_030_519, // Kozhikode UA
  VISAKHAPATNAM: 1_728_128, // GVMC UA
  AMBALA: 593_160,
  DEHRADUN: 573_965,
  SHIMLA: 171_817,
  BHUBANESWAR: 837_737,
  GAYA: 468_614,
  GORAKHPUR: 673_000,
  ALIGARH: 889_591,
  BAREILLY: 903_668,
  MORADABAD: 889_810,
  SAHARANPUR: 703_345,
  JAMMU: 657_314,
  UDAIPUR: 451_100,
  AJMER: 551_360,
  WARANGAL: 704_400,
  NELLORE: 600_000,
  TIRUNELVELI: 473_637,
  ROURKELA: 552_239,
  BEHRAMPUR: 297_000,
};

function censusAnchor(district: string, area: string): number | null {
  const d = district.toUpperCase();
  const a = area.toUpperCase();
  const exact = CENSUS_2011_UA[d];
  if (exact) return exact;
  // match e.g. "MUMBAI SUBURBAN" / "BENGALURU RURAL"-style variants by prefix
  const prefix = d.split(" ")[0];
  if (prefix && CENSUS_2011_UA[prefix]) return CENSUS_2011_UA[prefix];
  if (CENSUS_2011_UA[a]) return CENSUS_2011_UA[a];
  return null;
}

/**
 * Estimate demographics for a directory place.
 * Real census anchors are scaled to an approximate dense-urban 5 km catchment
 * (≈ 12% of the census UA figure); class model otherwise.
 */
export function estimateDemographics(place: GeoPlace): DemographicsEstimate {
  const anchor = censusAnchor(place.district, place.name);
  if (anchor) {
    const catchment = Math.round(anchor * 0.12 / 100) * 100;
    return {
      population: Math.max(catchment, 40_000),
      households: Math.round(Math.max(catchment, 40_000) / 4.4 / 10) * 10,
      tier: "metro",
      basis: "census-2011-anchor",
    };
  }

  const officeType = (place.officeType || "").toUpperCase();
  if (officeType === "GPO" || officeType === "HO") {
    const population = 42_000;
    return { population, households: 6_200, tier: "city", basis: "settlement-class-model" };
  }
  if (officeType === "SO") {
    const population = 26_000;
    return { population, households: 3_900, tier: "town", basis: "settlement-class-model" };
  }
  // Branch office → village / hamlet scale
  const population = 9_500;
  return { population, households: 1_400, tier: "village", basis: "settlement-class-model" };
}

/** Human label for a settlement tier (used by result rows). */
export function tierLabel(tier: SettlementTier): string {
  switch (tier) {
    case "metro":
      return "City";
    case "large-city":
      return "City";
    case "city":
      return "City";
    case "town":
      return "Town";
    case "village":
      return "Village";
  }
}
