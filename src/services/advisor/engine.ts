// ─── RuralBiz Advisor Engine ───
// Turns natural-language input into REAL RuralBiz analysis answers.
//
// Pipeline:  USER TEXT → entity/intent extraction
//                     → this engine (reads current context + runs generateFeasibility)
//                     → reply built from actual calculated numbers
//
// The engine never invents scores or figures. Every number is either read from
// the current feasibility object or produced by generateFeasibility() for the
// exact (business, capital, location) combination being discussed.
//
// Context sync rules (single source of truth = OnboardingContext):
//  • Business / capital the user asserts as fact (not "agar/what if") are applied
//    through `reply.apply` so the caller can update the shared context and rerun
//    the analysis engine.
//  • A location mention only becomes an `apply` when no location is set yet
//    (baseline), or when the user explicitly says "apply/update". Otherwise a
//    different-location question is answered as a scenario with an apply chip.

import { businessCategories, type BusinessCategory } from "@/data/businesses";
import { locations, type Location } from "@/data/locations";
import type { FeasibilityData } from "@/data/feasibility-types";
import { generateFeasibility } from "@/data/feasibility";
import { formatIndianCurrency } from "@/data/assessment";
import { detectLanguage, extractBusinesses, extractCapital, extractLocation, type AdvisorLang } from "./parse";
import { matchSchemesForProfileSource } from "@/engine/schemeMatching";
import { buildHyperlocalProfile, type HyperlocalMarketProfile } from "@/services/hyperlocal/profile";

// ─── Public types ───

export interface AdvisorContext {
  location: Location | null;
  business: BusinessCategory | null;
  capital: number;
  feasibility: FeasibilityData | null;
  /** Analysis radius (km) chosen for the current analysis. */
  radius?: number;
}

export interface AdvisorRequest {
  message: string;
  context: AdvisorContext;
}

export interface AdvisorStateChange {
  business?: BusinessCategory;
  capital?: number;
  location?: Location;
  /** Caller should re-run generateFeasibility after applying */
  recompute: boolean;
  /** Short human label of what changed, e.g. "Capital → ₹3 lakh" */
  summary?: string;
}

export interface AdvisorReply {
  text: string;
  followups: string[];
  /** Context changes the user asserted — caller applies them to OnboardingContext */
  apply?: AdvisorStateChange;
  /** Page the reply is best viewed on (dashboard / what-if / report) */
  suggestPage?: "/dashboard" | "/what-if" | "/compare" | "/advisor";
}

// ─── Formatting helpers ───

function trimNum(n: number): string {
  const fixed = n.toFixed(2).replace(/\.?0+$/, "");
  return fixed.endsWith(".") ? fixed.slice(0, -1) : fixed;
}

function compactRupees(n: number): string {
  if (n >= 10000000) return `₹${trimNum(n / 10000000)} crore`;
  if (n >= 100000) return `₹${trimNum(n / 100000)} lakh`;
  if (n >= 1000) return `₹${trimNum(n / 1000)} thousand`;
  return formatIndianCurrency(n);
}

const FULL = (n: number) => formatIndianCurrency(Math.round(n));

function pick(lang: AdvisorLang, hi: string, hg: string, en: string): string {
  if (lang === "hi") return hi;
  if (lang === "hinglish") return hg;
  return en;
}

const verdictEmoji = (verdict: "good" | "caution" | "rethink") =>
  verdict === "good" ? "🟢" : verdict === "caution" ? "🟡" : "🔴";

function subScoreLabel(lang: AdvisorLang, key: "marketScore" | "opportunityScore" | "competitionScore" | "riskScore" | "financialFitScore"): string {
  const hi: Record<string, string> = {
    marketScore: "मार्केट",
    opportunityScore: "अवसर",
    competitionScore: "प्रतिस्पर्धा",
    riskScore: "जोखिम",
    financialFitScore: "वित्तीय फिट",
  };
  const en: Record<string, string> = {
    marketScore: "Market",
    opportunityScore: "Opportunity",
    competitionScore: "Competition",
    riskScore: "Risk",
    financialFitScore: "Financial fit",
  };
  return lang === "hi" ? hi[key] : en[key];
}

// ─── Feasibility runner ───

export function runFeasibility(
  business: BusinessCategory | null,
  capital: number,
  location: Location | null,
  radiusKm = 5,
): FeasibilityData | null {
  if (!business || !location || !capital || capital <= 0) return null;
  try {
    return generateFeasibility(business.id, capital, location.id, radiusKm);
  } catch {
    return null;
  }
}

interface Scenario {
  business: BusinessCategory | null;
  capital: number;
  location: Location | null;
  feasibility: FeasibilityData | null;
}

function feasibilityForScenario(
  ctx: AdvisorContext,
  overrides: { business?: BusinessCategory | null; capital?: number | null; location?: Location | null },
): Scenario {
  // null/undefined override = keep the current value (we never "clear" state)
  const business = overrides.business ?? ctx.business;
  const capital = overrides.capital ?? ctx.capital;
  const location = overrides.location ?? ctx.location;
  return { business, capital, location, feasibility: runFeasibility(business, capital, location, ctx.radius ?? 5) };
}

function topRankedBusinesses(capital: number, location: Location, radiusKm = 5): { business: BusinessCategory; feasibility: FeasibilityData }[] {
  return businessCategories
    .filter((b) => b.id !== "other")
    .map((b) => ({ business: b, feasibility: generateFeasibility(b.id, capital, location.id, radiusKm) }))
    .sort((a, b) => b.feasibility.overallScore - a.feasibility.overallScore);
}

const CONDITIONAL_RE = /\b(agar|अगर|yadi|यदि|what if)\b|agar\s+main/i;
const EXPLICIT_APPLY_RE = /\b(apply|lagao|लागू करो|update my|badal do|बदल दो)\b|apply karo/i;

// ─── Answer builders ───

function buildAnalyzeAnswer(
  lang: AdvisorLang,
  location: Location,
  business: BusinessCategory,
  capital: number,
  feasibility: FeasibilityData,
  fresh: boolean,
): string {
  const f = feasibility;
  const capText = lang === "hi" ? `${compactRupees(capital)} का निवेश` : compactRupees(capital);

  const firstPart = fresh
    ? pick(
        lang,
        `मैंने आपका analysis तैयार कर लिया है। ${location.name} में ${business.name} के लिए feasibility score ${f.overallScore}/100 है — ${verdictEmoji(f.verdict)} ${f.verdictLabel}।`,
        `Main aapka analysis taiyaar kar chuka hoon. ${location.name} mein ${business.name} ke liye feasibility score ${f.overallScore}/100 hai — ${verdictEmoji(f.verdict)} ${f.verdictLabel}.`,
        `I've completed the analysis for ${business.name} in ${location.name}. The feasibility score is ${f.overallScore}/100 — ${f.verdictLabel}.`,
      )
    : pick(
        lang,
        `${business.name} business का आपके current analysis में feasibility score ${f.overallScore}/100 है — ${verdictEmoji(f.verdict)} ${f.verdictLabel}।`,
        `${business.name} business ka aapke current analysis mein feasibility score ${f.overallScore}/100 hai — ${verdictEmoji(f.verdict)} ${f.verdictLabel}.`,
        `Your current analysis shows a feasibility score of ${f.overallScore}/100 for ${business.name} — ${f.verdictLabel}.`,
      );

  const why = f.decision.whyPoints.slice(0, 2);
  const watch = f.decision.watchOuts.slice(0, 2);
  const affordLabel = f.financial.affordability?.ratingLabel ?? "";

  const mid = pick(
    lang,
    [
      `आपके ${capText} के हिसाब से यह possible है।`,
      why.length ? `सबसे मज़बूत बातें: ${why.join("। ")}।` : "",
      watch.length ? `ध्यान रखें: ${watch.join("। ")}।` : "",
      affordLabel ? `वित्तीय fit ${f.subScores.financialFitScore}/100 है (${affordLabel})।` : "",
    ].filter(Boolean).join(" "),
    [
      `Aapke ${capText} ke hisaab se yeh possible hai.`,
      why.length ? `Sabse strong points: ${why.join("; ")}.` : "",
      watch.length ? `Dhyan rakhein: ${watch.join("; ")}.` : "",
      affordLabel ? `Financial fit ${f.subScores.financialFitScore}/100 hai (${affordLabel}).` : "",
    ].filter(Boolean).join(" "),
    [
      `With a ${capText} contribution this is workable.`,
      why.length ? `Key strengths: ${why.join("; ")}.` : "",
      watch.length ? `Watch out for: ${watch.join("; ")}.` : "",
      affordLabel ? `Financial fit is ${f.subScores.financialFitScore}/100 (${affordLabel}).` : "",
    ].filter(Boolean).join(" "),
  );

  return `${firstPart}\n\n${mid}`;
}

