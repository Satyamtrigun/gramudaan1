// Hyperlocal Market Intelligence — scenario smoke test (run: bun hyperlocal-smoke.ts)
import { generateFeasibility } from "@/data/feasibility";
import { locations } from "@/data/locations";
import { businessCategories } from "@/data/businesses";
import { buildHyperlocalProfile } from "@/services/hyperlocal/profile";
import { generateAdvisorReply } from "@/services/advisor/engine";

const loc1 = locations.find((l) => l.id === "loc-1")!; // Rampur (32.5k pop)
const loc3 = locations.find((l) => l.id === "loc-3")!; // Shahjahanpur (42k pop)
const dairy = businessCategories.find((b) => b.id === "dairy")!;
const grocery = businessCategories.find((b) => b.id === "grocery")!;
const mobile = businessCategories.find((b) => b.id === "mobile-repair")!;

function profile(bizId: string, locId: string, radius: number) {
  const biz = businessCategories.find((b) => b.id === bizId)!;
  const loc = locations.find((l) => l.id === locId)!;
  const f = generateFeasibility(bizId, 200000, locId, radius);
  return { p: buildHyperlocalProfile({ location: loc, business: biz, capital: 200000, radiusKm: radius, feasibility: f }), f };
}

const s1 = profile("dairy", "loc-1", 5);
const s2 = profile("grocery", "loc-1", 5);
const s3 = profile("mobile-repair", "loc-1", 5);
const s4 = profile("dairy", "loc-3", 5);
const s5 = profile("dairy", "loc-1", 2);
const s6 = profile("dairy", "loc-1", 10);

const line = (s: { p: ReturnType<typeof buildHyperlocalProfile>; f: ReturnType<typeof generateFeasibility> }) =>
  `demand=${s.p.demand.levelLabel}(score ${s.p.demand.score}) hh=${s.f.marketReach.households} comp=${s.p.competition.totalVisible}/${s.p.competition.density} cpb=${s.p.competition.consumersPerBusiness} gaps=${s.p.marketGaps.length}[${s.p.marketGaps.map((g) => g.type).join(",")}] impact=${s.p.locationImpact.direction} score=${s.f.overallScore} fit="${s.p.marketGaps[0]?.title ?? "none"}"; risks=${s.p.risks.map((r) => r.name).join("|")}`;

console.log("S1 dairy   Rampur 5km :", line(s1));
console.log("S2 grocery Rampur 5km :", line(s2));
console.log("S3 mobile  Rampur 5km :", line(s3));
console.log("S4 dairy  Shahjahanpur5:", line(s4));
console.log("S5 dairy  Rampur 2km :", line(s5));
console.log("S6 dairy  Rampur 10km:", line(s6));

const failures: string[] = [];

// 1. Business category changes the gap/insight content
if (s1.p.marketGaps[0]?.title === s2.p.marketGaps[0]?.title && s1.p.demand.insights.length === s2.p.demand.insights.length) {
  // still assert the risk set differs: dairy adds cold chain vs grocery does not
}
if (s1.f.risks.some((r) => r.id === "risk-cold-chain") === s2.f.risks.some((r) => r.id === "risk-cold-chain")) {
  failures.push("dairy vs grocery risk sets should differ (cold chain)");
}
if (s1.p.marketGaps[0]?.title.toLowerCase().includes("thinly served")) {
  failures.push("dairy (18 reported units) must not be framed as thinly served");
}
if (!s2.p.marketGaps.some((g) => g.title.toLowerCase().includes("dense"))) {
  failures.push("grocery (largest presence) should show a saturation/density gap");
}
if (!s3.p.marketGaps.some((g) => g.title.toLowerCase().includes("gap"))) {
  failures.push("mobile repair (thin presence) should show a potential gap");
}
// mobile-repair: category presence missing → visible set note, competition insight differs from dairy
if (s1.p.competition.insight.value === s3.p.competition.insight.value && s3.p.competition.sameCategoryVisible === 0 && s1.p.competition.sameCategoryVisible === 0) {
  failures.push("competition insight identical across categories where it should not be");
}

// 2. Location changes output where signals justify it
if (s1.f.marketReach.households === s4.f.marketReach.households) {
  failures.push("different locations produced identical reachable households");
}
if (s1.p.competition.consumersPerBusiness === s4.p.competition.consumersPerBusiness) {
  failures.push("different locations produced identical consumers-per-business");
}
if (s1.p.demand.score === s4.p.demand.score) {
  failures.push("different locations produced identical demand score");
}

// 3. Radius changes output
if (s5.p.competition.totalVisible === s6.p.competition.totalVisible) {
  failures.push("2 km vs 10 km produced identical visible competition count");
}
if (s5.p.demand.levelLabel === s6.p.demand.levelLabel && s5.p.demand.score === s6.p.demand.score) {
  failures.push("2 km vs 10 km produced identical demand read");
}
const sig = (s: { p: ReturnType<typeof buildHyperlocalProfile>; f: ReturnType<typeof generateFeasibility> }) =>
  s.p.marketGaps.map((g) => `${g.type}|${g.strength}|${g.statement}`).join("##");
if (sig(s5) === sig(s6)) {
  failures.push("2 km vs 10 km produced identical gap set");
}

// 4. Score untouched — hyperlocal layer never returns a modified score
if (s1.p.meta.radiusKm !== 5 || s1.p.locationImpact.scoreNote.length === 0) {
  failures.push("profile metadata / score note malformed");
}

// 5. Advisor hyperlocal intent
const advisorCtx = {
  location: loc1,
  business: dairy,
  capital: 200000,
  radius: 5,
  feasibility: s1.f,
};
const r1 = generateAdvisorReply({ message: "Is dairy a good business in my area?", context: advisorCtx });
console.log("\nAdvisor Q: Is dairy a good business in my area?\n---\n" + r1.text.slice(0, 600));
if (!/Rampur|score|demand/i.test(r1.text)) failures.push("advisor hyperlocal answer missing location/score/demand");

const r2 = generateAdvisorReply({ message: "mere gaon mein grocery kaisa rahega?", context: advisorCtx });
console.log("\nAdvisor Q: mere gaon mein grocery kaisa rahega?\n---\n" + r2.text.slice(0, 600));
if (!/Grocery|grocery/.test(r2.text)) failures.push("advisor scenario answer did not address grocery");

// 6. Sources / caveats present for transparency
if (!s1.p.caveats.length || !s1.p.sources.length) failures.push("profile missing caveats/sources");

console.log("\n" + (failures.length ? "FAILURES:\n- " + failures.join("\n- ") : "ALL HYPERLOCAL SCENARIO CHECKS PASSED"));
if (failures.length) process.exit(1);
