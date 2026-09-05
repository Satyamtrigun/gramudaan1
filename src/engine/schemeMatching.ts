/* ─── Government Scheme Matching Engine ───
 *
 * Deterministic, rule-based matching between a user's REAL business profile
 * (location + business + capital + financial structure from feasibility.ts)
 * and the scheme catalog in data/schemes.ts.
 *
 * Rules live on each scheme record. This engine only evaluates rules and
 * turns the results into:
 *   • a match level (high / possible / low)
 *   • a match % that reflects ONLY the criteria that could be evaluated
 *   • human-readable reasons and gaps (missing/uncertain information)
 *
 * The engine never fabricates eligibility — every statement is derived from a
 * scheme rule result. UI and AI advisor consume `matchSchemesForProfile`.
 */

import { governmentSchemes, type GovernmentScheme, type SchemeProfileInput, SCHEME_DISCLAIMER, SCHEME_VERIFY_NOTE } from "@/data/schemes";

export type MatchLevel = "high" | "possible" | "low";

export interface RuleEvaluation {
  ruleId: string;
  label: string;
  outcome: "pass" | "partial" | "fail" | "na";
  weight: number;
  text: string;
  kind: "matched" | "gap" | "excluded";
}

export interface SchemeMatch {
  scheme: GovernmentScheme;
  level: MatchLevel;
  percent: number;
  percentLabel: string;
  rules: RuleEvaluation[];
  reasons: RuleEvaluation[];
  gaps: RuleEvaluation[];
  exclusions: RuleEvaluation[];
}

export interface SchemeMatchResult {
  profile: SchemeProfileInput;
  matches: SchemeMatch[];
  topMatch: SchemeMatch | null;
  disclaimer: string;
  verifyNote: string;
}

/* ─── Sector normalisation ─── */

function sectorFor(businessId: string, businessCategory: string): string {
  if (businessId === "dairy" || businessId === "poultry") return "livestock";
  if (businessId === "food-processing") return "food-processing";
  if (businessId === "manufacturing") return "manufacturing";
  if (businessId === "mobile-repair" || businessId === "services") return "services";
  if (businessId === "agri-inputs") return "trading";
  if (businessCategory === "agriculture") return "livestock";
  if (businessCategory === "retail") return "retail";
  if (businessCategory === "services") return "services";
  if (businessCategory === "manufacturing") return "manufacturing";
  return "other";
}

const RULE_LABELS: Record<string, string> = {
  business: "Business type",
  funding: "Financing size",
  "project-scale": "Project cost",
  "new-unit": "New enterprise",
  "business-stage": "Business stage",
  "dairy-size": "Unit size",
  location: "Location",
};

function ruleLabel(id: string): string {
  return RULE_LABELS[id] ?? id;
}

function evaluateScheme(scheme: GovernmentScheme, profile: SchemeProfileInput): SchemeMatch {
  const evaluations: RuleEvaluation[] = [];

  let evaluatedWeight = 0;
  let score = 0;
  let partialWeight = 0;
  let hasFail = false;

  for (const rule of scheme.rules) {
    const outcome = rule.check(profile);
    if (outcome === "na") continue;
    evaluatedWeight += rule.weight;
    const kind = outcome === "pass" ? "matched" : outcome === "partial" ? "gap" : "excluded";

    if (outcome === "pass") score += rule.weight;
    else if (outcome === "partial") {
      score += rule.weight * 0.5;
      partialWeight += rule.weight;
    } else {
      hasFail = true;
    }

    const text =
      outcome === "pass"
        ? rule.passReason(profile)
        : outcome === "partial"
          ? rule.partialReason(profile)
          : rule.failReason(profile);

    evaluations.push({
      ruleId: rule.id,
      label: ruleLabel(rule.id),
      outcome,
      weight: rule.weight,
      text,
      kind,
    });
  }

  const percent = evaluatedWeight > 0 ? Math.round((score / evaluatedWeight) * 100) : 0;

  // Qualitative bands derived from rule outcomes — a critical "partial" (e.g.
  // funding need beyond the scheme's range, project above the cost ceiling)
  // deliberately caps the level at "possible" even if the % is high.
  let level: MatchLevel;
  if (hasFail) {
    level = "low";
  } else if (percent >= 75 && partialWeight / Math.max(1, evaluatedWeight) <= 0.15) {
    level = "high";
  } else if (percent >= 45) {
    level = "possible";
  } else {
    level = "low";
  }

  const reasons = evaluations.filter((e) => e.kind === "matched");
  const gaps = evaluations.filter((e) => e.kind === "gap");
  const exclusions = evaluations.filter((e) => e.kind === "excluded");

  return {
    scheme,
    level,
    percent,
    percentLabel: `${percent}% of evaluated criteria`,
    rules: evaluations,
    reasons,
    gaps,
    exclusions,
  };
}

const LEVEL_ORDER: Record<MatchLevel, number> = { high: 0, possible: 1, low: 2 };

/**
 * Rank all catalog schemes for a business profile.
 * Matches are sorted by level (high first) then descending evaluated score.
 */
export function matchSchemesForProfile(profile: SchemeProfileInput): SchemeMatchResult {
  const matches = governmentSchemes
    .map((scheme) => evaluateScheme(scheme, profile))
    .sort((a, b) => {
      const l = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
      return l !== 0 ? l : b.percent - a.percent;
    });

  return {
    profile,
    matches,
    topMatch: matches.find((m) => m.level !== "low") ?? matches[0] ?? null,
    disclaimer: SCHEME_DISCLAIMER,
    verifyNote: SCHEME_VERIFY_NOTE,
  };
}

/* ─── Convenience builder from app state ───
 * Builds the SchemeProfileInput from the shared GramUdaan context values so the
 * dashboard/report/advisor all feed the SAME numbers the feasibility engine
 * produced (single source of truth).
 */

export interface SchemeProfileSource {
  businessId: string;
  businessName: string;
  businessCategory: string;
  state: string;
  district: string;
  contribution: number;
  projectCost: number;
  fundingRequirement: number;
}

export function buildProfileInput(src: SchemeProfileSource): SchemeProfileInput {
  return {
    ...src,
    sector: sectorFor(src.businessId, src.businessCategory),
  };
}

export function matchSchemesForProfileSource(src: SchemeProfileSource): SchemeMatchResult {
  return matchSchemesForProfile(buildProfileInput(src));
}

export function formatSchemeRupees(n: number): string {
  return n >= 10000000
    ? `₹${(n / 10000000).toFixed(n % 10000000 === 0 ? 0 : 1)} crore`
    : n >= 100000
      ? `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)} lakh`
      : n >= 1000
        ? `₹${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
        : `₹${n}`;
}