function buildRecommendAnswer(lang: AdvisorLang, capital: number, location: Location, radiusKm = 5): { text: string; followups: string[] } {
  const ranked = topRankedBusinesses(capital, location, radiusKm);
  const top = ranked.slice(0, 3);
  const best = top[0];

  const list = top
    .map((t, i) => `${i + 1}. ${t.business.name} — ${t.feasibility.overallScore}/100 (${t.feasibility.verdictLabel})`)
    .join("\n");

  const bestScores = [
    { k: subScoreLabel(lang, "marketScore"), v: best.feasibility.subScores.marketScore },
    { k: subScoreLabel(lang, "opportunityScore"), v: best.feasibility.subScores.opportunityScore },
    { k: subScoreLabel(lang, "financialFitScore"), v: best.feasibility.subScores.financialFitScore },
  ].sort((a, b) => b.v - a.v).slice(0, 2).map((s) => `${s.k} ${s.v}/100`).join(", ");

  const text = pick(
    lang,
    `${location.name} और ${compactRupees(capital)} निवेश के लिए मेरी top सिफारिशें (actual analysis से):\n\n${list}\n\n${best.business.name} सबसे मज़बूत है क्योंकि ${bestScores} अच्छे हैं।\n\nक्या मैं ${best.business.name} का पूरा analysis शुरू कर दूं?`,
    `${location.name} aur ${compactRupees(capital)} investment ke liye meri top recommendations (actual analysis se):\n\n${list}\n\n${best.business.name} sabse strong hai kyunki ${bestScores} acche hain.\n\nKya main ${best.business.name} ka poora analysis shuru kar dun?`,
    `Based on actual analysis for ${location.name} at a ${compactRupees(capital)} contribution, my top recommendations are:\n\n${list}\n\n${best.business.name} ranks highest, driven by strong ${bestScores}.\n\nShall I run the full analysis for ${best.business.name}?`,
  );

  return { text, followups: top.slice(0, 2).map((t) => pick(lang, `${t.business.name} का analysis करो`, `${t.business.name} ka analysis karo`, `Run analysis for ${t.business.name}`)) };
}

function buildCompareAnswer(lang: AdvisorLang, capital: number, location: Location, businessList: BusinessCategory[], radiusKm = 5): string {
  const rows = businessList.slice(0, 3).map((b) => ({ b, f: generateFeasibility(b.id, capital, location.id, radiusKm) }));
  const winner = [...rows].sort((a, b) => b.f.overallScore - a.f.overallScore)[0];

  const lines = rows.map((r) => {
    const s = r.f.subScores;
    return `${r.b.name}: ${r.f.overallScore}/100 (${r.f.verdictLabel}) — Market ${s.marketScore}, Opportunity ${s.opportunityScore}, Competition ${s.competitionScore}, Risk ${s.riskScore}, Financial ${s.financialFitScore}`;
  });

  const note = pick(
    lang,
    `${winner.b.name} सबसे अच्छा fit लग रहा है (${winner.f.overallScore}/100)। यह ${location.name} और ${compactRupees(capital)} के available data पर आधारित है।`,
    `${winner.b.name} sabse achha fit lag raha hai (${winner.f.overallScore}/100). Yeh ${location.name} aur ${compactRupees(capital)} ke available data par based hai.`,
    `${winner.b.name} looks like the strongest fit (${winner.f.overallScore}/100), based on available data for ${location.name} at ${compactRupees(capital)}.`,
  );

  return pick(
    lang,
    `यहाँ तुलना है (${location.name}, ${compactRupees(capital)}):\n\n${lines.join("\n\n")}\n\n${note}`,
    `Yahan tulna hai (${location.name}, ${compactRupees(capital)}):\n\n${lines.join("\n\n")}\n\n${note}`,
    `Here's how they compare (${location.name}, ${compactRupees(capital)}):\n\n${lines.join("\n\n")}\n\n${note}`,
  );
}

function buildWhatIfAnswer(lang: AdvisorLang, ctx: AdvisorContext, scenario: Scenario): { text: string; followups: string[] } {
  const base = feasibilityForScenario(ctx, {});
  if (!base.feasibility || !scenario.feasibility || !scenario.business) {
    return {
      text: pick(
        lang,
        "Scenario compare करने के लिए पहले location, business और capital set करें।",
        "Scenario compare karne ke liye pehle location, business aur capital set karein.",
        "To compare a scenario, first set your location, business and capital.",
      ),
      followups: [],
    };
  }

  const old = base.feasibility;
  const neu = scenario.feasibility;
  const delta = neu.overallScore - old.overallScore;
  const deltaArrow = delta >= 0 ? "↑" : "↓";
  const dir = pick(lang, delta > 0 ? "सुधार" : delta < 0 ? "गिरावट" : "कोई बदलाव नहीं", delta > 0 ? "improvement" : delta < 0 ? "decline" : "no change", delta > 0 ? "improvement" : delta < 0 ? "decline" : "no change");

  const oldV = `${old.overallScore}/100 (${old.verdictLabel})`;
  const newV = `${neu.overallScore}/100 (${neu.verdictLabel})`;

  const what = scenario.business
    ? scenario.business.name
    : scenario.capital
      ? `${compactRupees(scenario.capital)} capital`
      : scenario.location
        ? scenario.location.name
        : "scenario";

  let finLine = "";
  if (scenario.capital && old.financial && neu.financial) {
    const capDelta = Math.abs(neu.financial.totalProjectCost - old.financial.totalProjectCost);
    if (capDelta > 0) {
      finLine = `\n\n${pick(lang, "वित्तीय संरचना", "Financial structure", "Financial structure")}: ${FULL(old.financial.totalProjectCost)} → ${FULL(neu.financial.totalProjectCost)}`;
    }
  }

  const text = pick(
    lang,
    `Current scenario (${base.business?.name ?? "—"}): ${oldV}\n${what} scenario: ${newV} (${deltaArrow} ${Math.abs(delta)} points — ${dir})${finLine}\n\n${delta >= 0 ? "यह scenario बेहतर दिख रहा है।" : "यह scenario current से कमज़ोर दिख रहा है।"}`,
    `Current scenario (${base.business?.name ?? "-"}): ${oldV}\n${what} scenario: ${newV} (${deltaArrow} ${Math.abs(delta)} points — ${dir})${finLine}\n\n${delta >= 0 ? "Yeh scenario behtar dikh raha hai." : "Yeh scenario current se kamzor dikh raha hai."}`,
    `Current scenario (${base.business?.name ?? "—"}): ${oldV}\n${what} scenario: ${newV} (${deltaArrow} ${Math.abs(delta)} points — ${dir})${finLine}\n\n${delta >= 0 ? "This scenario looks stronger." : "This scenario scores lower than your current one."}`,
  );

  const parts: string[] = [];
  if (scenario.business) parts.push(scenario.business.name);
  if (scenario.capital) parts.push(compactRupees(scenario.capital));
  if (scenario.location) parts.push(scenario.location.name);
  const applyMsg = pick(
    lang,
    `यह scenario apply करें: ${parts.join(", ")}`,
    `Yeh scenario apply karo: ${parts.join(", ")}`,
    `Apply this scenario: ${parts.join(", ")}`,
  );

  return { text, followups: parts.length ? [applyMsg] : [] };
}

/* ── GramUdaan: transparent cost explanation ── */
function buildCostAnswer(lang: AdvisorLang, f: FeasibilityData): string {
  const br = f.costBreakdown;
  if (!br) {
    return pick(
      lang,
      "इस analysis में detailed cost breakdown उपलब्ध नहीं है।",
      "Is analysis mein detailed cost breakdown available nahi hai.",
      "A detailed cost breakdown isn't available for this analysis.",
    );
  }
  const lines = br.components
    .filter((c) => c.amount > 0)
    .map((c) => `• ${c.label}: ${FULL(c.amount)} (${c.source.toLowerCase()})`);
  const notes = br.notes.slice(0, 2).map((n) => `• ${n}`);
  return pick(
    lang,
    `आपका estimated setup requirement ${FULL(br.total)} है। यह ऐसे बना है:\n\n${lines.join("\n")}\n\n${notes.length ? `${notes.join("\n")}\n\n` : ""}ये आंकड़े business type, आपकी place व्यवस्था (own/rent/buy) और scale के आधार पर estimates हैं। Actual cost local prices पर depend करेगी — ये कोई bank-approved figure नहीं है।`,
    `Aapka estimated setup requirement ${FULL(br.total)} hai. Yeh aise bana hai:\n\n${lines.join("\n")}\n\n${notes.length ? `${notes.join("\n")}\n\n` : ""}Yeh figures business type, aapki place vyavastha (own/rent/buy) aur scale ke based estimates hain. Actual cost local prices par depend karegi — yeh koi bank-approved figure nahi hai.`,
    `Your estimated setup requirement is ${FULL(br.total)}. Here is how it was built:\n\n${lines.join("\n")}\n\n${notes.length ? `${notes.join("\n")}\n\n` : ""}These figures are estimates based on your business type, place arrangement (own/rent/buy) and scale. Actual costs depend on local prices — this is not a bank-approved figure.`,
  );
}

/* ── GramUdaan: profit timeline / loss-to-profit / break-even ── */
function buildProfitTimelineAnswer(lang: AdvisorLang, f: FeasibilityData): string {
  const pm = f.profitModel;
  if (!pm) {
    return pick(
      lang,
      "इस analysis में profit projection उपलब्ध नहीं है।",
      "Is analysis mein profit projection available nahi hai.",
      "A profit projection isn't available for this analysis.",
    );
  }
  const firstProfit = pm.timeline.find((p) => p.profit >= 0);
  const m1 = pm.timeline[0];
  const m6 = pm.timeline[5];
  const m12 = pm.timeline[11];
  const row = (p: { label: string; revenue: number; expenses: number; profit: number }) =>
    `${p.label}: revenue ${FULL(p.revenue)} − expenses ${FULL(p.expenses)} = ${p.profit >= 0 ? "profit" : "loss"} ${FULL(Math.abs(p.profit))}`;

  return pick(
    lang,
    `Profit timeline (अनुमानित):\n\n• ${row(m1)}\n• ${row(m6)}\n• ${row(m12)}\n\n${firstProfit ? `Estimated operating profit पहली बार month ${firstProfit.month} (${firstProfit.label}) में दिख सकता है।` : "Estimated operating profit 12 महीनों में नहीं दिख रहा — scale, pricing या costs पर दोबारा विचार करें।"}${pm.breakEvenMonth ? ` Operating break-even करीब month ${pm.breakEvenMonth} (break-even sales ≈ ${FULL(pm.breakEvenSales)}/month) है।` : ""}\n\nये estimates हैं — actual results market और management पर depend करेंगे।`,
    `Profit timeline (estimated):\n\n• ${row(m1)}\n• ${row(m6)}\n• ${row(m12)}\n\n${firstProfit ? `Estimated operating profit pehli baar month ${firstProfit.month} (${firstProfit.label}) mein dikh sakta hai.` : "Estimated operating profit 12 mahino mein nahi dikh raha — scale, pricing ya costs par dobara vichar karein."}${pm.breakEvenMonth ? ` Operating break-even karib month ${pm.breakEvenMonth} (break-even sales ≈ ${FULL(pm.breakEvenSales)}/month) hai.` : ""}\n\nYeh estimates hain — actual results market aur management par depend karenge.`,
    `Profit timeline (estimated):\n\n• ${row(m1)}\n• ${row(m6)}\n• ${row(m12)}\n\n${firstProfit ? `Estimated operating profit could first appear around month ${firstProfit.month} (${firstProfit.label}).` : "Estimated operating profit does not appear within 12 months — revisit scale, pricing or costs."}${pm.breakEvenMonth ? ` Operating break-even is around month ${pm.breakEvenMonth} (break-even sales ≈ ${FULL(pm.breakEvenSales)}/month).` : ""}\n\nThese are estimates — actual results depend on the market and how the business is run.`,
  );
}

/* ── GramUdaan: profit-based risk explanation ── */
function buildProfitRiskAnswer(lang: AdvisorLang, f: FeasibilityData): string {
  const pm = f.profitModel;
  if (!pm) {
    return pick(lang, "इस analysis में risk assessment उपलब्ध नहीं है।", "Is analysis mein risk assessment available nahi hai.", "A risk assessment isn't available for this analysis.");
  }
  const pos = pm.risk.reasons.positive.slice(0, 3);
  const con = pm.risk.reasons.concerns.slice(0, 3);
  return pick(
    lang,
    `आपके business का estimated risk: ${pm.risk.label.toUpperCase()}।\n\nकिस आधार पर?\n${pos.length ? `✓ ${pos.join("\n✓ ")}\n` : ""}${con.length ? `⚠ ${con.join("\n⚠ ")}` : ""}\n\nयह margin (${pm.profitMargin}%), break-even (${pm.breakEvenMonth ? `~month ${pm.breakEvenMonth}` : "9+ months"}), funding gap (${FULL(pm.capital.fundingGap)}) और competition पर आधारित estimate है।`,
    `Aapke business ka estimated risk: ${pm.risk.label.toUpperCase()}.\n\nKis aadhar par?\n${pos.length ? `✓ ${pos.join("\n✓ ")}\n` : ""}${con.length ? `⚠ ${con.join("\n⚠ ")}` : ""}\n\nYeh margin (${pm.profitMargin}%), break-even (${pm.breakEvenMonth ? `~month ${pm.breakEvenMonth}` : "9+ months"}), funding gap (${FULL(pm.capital.fundingGap)}) aur competition par based estimate hai.`,
    `Estimated risk for your business: ${pm.risk.label.toUpperCase()}.\n\nOn what basis?\n${pos.length ? `✓ ${pos.join("\n✓ ")}\n` : ""}${con.length ? `⚠ ${con.join("\n⚠ ")}` : ""}\n\nThis is estimated from your profit margin (${pm.profitMargin}%), break-even (${pm.breakEvenMonth ? `~month ${pm.breakEvenMonth}` : "9+ months"}), funding gap (${FULL(pm.capital.fundingGap)}) and competition.`,
  );
}

/* ── GramUdaan: alternative businesses ── */
function buildAlternativesAnswer(lang: AdvisorLang, f: FeasibilityData): string {
  const alts = f.alternatives;
  if (!alts || alts.length === 0) {
    return pick(
      lang,
      "आपके profile के आधार पर अभी कोई मज़बूत alternative नहीं मिला।",
      "Aapke profile ke based abhi koi mazboot alternative nahi mila.",
      "No strong alternative was found based on your profile.",
    );
  }
  const lines = alts.slice(0, 3).map(
    (a, i) => `${i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"} ${a.icon} ${a.businessName} — fit ${a.fitScore}/100. ${a.reasons.slice(0, 2).join(" ")}`,
  );
  return pick(
    lang,
    `आपकी capital (${FULL(f.financial.availableContribution)}) और location के हिसाब से ये businesses तुलना के लायक हैं:\n\n${lines.join("\n\n")}\n\nRanking capital fit, estimated profit, risk और local feasibility पर आधारित है — यह guarantee नहीं है। Compare page पर पूरी तुलना देख सकते हैं।`,
    `Aapki capital (${FULL(f.financial.availableContribution)}) aur location ke hisaab se yeh businesses tulna ke laayak hain:\n\n${lines.join("\n\n")}\n\nRanking capital fit, estimated profit, risk aur local feasibility par based hai — yeh guarantee nahi hai. Compare page par poori tulna dekh sakte hain.`,
    `Based on your capital (${FULL(f.financial.availableContribution)}) and location, these businesses are worth comparing:\n\n${lines.join("\n\n")}\n\nThe ranking is based on capital fit, estimated profit, risk and local feasibility — it is not a guarantee. You can see the full comparison on the Compare page.`,
  );
}

function buildScoreAnswer(lang: AdvisorLang, f: FeasibilityData): string {
  const s = f.subScores;
  const entries = [
    { key: "marketScore" as const, value: s.marketScore },
    { key: "opportunityScore" as const, value: s.opportunityScore },
    { key: "competitionScore" as const, value: s.competitionScore },
    { key: "riskScore" as const, value: s.riskScore },
    { key: "financialFitScore" as const, value: s.financialFitScore },
  ].sort((a, b) => b.value - a.value);
  const strongest = entries[0];
  const weakest = entries[entries.length - 1];

  const why = f.decision.whyPoints.slice(0, 2).join("; ");
  const watch = f.decision.watchOuts.slice(0, 1).join("; ");

  return pick(
    lang,
    `आपका overall score ${f.overallScore}/100 है (${f.verdictLabel})।\n\nसबसे मज़बूत पहलू: ${subScoreLabel("hi", strongest.key)} (${strongest.value}/100)। सबसे कम: ${subScoreLabel("hi", weakest.key)} (${weakest.value}/100)।\n\n${why ? `Score इसलिए बना: ${why}।` : ""}${watch ? `\nध्यान देने वाली बात: ${watch}।` : ""}\n\nयह score आपके location, business और capital के actual analysis से निकला है।`,
    `Aapka overall score ${f.overallScore}/100 hai (${f.verdictLabel}).\n\nSabse strong pehlu: ${subScoreLabel("en", strongest.key)} (${strongest.value}/100). Sabse kam: ${subScoreLabel("en", weakest.key)} (${weakest.value}/100).\n\n${why ? `Score isliye bana: ${why}.` : ""}${watch ? `\nDhyan dene wali baat: ${watch}.` : ""}\n\nYeh score aapke location, business aur capital ke actual analysis se nikla hai.`,
    `Your overall score is ${f.overallScore}/100 (${f.verdictLabel}).\n\nStrongest dimension: ${subScoreLabel("en", strongest.key)} (${strongest.value}/100). Weakest: ${subScoreLabel("en", weakest.key)} (${weakest.value}/100).\n\n${why ? `The score reflects: ${why}.` : ""}${watch ? `\nWatch out: ${watch}.` : ""}\n\nThis score is calculated from the actual analysis of your location, business and capital.`,
  );
}

function buildMarketAnswer(lang: AdvisorLang, f: FeasibilityData): string {
  const m = f.marketReach;
  return pick(
    lang,
    `अनुमानित market reach:\n\n• ${FULL(m.households)} परिवार (households)\n• ${FULL(m.population)} लोग\n• करीब ${FULL(m.potentialCustomers)} संभावित ग्राहक\n• ${m.nearbyVillages} आस-पास की बस्तियाँ\n\nमुख्य ग्राहक: ${m.customerGroups.slice(0, 3).join(", ")}।\n\nये आंकड़े available local indicators से अनुमानित हैं (confidence: ${m.confidence})।`,
    `Estimated market reach:\n\n• ${FULL(m.households)} households\n• ${FULL(m.population)} people\n• Around ${FULL(m.potentialCustomers)} potential customers\n• ${m.nearbyVillages} nearby settlements\n\nMain customers: ${m.customerGroups.slice(0, 3).join(", ")}.\n\nYeh figures available local indicators se estimated hain (confidence: ${m.confidence}).`,
    `Estimated market reach (confidence: ${m.confidence}):\n\n• ${FULL(m.households)} households\n• ${FULL(m.population)} people\n• ~${FULL(m.potentialCustomers)} potential customers\n• ${m.nearbyVillages} nearby settlements\n\nPrimary customer groups: ${m.customerGroups.slice(0, 3).join(", ")}.\n\nThese figures are estimated from available local indicators.`,
  );
}

function buildCompetitionAnswer(lang: AdvisorLang, f: FeasibilityData): string {
  const c = f.competition;
  const densityWord = pick(lang, c.density === "high" ? "ज़्यादा" : c.density === "medium" ? "मध्यम" : "कम", c.density, c.density);
  const names = c.competitors.slice(0, 3).map((x) => `${x.name} (${x.distance})`).join(", ");

  return pick(
    lang,
    `आपके analysis radius में ${c.totalBusinesses} similar businesses मिले हैं — competition density ${densityWord} है।\n\n${names ? `कुछ प्रतिस्पर्धी: ${names}।` : ""}\n\nअलग दिखने के लिए service quality, reliable supply और fair pricing पर focus करें। यह आंकड़ा estimated है।`,
    `Aapke analysis radius mein ${c.totalBusinesses} similar businesses mile hain — competition density ${densityWord} hai.\n\n${names ? `Kuch competitors: ${names}.` : ""}\n\nAlag dikhne ke liye service quality, reliable supply aur fair pricing par focus karein. Yeh figure estimated hai.`,
    `We identified ${c.totalBusinesses} similar businesses within your analysis radius — competition density is ${densityWord}.\n\n${names ? `A few competitors: ${names}.` : ""}\n\nTo stand out, focus on service quality, reliable supply and fair pricing. This figure is estimated.`,
  );
}

function buildRiskAnswer(lang: AdvisorLang, f: FeasibilityData): string {
  if (!f.risks.length) {
    return pick(lang, "इस scenario के लिए कोई बड़ा risk नहीं मिला।", "Is scenario ke liye koi bada risk nahi mila.", "No major risks were identified for this scenario.");
  }
  const sorted = [...f.risks].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 } as const;
    return order[a.severity] - order[b.severity];
  });
  const top = sorted.slice(0, 2);
  const lines = top.map((r) => {
    const icon = r.severity === "high" ? "🔴" : r.severity === "medium" ? "🟠" : "🟢";
    const sev = pick(lang, r.severity === "high" ? "उच्च" : r.severity === "medium" ? "मध्यम" : "कम", r.severity.toUpperCase(), r.severity.toUpperCase());
    return `${icon} ${r.name} (${sev}): ${r.explanation}\n   ${pick(lang, "करें:", "Action:", "Action:")} ${r.mitigation}`;
  });
  return pick(
    lang,
    `आपके business के मुख्य risks:\n\n${lines.join("\n\n")}\n\nRisk score ${f.subScores.riskScore}/100 है।`,
    `Aapke business ke mukhya risks:\n\n${lines.join("\n\n")}\n\nRisk score ${f.subScores.riskScore}/100 hai.`,
    `Key risks for your business:\n\n${lines.join("\n\n")}\n\nRisk score is ${f.subScores.riskScore}/100.`,
  );
}

function buildPricingAnswer(lang: AdvisorLang, f: FeasibilityData): string {
  const p = f.pricing;
  return pick(
    lang,
    `${p.unit ? `${p.unit} के लिए ` : ""}recommended price ${p.recommendedPrice} है।\n\nRegional price ${p.regionalPrice} और competitor range ${p.competitorRange} है।\n\nक्यों? ${p.explanation}`,
    `${p.unit ? `${p.unit} ke liye ` : ""}recommended price ${p.recommendedPrice} hai.\n\nRegional price ${p.regionalPrice} aur competitor range ${p.competitorRange} hai.\n\nKyun? ${p.explanation}`,
    `${p.unit ? `For ${p.unit}, the ` : ""}recommended price is ${p.recommendedPrice}.\n\nRegional average is ${p.regionalPrice} and the competitor range is ${p.competitorRange}.\n\nWhy this price? ${p.explanation}`,
  );
}

function buildLoanAnswer(lang: AdvisorLang, f: FeasibilityData): string {
  const fin = f.financial;
  const loan = fin.loanDetails;
  const afford = fin.affordability;
  const br = fin.projectCostBreakdown;

  const schemeLine = pick(
    lang,
    `आपके ${compactRupees(fin.availableContribution)} contribution से project cost करीब ${FULL(fin.totalProjectCost)} बनता है।`,
    `Aapke ${compactRupees(fin.availableContribution)} contribution se project cost karib ${FULL(fin.totalProjectCost)} banta hai.`,
    `With a ${compactRupees(fin.availableContribution)} contribution, your project cost works out to about ${FULL(fin.totalProjectCost)}.`,
  );

  const loanLine = br?.isLimitExceeded
    ? pick(
        lang,
        `आपका calculated project cost scheme limit से ज़्यादा है — compliant structure: ${FULL(br.compliantProjectCost ?? fin.totalProjectCost)} project और ${FULL(br.compliantAgencyFunding ?? fin.potentialLoan)} agency funding।`,
        `Aapka calculated project cost scheme limit se zyada hai — compliant structure: ${FULL(br.compliantProjectCost ?? fin.totalProjectCost)} project aur ${FULL(br.compliantAgencyFunding ?? fin.potentialLoan)} agency funding.`,
        `Your calculated project cost exceeds the scheme limit — the compliant structure is a ${FULL(br.compliantProjectCost ?? fin.totalProjectCost)} project with ${FULL(br.compliantAgencyFunding ?? fin.potentialLoan)} agency funding.`,
      )
    : pick(
        lang,
        `Estimated funding requirement करीब ${FULL(fin.potentialLoan)} है (${fin.recommendedScheme})।`,
        `Estimated funding requirement karib ${FULL(fin.potentialLoan)} hai (${fin.recommendedScheme}).`,
        `The estimated funding requirement is about ${FULL(fin.potentialLoan)} (${fin.recommendedScheme}).`,
      );

  const detailLine = loan
    ? `\n${pick(lang, `${loan.interestRate}% ब्याज, ${loan.tenure} साल tenure, ${loan.moratorium} महीने moratorium।`, `${loan.interestRate}% interest, ${loan.tenure} saal tenure, ${loan.moratorium} mahine moratorium.`, `At ${loan.interestRate}% interest, a ${loan.tenure}-year tenure and ${loan.moratorium}-month moratorium.`)}`
    : "";

  const affordLine = afford
    ? `\n${pick(lang, `Estimated monthly repayment ${FULL(afford.monthlyRepayment)} और cash flow ${FULL(afford.cashFlow)} — ${afford.ratingIcon} ${afford.ratingLabel}।`, `Estimated monthly repayment ${FULL(afford.monthlyRepayment)} aur cash flow ${FULL(afford.cashFlow)} — ${afford.ratingIcon} ${afford.ratingLabel}.`, `Estimated monthly repayment is ${FULL(afford.monthlyRepayment)} against a cash flow of ${FULL(afford.cashFlow)} — ${afford.ratingIcon} ${afford.ratingLabel}.`)}`
    : "";

  const caveat = pick(
    lang,
    "\nयह आपके दिए capital पर आधारित अनुमान है। Actual loan eligibility lender, scheme और documentation पर depend करेगी।",
    "\nYeh aapke diye capital par based estimate hai. Actual loan eligibility lender, scheme aur documentation par depend karegi.",
    "\nThis is an estimate based on the capital you provided. Actual loan eligibility depends on the lender, scheme and your documentation.",
  );

  return `${schemeLine} ${loanLine}${detailLine}${affordLine}${caveat}`;
}

/** Loan-application workflow guidance grounded in the current analysis. */
function buildLoanApplicationAnswer(lang: AdvisorLang, ctx: AdvisorContext): { text: string; followups: string[] } {
  const f = ctx.feasibility;
  if (!f || !ctx.location || !ctx.business) {
    return {
      text: pick(
        lang,
        "Loan application draft बनाने के लिए पहले अपनी business analysis पूरी करें — dashboard के Financial Overview से आप editable draft तैयार कर सकते हैं।",
        "Loan application draft banane ke liye pehle apni business analysis poori karein — dashboard ke Financial Overview se aap editable draft taiyaar kar sakte hain.",
        "To prepare a loan application draft, first complete your business analysis — you can build an editable draft from the Financial Overview on your dashboard.",
      ),
      followups: [],
    };
  }

  const fin = f.financial;
  const br = fin.projectCostBreakdown;
  const compliant = br?.isLimitExceeded && br.compliantProjectCost != null;
  const projectCost = compliant ? (br?.compliantProjectCost ?? fin.totalProjectCost) : fin.totalProjectCost;
  const contribution = br?.entrepreneurContribution ?? fin.availableContribution ?? ctx.capital;

  // Top matched scheme for the document checklist context.
  const match = (() => {
    try {
      const r = matchSchemesForProfileSource({
        businessId: ctx.business!.id,
        businessName: ctx.business!.name,
        businessCategory: ctx.business!.category,
        state: ctx.location!.state,
        district: ctx.location!.district,
        contribution,
        projectCost: fin.totalProjectCost,
        fundingRequirement: fin.potentialLoan,
      });
      return r.topMatch;
    } catch {
      return null;
    }
  })();

  const schemePart = match
    ? pick(
        lang,
        `आपके profile से ${match.scheme.name} एक potentially relevant option है (preliminary ${match.level.toUpperCase()} match)। इसके आम documents में शामिल हैं: ${match.scheme.requiredDocuments.slice(0, 4).join("; ")}।`,
        `Aapke profile se ${match.scheme.name} ek potentially relevant option hai (preliminary ${match.level.toUpperCase()} match). Iske aam documents mein shamil hain: ${match.scheme.requiredDocuments.slice(0, 4).join("; ")}.`,
        `Based on your profile, ${match.scheme.name} is a potentially relevant option (preliminary ${match.level.toUpperCase()} match). Its commonly requested documents include: ${match.scheme.requiredDocuments.slice(0, 4).join("; ")}.`,
      )
    : pick(
        lang,
        "विशिष्ट scheme चुनने से documents की list और precise हो जाएगी।",
        "Vishisht scheme chunne se documents ki list aur precise ho jayegi.",
        "Picking a specific scheme makes the document checklist more precise.",
      );

  const text = pick(
    lang,
    `आपका estimated project cost ${FULL(projectCost)} है, contribution ${FULL(contribution)} और funding requirement करीब ${FULL(fin.potentialLoan)}।\n\n${schemePart}\n\nApplication draft में ये values पहले से भरी रहती हैं और आप उन्हें edit कर सकते हैं — Dashboard → Financial Overview → "Prepare Loan Application" खोलें। यह एक AI-generated draft है, approval नहीं।`,
    `Aapka estimated project cost ${FULL(projectCost)} hai, contribution ${FULL(contribution)} aur funding requirement karib ${FULL(fin.potentialLoan)}.\n\n${schemePart}\n\nApplication draft mein yeh values pehle se bhari rehti hain aur aap unhein edit kar sakte hain — Dashboard → Financial Overview → "Prepare Loan Application" kholen. Yeh ek AI-generated draft hai, approval nahi.`,
    `Your estimated project cost is ${FULL(projectCost)} with a ${FULL(contribution)} contribution and a funding requirement of about ${FULL(fin.potentialLoan)}.\n\n${schemePart}\n\nThese values pre-fill the application draft and are editable — open it from Dashboard → Financial Overview → "Prepare Loan Application". It is an AI-generated draft, not an approval.`,
  );

  return { text, followups: [] };
}

function buildSchemeAnswer(
  lang: AdvisorLang,
  f: FeasibilityData,
  business: BusinessCategory | null,
  state: string,
): string {
  const fin = f.financial;
  const loan = fin.loanDetails;
  const br = fin.projectCostBreakdown;

  const limitBlock = br?.isLimitExceeded
    ? pick(
        lang,
        `SCHEME LIMIT EXCEEDED:\nCalculated project cost: ${FULL(br.rawProjectCost)}\nMaximum allowed: ₹50 lakh\nCompliant structure: ${FULL(br.compliantProjectCost ?? 0)} project, ${FULL(br.compliantAgencyFunding ?? 0)} agency funding, ${FULL(br.compliantEntrepreneurContribution ?? 0)} contribution.`,
        `SCHEME LIMIT EXCEEDED:\nCalculated project cost: ${FULL(br.rawProjectCost)}\nMaximum allowed: ₹50 lakh\nCompliant structure: ${FULL(br.compliantProjectCost ?? 0)} project, ${FULL(br.compliantAgencyFunding ?? 0)} agency funding, ${FULL(br.compliantEntrepreneurContribution ?? 0)} contribution.`,
        `SCHEME LIMIT EXCEEDED:\nCalculated project cost: ${FULL(br.rawProjectCost)}\nMaximum allowed: ₹50 lakh\nCompliant structure: ${FULL(br.compliantProjectCost ?? 0)} project, ${FULL(br.compliantAgencyFunding ?? 0)} agency funding, ${FULL(br.compliantEntrepreneurContribution ?? 0)} contribution.`,
      )
    : "";

  const structure = pick(
    lang,
    `आपके financing calculation में ${fin.recommendedScheme} उपयोग हुई है${loan ? ` — ${FULL(loan.amount)} तक, ${loan.interestRate}% ब्याज, ${loan.tenure} साल tenure` : ""}।`,
    `Aapke financing calculation mein ${fin.recommendedScheme} upyog hui hai${loan ? ` — ${FULL(loan.amount)} tak, ${loan.interestRate}% interest, ${loan.tenure} saal tenure` : ""}.`,
    `Your financing calculation uses ${fin.recommendedScheme}${loan ? ` — up to ${FULL(loan.amount)} at ${loan.interestRate}% interest over ${loan.tenure} years` : ""}.`,
  );

  let matched = "";
  if (business) {
    const profile = matchSchemesForProfileSource({
      businessId: business.id,
      businessName: business.name,
      businessCategory: business.category,
      state: state || "Uttar Pradesh",
      district: "",
      contribution: fin.availableContribution,
      projectCost: fin.totalProjectCost,
      fundingRequirement: fin.potentialLoan,
    });
    const topMatches = profile.matches.filter((m) => m.level !== "low").slice(0, 3);
    if (topMatches.length > 0) {
      const lines = topMatches.map((m, i) => {
        const level = m.level === "high" ? "HIGH MATCH" : m.level === "possible" ? "POSSIBLE MATCH" : "LOW MATCH";
        const why = m.reasons[0]?.text;
        return `${i + 1}. ${m.scheme.name} — ${level}\n   ${why ?? m.scheme.shortDescription}`;
      });
      matched = pick(
        lang,
        `\n\nआपके business profile के हिसाब से ये सरकारी योजनाएँ potentially relevant हैं:\n\n${lines.join("\n\n")}\n\nयह preliminary match है — eligibility official source और lender पर verify करनी होगी।`,
        `\n\nAapke business profile ke hisaab se yeh sarkari yojanayein potentially relevant hain:\n\n${lines.join("\n\n")}\n\nYeh preliminary match hai — eligibility official source aur lender par verify karni hogi.`,
        `\n\nBased on your business profile, these government programmes are potentially relevant to explore:\n\n${lines.join("\n\n")}\n\nThis is a preliminary match — eligibility must be verified with the official source and lender.`,
      );
    }
  }

  const caveat = pick(
    lang,
    "MUDRA, PMEGP जैसी योजनाओं की interest rate, subsidy और ceilings समय-समय पर बदलती हैं — official portal या बैंक/DIC से verify करें।",
    "MUDRA, PMEGP jaise yojanaon ki interest rate, subsidy aur ceilings samay-samay par badalti hain — official portal ya bank/DIC se verify karein.",
    "Interest rates, subsidy percentages and ceilings for schemes like MUDRA and PMEGP change periodically — verify with the official portal, a bank or the DIC.",
  );

  return [limitBlock, structure, matched, caveat].filter(Boolean).join("\n");
}

function buildSwotAnswer(lang: AdvisorLang, f: FeasibilityData): string {
  const s = f.swot;
  const sec = (label: string, items: string[], max: number) =>
    `${label}:\n${items.slice(0, max).map((x) => `• ${x}`).join("\n")}`;

  const S = lang === "hi"
    ? { strengths: "ताकत (Strengths)", weaknesses: "कमज़ोरियाँ (Weaknesses)", opportunities: "अवसर (Opportunities)", threats: "खतरे (Threats)" }
    : { strengths: "Strengths", weaknesses: "Weaknesses", opportunities: "Opportunities", threats: "Threats" };

  return pick(
    lang,
    `${sec(S.strengths, s.strengths, 2)}\n\n${sec(S.weaknesses, s.weaknesses, 2)}\n\n${sec(S.opportunities, s.opportunities, 2)}\n\n${sec(S.threats, s.threats, 2)}\n\nयह SWOT आपके location + business + capital के analysis से बना है।`,
    `${sec(S.strengths, s.strengths, 2)}\n\n${sec(S.weaknesses, s.weaknesses, 2)}\n\n${sec(S.opportunities, s.opportunities, 2)}\n\n${sec(S.threats, s.threats, 2)}\n\nYeh SWOT aapke location + business + capital ke analysis se bana hai.`,
    `${sec(S.strengths, s.strengths, 2)}\n\n${sec(S.weaknesses, s.weaknesses, 2)}\n\n${sec(S.opportunities, s.opportunities, 2)}\n\n${sec(S.threats, s.threats, 2)}\n\nThis SWOT is generated from your location + business + capital analysis.`,
  );
}

function buildNextStepsAnswer(lang: AdvisorLang, f: FeasibilityData): string {
  const steps = f.nextSteps;
  const first = steps.slice(0, 3).map((x, i) => `${i + 1}. ${x}`).join("\n");
  return pick(
    lang,
    `आपके अगले कदम:\n\n${first}\n\nसबसे पहला step: ${steps[0] ?? "local demand validate करें"}। यह action plan आपके analysis से बना है।`,
    `Aapke agle kadam:\n\n${first}\n\nSabse pehla step: ${steps[0] ?? "local demand validate karein"}. Yeh action plan aapke analysis se bana hai.`,
    `Your recommended next steps:\n\n${first}\n\nStart with: ${steps[0] ?? "validate local demand"}. This action plan comes from your analysis.`,
  );
}

// ─── Hyperlocal market intelligence answers ───
// The hyperlocal layer derives demand/gap/competition/risk reads from the
// SAME feasibility object (never invents numbers). It only explains how the
// chosen location + radius shape the analysis.

function hyperlocalProfileFor(
  ctx: AdvisorContext,
  sc: Scenario,
): HyperlocalMarketProfile | null {
  if (!sc.business || !sc.location || !sc.feasibility) return null;
  try {
    return buildHyperlocalProfile({
      location: sc.location,
      business: sc.business,
      capital: sc.capital,
      radiusKm: ctx.radius ?? 5,
      feasibility: sc.feasibility,
    });
  } catch {
    return null;
  }
}

const DEMAND_WORD: Record<string, { hi: string; hg: string; en: string }> = {
  high: { hi: "उच्च", hg: "high", en: "high" },
  "moderate-high": { hi: "मध्यम-उच्च", hg: "moderate-high", en: "moderate-to-high" },
  moderate: { hi: "मध्यम", hg: "moderate", en: "moderate" },
  limited: { hi: "सीमित", hg: "limited", en: "limited" },
};

const DENSITY_WORD: Record<string, { hi: string; hg: string; en: string }> = {
  high: { hi: "ज़्यादा", hg: "high", en: "high" },
  medium: { hi: "मध्यम", hg: "medium", en: "moderate" },
  low: { hi: "कम", hg: "low", en: "low" },
};

function demandWord(lang: AdvisorLang, level: string): string {
  const w = DEMAND_WORD[level] ?? DEMAND_WORD.moderate;
  return lang === "hi" ? w.hi : lang === "hinglish" ? w.hg : w.en;
}

function densityWord(lang: AdvisorLang, density: string): string {
  const w = DENSITY_WORD[density] ?? DENSITY_WORD.medium;
  return lang === "hi" ? w.hi : lang === "hinglish" ? w.hg : w.en;
}

function buildHyperlocalAnswer(lang: AdvisorLang, ctx: AdvisorContext, sc: Scenario): { text: string; followups: string[] } | null {
  const profile = hyperlocalProfileFor(ctx, sc);
  const f = sc.feasibility;
  if (!profile || !f || !sc.location || !sc.business) return null;

  const biz = sc.business;
  const place = sc.location;
  const radius = ctx.radius ?? 5;
  const demand = demandWord(lang, profile.demand.level);
  const density = densityWord(lang, profile.competition.density);
  const hh = f.marketReach.households.toLocaleString("en-IN");
  const verdictLine = pick(
    lang,
    `${place.name} में ${biz.name} का current feasibility score ${f.overallScore}/100 है (${verdictEmoji(f.verdict)} ${f.verdictLabel})।`,
    `${place.name} mein ${biz.name} ka current feasibility score ${f.overallScore}/100 hai (${verdictEmoji(f.verdict)} ${f.verdictLabel}).`,
    `For ${biz.name} in ${place.name}, the current feasibility score is ${f.overallScore}/100 (${f.verdictLabel}).`,
  );

  const demandLine = pick(
    lang,
    `आपके ${radius} km radius (${profile.meta.radiusBand}) में ≈ ${hh} households का estimated customer base दिखता है — मेरी hyperlocal read में demand signal ${demand} है।`,
    `Aapke ${radius} km radius (${profile.meta.radiusBand}) mein approx ${hh} households ka estimated customer base dikhta hai — meri hyperlocal read mein demand signal ${demand} hai.`,
    `Within your ${radius} km radius (${profile.meta.radiusBand}), the analysis estimates ≈ ${hh} reachable households — the hyperlocal demand signal reads as ${demand}.`,
  );

  const compLine = pick(
    lang,
    `${profile.competition.totalVisible} similar businesses ${radius} km में visible हैं — competition density ${density} है।`,
    `${profile.competition.totalVisible} similar businesses ${radius} km mein visible hain — competition density ${density} hai.`,
    `${profile.competition.totalVisible} similar businesses are visible within ${radius} km — competition density is ${density}.`,
  );

  const gapLine =
    profile.marketGaps.length > 0
      ? pick(
          lang,
          `संभावित gap: ${profile.marketGaps[0].title} — ${profile.marketGaps[0].statement}`,
          `Sambhavit gap: ${profile.marketGaps[0].title} — ${profile.marketGaps[0].statement}`,
          `Potential gap: ${profile.marketGaps[0].title} — ${profile.marketGaps[0].statement}`,
        )
      : pick(
          lang,
          "Available data में कोई strong gap signal नहीं मिला — demand को ground पर validate करना होगा।",
          "Available data mein koi strong gap signal nahi mila — demand ko ground par validate karna hoga.",
          "No strong gap signal from available data — demand should be validated on the ground.",
        );

  const riskLine =
    profile.risks.length > 0
      ? pick(
          lang,
          `मुख्य local risks: ${profile.risks
            .slice(0, 2)
            .map((r) => `${r.severity === "high" ? "🔴" : "🟠"} ${r.name}`)
            .join(", ")}।`,
          `Mukhya local risks: ${profile.risks
            .slice(0, 2)
            .map((r) => `${r.severity === "high" ? "🔴" : "🟠"} ${r.name}`)
            .join(", ")}.`,
          `Key local risks: ${profile.risks
            .slice(0, 2)
            .map((r) => `${r.severity === "high" ? "🔴" : "🟠"} ${r.name}`)
            .join(", ")}.`,
        )
      : "";

  const caveat = pick(
    lang,
    "\nयह hyperlocal read available location + business signals से derived है — verified local statistics नहीं। Numbers आपके current analysis से हैं।",
    "\nYeh hyperlocal read available location + business signals se derived hai — verified local statistics nahi. Numbers aapke current analysis se hain.",
    "\nThis hyperlocal read is derived from available location and business signals — not verified local statistics. All figures come from your current analysis.",
  );

  const text = [verdictLine, demandLine, compLine, gapLine, riskLine, caveat].filter(Boolean).join("\n\n");
  return {
    text,
    followups: [
      pick(lang, "मेरा score इस location पर कैसे बना?", "Mera score is location par kaise bana?", "How did my score form for this location?"),
      pick(lang, "Yahan aur kaunse businesses चल सकते हैं?", "Yahan aur kaunse businesses chal sakte hain?", "Which other businesses could work here?"),
    ],
  };
}

// ─── Reply computation ───

function computeReply(req: AdvisorRequest): AdvisorReply {
  const { message, context } = req;
  const lang = detectLanguage(message);
  const hint = message.toLowerCase();

  const businesses = extractBusinesses(message);
  const capital = extractCapital(message);
  const { location: mentionedLocation, unknownPlace } = extractLocation(message);

  const conditional = CONDITIONAL_RE.test(hint);
  const explicitApply = EXPLICIT_APPLY_RE.test(hint) && (businesses.length > 0 || capital !== null || mentionedLocation);

  // Greetings / thanks / small talk
  if (/^\s*(hi+|hello|hey|namaste|namaskar|नमस्ते|नमस्कार)\b/i.test(message.trim()) && message.trim().split(/\s+/).length <= 3) {
    const contextName = context.business?.name || (context.location ? "aapke location" : "");
    return {
      text: pick(
        lang,
        `नमस्ते! 🙏 मैं GramUdaan हूँ।${contextName ? ` ${contextName} का analysis मेरे पास है —` : ""} market, competition, risk, loan या scheme के बारे में पूछ सकते हैं।`,
        `Namaste! 🙏 Main GramUdaan hoon.${contextName ? ` ${contextName} ka analysis mere paas hai —` : ""} market, competition, risk, loan ya scheme ke baare mein pooch sakte hain.`,
        `Hello! 🙏 I'm GramUdaan.${contextName ? ` I have your ${contextName} analysis loaded —` : ""} ask me about market, competition, risks, loans or schemes.`,
      ),
      followups: [],
    };
  }
  if (/dhanyawad|dhanyavad|shukriya|thank|thanks|धन्यवाद|शुक्रिया/.test(hint)) {
    return {
      text: pick(lang, "आपका स्वागत है! 😊 और कोई सवाल हो तो पूछिए।", "Aapka swagat hai! 😊 Aur koi sawal ho toh poochiye.", "You're welcome! 😊 Feel free to ask anything else."),
      followups: [],
    };
  }
  if (/alvida|bye|goodbye|phir milenge|अलविदा/.test(hint)) {
    return {
      text: pick(lang, "अच्छा, फिर मिलेंगे! आपके business के लिए शुभकामनाएँ। 🙏", "Achha, phir milenge! Aapke business ke liye shubhkamnayein. 🙏", "Take care! Best of luck with your business. 🙏"),
      followups: [],
    };
  }

  // Explicit "apply/update this scenario"
  if (explicitApply) {
    const biz = businesses[0] ?? context.business;
    const cap = capital ?? context.capital;
    const loc = mentionedLocation ?? context.location;
    const f = runFeasibility(biz, cap, loc, context.radius ?? 5);
    if (f && biz && loc) {
      return {
        text: buildAnalyzeAnswer(lang, loc, biz, cap, f, true),
        followups: [],
        apply: {
          ...(businesses[0] ? { business: businesses[0] } : {}),
          ...(capital !== null ? { capital } : {}),
          ...(mentionedLocation ? { location: mentionedLocation } : {}),
          recompute: true,
        },
        suggestPage: "/dashboard",
      };
    }
  }

  // Hypothetical what-if ("agar 3 lakh lagaun toh...")
  if (conditional && (capital !== null || businesses.length > 0 || mentionedLocation)) {
    const w = buildWhatIfAnswer(lang, context, feasibilityForScenario(context, {
      business: businesses[0],
      capital,
      location: mentionedLocation,
    }));
    return { text: w.text, followups: w.followups, suggestPage: "/what-if" };
  }
  // Conditional with no changeable entity — ask what to change
  if (conditional) {
    return {
      text: pick(
        lang,
        "मैं capital, business या location बदलकर scenario दिखा सकता हूँ। बताइए क्या बदलना है — जैसे \"अगर मैं 3 लाख लगाऊँ\" या \"अगर मैं poultry करूँ\"?",
        "Main capital, business ya location badal kar scenario dikha sakta hoon. Bataiye kya badalna hai — jaise \"agar main 3 lakh lagaun\" ya \"agar main poultry karun\"?",
        "I can show you a scenario if you change capital, business or location. Tell me what to change — e.g. \"what if I invest ₹3 lakh\" or \"what if I switch to poultry\"?",
      ),
      followups: [],
    };
  }

  // Compare two or more named businesses
  if (businesses.length >= 2 && context.location && context.capital > 0) {
    return { text: buildCompareAnswer(lang, context.capital, context.location, businesses, context.radius ?? 5), followups: [], suggestPage: "/compare" };
  }
  if (businesses.length >= 2) {
    return {
      text: pick(
        lang,
        "दो businesses की तुलना के लिए पहले location और capital सेट करें।",
        "Do businesses ki tulna ke liye pehle location aur capital set karein.",
        "To compare businesses, first set your location and capital.",
      ),
      followups: [],
    };
  }

  // ── Hyperlocal fit questions: "is dairy good in my area?", "yahan dairy
  //    chalega?", "mere gaon mein kya rahega?" — answered from the actual
  //    analysis + location/radius read, never from generic advice. ──
  const hyperlocalQuestion =
    context.feasibility !== null &&
    !/(loan|emi|kist|kisht|scheme|sarkari|yojana|mudra|pmegp|subsidy|score|verdict|swot|price|pricing|dam|rate|kitna|how much|kaunsa|कौन सा|recommend|suggest)/.test(hint) &&
    /(is area|this area|my area|mere area|meri area|mere ilake|mere shehar|is shehar|is ilake|us ilake|us area|wahan|vahan|yahan|wahin|local|hyperlocal|kaisa rahega|kaisi rahegi|kya chalega|kya sahi|gaon|gav|village|town mein|क्षेत्र|यहां|वहां|इलाका|गांव)/.test(hint) &&
    /(good|better|best|fit|suit|chalega|rahega|rahegi|accha|acha|sahi|good idea|chal sakta|possible|अच्छा|बेहतर|चलेगा|रहेगा|रहेगी)/.test(hint);

  if (hyperlocalQuestion) {
    const sc = feasibilityForScenario(context, {
      business: businesses.length === 1 ? businesses[0] : null,
      capital,
      location: mentionedLocation,
    });
    const r = buildHyperlocalAnswer(lang, context, sc);
    if (r) {
      return { text: r.text, followups: r.followups, suggestPage: "/dashboard" };
    }
  }

  // Topic intents — answer from the actual scenario data
  const singleBusiness = businesses.length === 1 ? businesses[0] : null;

  // GramUdaan: alternative businesses - "is se better business koi aur hai?",
  // "better option", "kya koi aur business kar sakta hoon" - answered from the
  // ranked alternatives computed from the user's actual capital + location.
  if (
    /(better business|behtar business|better option|alternative business|koi aur business|doosra business|dusra business|iske alawa|kya koi aur|any other business|what else|बेहतर|दूसरा business|और कौन सा)/.test(hint) &&
    context.feasibility !== null
  ) {
    const sc = feasibilityForScenario(context, { business: singleBusiness, capital, location: mentionedLocation });
    if (sc.feasibility) {
      return {
        text: buildAlternativesAnswer(lang, sc.feasibility),
        followups: [pick(lang, "Compare page par dekho", "Compare page par dekho", "Open the compare page")],
        suggestPage: "/compare",
      };
    }
  }

  // Business recommendation — but when the user names a specific scheme
  // (MUDRA/PMEGP/scheme/yojana), the scheme intent below must take priority.
  const schemeMention = /(mudra|pmegp|scheme|subsidy|yojana|स्कीम|सरकारी|योजना|मुद्रा)/.test(hint);
  const recommendIntent = /(suggest|recommend|kaunsa business|kya business|business karun|business kholu|sahi rahega|कौन सा business|समझ नहीं)/.test(hint) && businesses.length === 0;
  if (recommendIntent && !schemeMention) {
    const loc = mentionedLocation ?? context.location;
    const cap = capital ?? context.capital;
    if (loc && cap > 0) {
      const r = buildRecommendAnswer(lang, cap, loc, context.radius ?? 5);
      return { text: r.text, followups: r.followups };
    }
    if (!loc) {
      return {
        text: pick(lang, "पहले location बताइए — किस गाँव या town में business शुरू करना है?", "Pehle location bataiye — kis gaon ya town mein business shuru karna hai?", "First, tell me where you want to start — which village or town?"),
        followups: [],
      };
    }
    return {
      text: pick(lang, "Recommendation के लिए capital बताइए — आप कितना invest कर सकते हैं?", "Recommendation ke liye capital bataiye — aap kitna invest kar sakte hain?", "For a recommendation, tell me how much you can invest."),
      followups: [],
    };
  }

  // Scheme
  if (/(scheme|sarkari|yojana|mudra|pmegp|subsidy|स्कीम|सरकारी|योजना|मुद्रा)/.test(hint) && !/(kitna|how much|requirement)/.test(hint)) {
    const sc = feasibilityForScenario(context, { business: singleBusiness, capital, location: mentionedLocation });
    if (sc.feasibility) {
      return {
        text: buildSchemeAnswer(lang, sc.feasibility, sc.business, sc.location?.state ?? context.location?.state ?? "Uttar Pradesh"),
        followups: [pick(lang, "मेरा loan breakdown बताओ", "Mera loan breakdown batao", "Show my loan breakdown")],
        suggestPage: "/dashboard",
      };
    }
  }

  // Loan application / documents workflow
  if (/(loan application|application draft|application karna|application kar|application mein|application me|application ke liye kya|draft mein|draft me|kya documents|documents chahiye|kaunse documents|document checklist|kya kagaz|bank application)/.test(hint) && context.feasibility) {
    const r = buildLoanApplicationAnswer(lang, context);
    return { text: r.text, followups: r.followups };
  }

  // Loan / finance
  if (/(loan|emi|kist|kisht|repay|funding|finance|कर्ज|लोन|ईएमआई|किस्त|paisa lagega|project cost|kitna loan|how much loan|kitna paisa)/.test(hint)) {
    const sc = feasibilityForScenario(context, { business: singleBusiness, capital, location: mentionedLocation });
    if (sc.feasibility) {
      return {
        text: buildLoanAnswer(lang, sc.feasibility),
        followups: [pick(lang, "कौन सी scheme लागू होगी?", "Kaunsi scheme lagu hogi?", "Which scheme applies?")],
        suggestPage: "/dashboard",
      };
    }
    return {
      text: pick(lang, "Loan estimate के लिए location, business और capital चाहिए।", "Loan estimate ke liye location, business aur capital chahiye.", "To estimate a loan I need your location, business and capital."),
      followups: [],
    };
  }

  // GramUdaan: transparent cost explanation - "cost itni kyu hai?",
  // "ye cost kaisi aayi?", "paisa kahan kharch hoga?"
  if (/(cost itni|cost kaisi|cost kyun|cost kaise|itni cost|itna paisa|paisa kahan|kahan kharch|kahan lagega|cost breakdown|setup cost|लागत|खर्च कहां|खर्चा|क्यों इतनी|कितना खर्च)/.test(hint)) {
    const sc = feasibilityForScenario(context, { business: singleBusiness, capital, location: mentionedLocation });
    if (sc.feasibility && sc.feasibility.costBreakdown) {
      return {
        text: buildCostAnswer(lang, sc.feasibility),
        followups: [pick(lang, "Profit kab start hoga?", "Profit kab start hoga?", "When will profit start?")],
        suggestPage: "/dashboard",
      };
    }
  }

  // GramUdaan: profit timeline / break-even - "profit kab start hoga?",
  // "kab tak loss?", "break-even kab?"
  if (/(profit kab|kab profit|profit kabse|profit kab se|loss kab|kab tak loss|kab tak nuksan|break.even|breakeven|munafa kab|nuksan kab|मुनाफा कब|नुकसान कब|कब तक)/.test(hint)) {
    const sc = feasibilityForScenario(context, { business: singleBusiness, capital, location: mentionedLocation });
    if (sc.feasibility && sc.feasibility.profitModel) {
      return {
        text: buildProfitTimelineAnswer(lang, sc.feasibility),
        followups: [pick(lang, "Risk high kyu hai?", "Risk high kyun hai?", "Why is the risk high?")],
        suggestPage: "/dashboard",
      };
    }
  }

  // GramUdaan: profit-based risk explanation - "risk kis basis par?",
  // "risk high kyu hai?" (before the generic risk intent below)
  if (/(risk kis|risk kyun|risk kyu|risk itna|risk high|khatra kis|khatra kyun|jokhim kyun|जोखिम क्यों|खतरा क्यों|risk basis)/.test(hint)) {
    const sc = feasibilityForScenario(context, { business: singleBusiness, capital, location: mentionedLocation });
    if (sc.feasibility && sc.feasibility.profitModel) {
      return {
        text: buildProfitRiskAnswer(lang, sc.feasibility),
        followups: [pick(lang, "Kaunsa business mere liye better hai?", "Kaunsa business mere liye better hai?", "Which business is better for me?")],
        suggestPage: "/dashboard",
      };
    }
  }

  // Score explanation
  if (/(score|verdict|स्कोर)/.test(hint)) {
    const sc = feasibilityForScenario(context, { business: singleBusiness, capital, location: mentionedLocation });
    if (sc.feasibility) {
      return { text: buildScoreAnswer(lang, sc.feasibility), followups: [], suggestPage: "/dashboard" };
    }
  }

  // Market reach
  if (/(market|reach|customer|demand|household|population|मार्केट|ग्राहक|मांग)/.test(hint)) {
    const sc = feasibilityForScenario(context, { business: singleBusiness, capital, location: mentionedLocation });
    if (sc.feasibility) {
      return {
        text: buildMarketAnswer(lang, sc.feasibility),
        followups: [pick(lang, "Competition कैसा है?", "Competition kaisa hai?", "How is the competition?")],
        suggestPage: "/dashboard",
      };
    }
  }

  // Competition
  if (/(competition|competitor|प्रतिस्पर्धा)/.test(hint)) {
    const sc = feasibilityForScenario(context, { business: singleBusiness, capital, location: mentionedLocation });
    if (sc.feasibility) {
      return {
        text: buildCompetitionAnswer(lang, sc.feasibility),
        followups: [pick(lang, "मैं अलग कैसे दिखूं?", "Main alag kaise dikhu?", "How can I stand out?")],
        suggestPage: "/dashboard",
      };
    }
  }

  // Risks
  if (/(risk|khatra|jokhim|dikkat|खतरा|जोखिम)/.test(hint)) {
    const sc = feasibilityForScenario(context, { business: singleBusiness, capital, location: mentionedLocation });
    if (sc.feasibility) {
      return {
        text: buildRiskAnswer(lang, sc.feasibility),
        followups: [pick(lang, "मेरे अगले steps क्या हैं?", "Mere agle steps kya hain?", "What are my next steps?")],
        suggestPage: "/dashboard",
      };
    }
  }

  // Pricing
  if (/(price|pricing|dam|rate|कीमत|दाम|रेट|kitne me)/.test(hint)) {
    const sc = feasibilityForScenario(context, { business: singleBusiness, capital, location: mentionedLocation });
    if (sc.feasibility) {
      return { text: buildPricingAnswer(lang, sc.feasibility), followups: [], suggestPage: "/dashboard" };
    }
  }

  // SWOT
  if (/(swot|strength|weakness|threat|मजबूती|कमजोरी)/.test(hint)) {
    const sc = feasibilityForScenario(context, { business: singleBusiness, capital, location: mentionedLocation });
    if (sc.feasibility) {
      return { text: buildSwotAnswer(lang, sc.feasibility), followups: [], suggestPage: "/dashboard" };
    }
  }

  // Next steps
  if (/(next step|aage kya|pehle kya|ab kya|आगे क्या)/.test(hint) || /what should i do next/.test(hint)) {
    const sc = feasibilityForScenario(context, { business: singleBusiness, capital, location: mentionedLocation });
    if (sc.feasibility) {
      return { text: buildNextStepsAnswer(lang, sc.feasibility), followups: [], suggestPage: "/dashboard" };
    }
  }

  // ── Analyze / update flow (entities present) ──
  if (singleBusiness || capital !== null || mentionedLocation) {
    // Unknown place the user expects data for
    if (unknownPlace && !mentionedLocation && !context.location) {
      const chips = locations.slice(0, 4);
      return {
        text: pick(
          lang,
          `"${unknownPlace}" हमारे data में नहीं है। क्या आप nearby किसी town के लिए analysis चाहेंगे — जैसे ${chips.map((l) => l.name).join(", ")}?`,
          `"${unknownPlace}" hamare data mein nahi hai. Kya aap nearby kisi town ke liye analysis chahenge — jaise ${chips.map((l) => l.name).join(", ")}?`,
          `I don't have data for "${unknownPlace}" yet. Would you like an analysis for a nearby town such as ${chips.map((l) => l.name).join(", ")}?`,
        ),
        followups: chips.map((l) => pick(lang, `${l.name} के लिए analysis करो`, `${l.name} ke liye analysis karo`, `Analyze for ${l.name}`)),
      };
    }

    const targetLoc = mentionedLocation ?? context.location;
    const targetBiz = singleBusiness ?? context.business;
    const targetCap = capital ?? context.capital;

    // Need a location first
    if (!targetLoc) {
      return {
        text: pick(
          lang,
          `समझ गया — ${singleBusiness ? `${singleBusiness.name} business` : targetCap > 0 ? `${compactRupees(targetCap)} निवेश` : "आपकी बात"}। अब location बताइए — किस गाँव या town में?`,
          `Samajh gaya — ${singleBusiness ? `${singleBusiness.name} business` : targetCap > 0 ? `${compactRupees(targetCap)} investment` : "aapki baat"}. Ab location bataiye — kis gaon ya town mein?`,
          `Got it — ${singleBusiness ? `${singleBusiness.name} business` : targetCap > 0 ? `${compactRupees(targetCap)} capital` : "understood"}. Now tell me the location — which village or town?`,
        ),
        followups: locations.slice(0, 3).map((l) => `${l.name}, ${l.district}`),
      };
    }

    // Need a business next — rank real options from the engine
    if (!targetBiz) {
      if (targetCap <= 0) {
        return {
          text: pick(lang, `ठीक है — ${targetLoc.name}। अब बताइए कितना invest कर सकते हैं?`, `Theek hai — ${targetLoc.name}. Ab bataiye kitna invest kar sakte hain?`, `Great — ${targetLoc.name}. Now tell me how much you can invest?`),
          followups: ["₹50,000", "₹1 lakh", "₹2 lakh", "₹5 lakh"],
        };
      }
      const ranked = topRankedBusinesses(targetCap, targetLoc, context.radius ?? 5);
      const top = ranked.slice(0, 3);
      return {
        text: pick(
          lang,
          `${targetLoc.name} में ${compactRupees(targetCap)} के लिए कौन सा business करना है? मेरी analysis-based सिफारिशें:\n\n${top.map((t, i) => `${i + 1}. ${t.business.name} — ${t.feasibility.overallScore}/100`).join("\n")}`,
          `${targetLoc.name} mein ${compactRupees(targetCap)} ke liye kaun sa business karna hai? Meri analysis-based recommendations:\n\n${top.map((t, i) => `${i + 1}. ${t.business.name} — ${t.feasibility.overallScore}/100`).join("\n")}`,
          `Which business do you want in ${targetLoc.name} with ${compactRupees(targetCap)}? My analysis-based picks:\n\n${top.map((t, i) => `${i + 1}. ${t.business.name} — ${t.feasibility.overallScore}/100`).join("\n")}`,
        ),
        followups: top.slice(0, 2).map((t) => pick(lang, `${t.business.name} का analysis करो`, `${t.business.name} ka analysis karo`, `Run analysis for ${t.business.name}`)),
      };
    }

    // Need capital
    if (targetCap <= 0) {
      return {
        text: pick(lang, `${targetBiz.name} के लिए कितना invest कर सकते हैं?`, `${targetBiz.name} ke liye kitna invest kar sakte hain?`, `How much can you invest in ${targetBiz.name}?`),
        followups: ["₹50,000", "₹1 lakh", "₹2 lakh", "₹5 lakh"],
      };
    }

    // Full scenario runnable → answer from the real engine
    const sc = feasibilityForScenario(context, { business: targetBiz, capital: targetCap, location: targetLoc });
    if (sc.feasibility) {
      const isFresh = !context.business || context.capital <= 0 || !context.feasibility;
      const samePlace = context.location && targetLoc.id === context.location.id;
      const scenarioFollowups: string[] = [];
      if (!samePlace) {
        scenarioFollowups.push(pick(lang, `Location apply करें: ${targetLoc.name}`, `Location apply karein: ${targetLoc.name}`, `Apply location: ${targetLoc.name}`));
      }
      return {
        text: buildAnalyzeAnswer(lang, targetLoc, targetBiz, targetCap, sc.feasibility, isFresh),
        followups: [...scenarioFollowups, pick(lang, "मेरा score क्यों है?", "Mera score kyun hai?", "Why is my score what it is?")],
        suggestPage: "/dashboard",
      };
    }
  }

  // Fallback
  const hasAnalysis = !!context.feasibility;
  return {
    text: hasAnalysis
      ? pick(
          lang,
          `मैं यह समझ गया। आप पूछ सकते हैं: score क्यों है, competition कैसा है, कितना loan मिलेगा, कौन सी scheme, या आगे क्या करना है?`,
          `Main yeh samajh gaya. Aap pooch sakte hain: score kyun hai, competition kaisa hai, kitna loan milega, kaunsi scheme, ya aage kya karna hai?`,
          `I understand. You can ask me: why the score is what it is, how competition looks, how much loan you may need, which scheme fits, or what to do next.`,
        )
      : pick(
          lang,
          `मैं आपकी मदद कर सकता हूँ — location, business idea और capital बताइए, और मैं feasibility analysis चला दूँगा। उदाहरण: "मेरे पास 2 लाख हैं, गाँव में dairy शुरू करना है।"`,
          `Main aapki madad kar sakta hoon — location, business idea aur capital bataiye, aur main feasibility analysis chala dunga. Example: "Mere paas 2 lakh hain, gaon mein dairy shuru karna hai."`,
          `I can help — tell me your location, business idea and available capital and I'll run the feasibility analysis. For example: "I have ₹2 lakh and want to start a dairy in my village."`,
        ),
    followups: [],
  };
}

// ─── Central entry: compute + apply asserted factual changes ───

function buildAssertedChange(req: AdvisorRequest, reply: AdvisorReply): AdvisorReply {
  const { message, context } = req;
  const hint = message.toLowerCase();

  // Never auto-apply hypotheticals or already-applied replies
  if (reply.apply) return reply;
  if (CONDITIONAL_RE.test(hint) || EXPLICIT_APPLY_RE.test(hint)) return reply;
  if (/^\s*(hi+|hello|hey|namaste|namaskar|नमस्ते|नमस्कार)\b/i.test(message.trim())) return reply;
  if (/dhanyawad|dhanyavad|shukriya|thank|thanks|धन्यवाद|शुक्रिया/.test(hint)) return reply;

  const businesses = extractBusinesses(message);
  const capital = extractCapital(message);
  const { location } = extractLocation(message);

  // Multiple business mentions = comparison, not a state change
  if (businesses.length > 1) return reply;

  const parts: AdvisorStateChange["summary"][] = [];
  const change: AdvisorStateChange = { recompute: false };

  if (businesses.length === 1 && context.business?.id !== businesses[0].id) {
    change.business = businesses[0];
    change.recompute = true;
    parts.push(`Business → ${businesses[0].name}`);
  }

  if (capital !== null && capital !== context.capital) {
    change.capital = capital;
    change.recompute = true;
    parts.push(`Capital → ${compactRupees(capital)}`);
  }

  // Baseline location (no location set yet) can be applied directly
  if (location && !context.location) {
    change.location = location;
    change.recompute = true;
    parts.push(`Location → ${location.name}`);
  }

  if (!change.recompute) return reply;

  return {
    ...reply,
    apply: { ...change, summary: parts.join(", ") },
  };
}

export function generateAdvisorReply(req: AdvisorRequest): AdvisorReply {
  const reply = computeReply(req);
  return buildAssertedChange(req, reply);
}
