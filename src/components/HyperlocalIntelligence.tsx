import { useMemo } from "react";
import type { Location } from "@/data/locations";
import type { BusinessCategory } from "@/data/businesses";
import type { FeasibilityData } from "@/data/feasibility-types";
import {
  buildHyperlocalProfile,
  type Confidence,
  type GapStrength,
  type HyperlocalMarketProfile,
  type ImpactDirection,
  type SourceType,
} from "@/services/hyperlocal/profile";
import { MapPin, Sparkles, Users, Target, AlertTriangle, CircleDot, Layers, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export default function HyperlocalIntelligence({
  feasibility,
  location,
  business,
  capital,
  radius,
}: {
  feasibility: FeasibilityData | null;
  location: Location | null;
  business: BusinessCategory | null;
  capital: number;
  radius: number;
}) {
  const profile: HyperlocalMarketProfile | null = useMemo(() => {
    if (!feasibility || !location || !business || capital <= 0) return null;
    return buildHyperlocalProfile({
      location,
      business,
      capital,
      radiusKm: radius,
      feasibility,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feasibility, location, business, capital, radius]);

  if (!profile) return null;

  const demandChip = levelChip(profile.demand.level);
  const impactChipCls = impactChip(profile.locationImpact.direction);

  return (
    <section
      aria-label="Hyperlocal Market Intelligence"
      className="rounded-2xl border-2 border-border bg-white p-5 sm:p-8"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary flex-shrink-0">
          <MapPin className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground font-serif-display">
            Hyperlocal Market Intelligence
          </h2>
          <p className="text-xs text-muted-foreground">
            {profile.meta.placeName} · {profile.meta.district}, {profile.meta.state}
            {profile.meta.pincode ? ` · PIN ${profile.meta.pincode}` : ""} · {profile.meta.radiusBand} · {profile.meta.radiusKm} km radius · {profile.meta.businessName}
          </p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground/80 mt-3 max-w-3xl">
        How your selected location, radius and business category shape local demand, competition and opportunity — every figure below is read from your existing feasibility analysis and labelled with how it was determined.
      </p>

      {/* Score-impact strip */}
      <div className="mt-4 rounded-xl border border-primary/10 bg-primary/[0.03] p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider", impactChipCls)}>
            Location impact: {profile.locationImpact.direction}
          </span>
          <span className="text-[11px] text-muted-foreground">
            Overall score <span className="font-semibold text-foreground">unchanged</span> — the factors below are what feed the existing market / opportunity / competition / risk sub-scores.
          </span>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {profile.locationImpact.factors.map((x) => (
            <div key={x.label} className="flex items-start gap-2 text-xs">
              <span
                className={cn(
                  "mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0",
                  x.effect === "+" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                )}
              >
                {x.effect}
              </span>
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{x.label}:</span> {x.detail}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground/80 leading-relaxed">
          {profile.locationImpact.explanation} {profile.locationImpact.scoreNote}
        </p>
      </div>

      {/* Card grid */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Demand */}
        <InsightCard
          icon={<Users className="h-4 w-4" />}
          title="Local Demand"
          chip={<span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", demandChip)}>{profile.demand.levelLabel}</span>}
        >
          <ul className="space-y-2.5">
            {profile.demand.insights.map((ins) => (
              <InsightRow key={ins.value} sourceType={ins.sourceType} confidence={ins.confidence} value={ins.value} explanation={ins.explanation} />
            ))}
          </ul>
        </InsightCard>

        {/* Market gap */}
        <InsightCard
          icon={<Sparkles className="h-4 w-4" />}
          title="Local Market Gaps"
          chip={
            profile.marketGaps.length > 0 ? (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                {profile.marketGaps.length} potential gap{profile.marketGaps.length > 1 ? "s" : ""}
              </span>
            ) : undefined
          }
        >
          {profile.marketGaps.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No strong gap signal from the available category-presence data — validate demand directly with local retailers and customers before deciding.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {profile.marketGaps.slice(0, 3).map((g) => (
                <li key={g.type + g.title} className="rounded-lg border border-border/70 bg-muted/30 p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span className="text-[10px] text-amber-600">◌</span> {g.title}
                    </p>
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", gapChip(g.strength))}>
                      {gapLabel(g.strength)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">{g.statement}</p>
                  <SourceTag sourceType={g.sourceType} confidence={g.confidence} />
                </li>
              ))}
            </ul>
          )}
        </InsightCard>

        {/* Competition */}
        <InsightCard
          icon={<Target className="h-4 w-4" />}
          title="Local Competition"
          chip={<span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", densityChip(profile.competition.density))}>{profile.competition.density}</span>}
        >
          <p className="text-xs text-muted-foreground mb-2">{profile.competition.summary}</p>
          <InsightRow
            sourceType={profile.competition.insight.sourceType}
            confidence={profile.competition.insight.confidence}
            value={profile.competition.insight.value}
            explanation={profile.competition.insight.explanation}
          />
          <p className="mt-2 text-[10px] text-muted-foreground/70">
            Competitor positions are drawn on the competition map in the section above with the analysis-radius ring.
          </p>
        </InsightCard>

        {/* Customer opportunity */}
        <InsightCard
          icon={<CircleDot className="h-4 w-4" />}
          title="Customer Opportunity"
          chip={<span className="rounded-full bg-primary/5 border border-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{profile.meta.radiusKm} km area</span>}
        >
          <p className="text-xs font-bold text-foreground mb-1">Primary: {profile.customerOpportunity.primary}</p>
          {profile.customerOpportunity.secondary.length > 0 && (
            <p className="text-[11px] text-muted-foreground mb-2">
              Secondary: {profile.customerOpportunity.secondary.join(", ")}
            </p>
          )}
          <InsightRow
            sourceType={profile.customerOpportunity.insight.sourceType}
            confidence={profile.customerOpportunity.insight.confidence}
            value={profile.customerOpportunity.insight.value}
            explanation={profile.customerOpportunity.insight.explanation}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.customerOpportunity.buyingFactors.map((fct) => (
              <span key={fct} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{fct}</span>
            ))}
          </div>
        </InsightCard>
      </div>

      {/* Risks + why this location */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <InsightCard icon={<AlertTriangle className="h-4 w-4" />} title="Local Risks (top)" chip={undefined}>
          {profile.risks.length === 0 ? (
            <p className="text-xs text-muted-foreground">No major local risks flagged in the current analysis.</p>
          ) : (
            <ul className="space-y-2">
              {profile.risks.map((r) => (
                <li key={r.id} className="rounded-lg border border-border/70 p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("h-1.5 w-1.5 rounded-full", r.severity === "high" ? "bg-red-500" : r.severity === "medium" ? "bg-amber-500" : "bg-emerald-500")} />
                    <p className="text-xs font-bold text-foreground">{r.name}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">{r.explanation}</p>
                  <p className="text-[10px] text-primary/80 mt-1">Action: {r.mitigation}</p>
                </li>
              ))}
            </ul>
          )}
        </InsightCard>

        <InsightCard icon={<Layers className="h-4 w-4" />} title="Why this location matters" chip={undefined}>
          <p className="text-xs text-muted-foreground leading-relaxed mb-2">{profile.locationFit.statement}</p>
          <ul className="space-y-1.5 text-[11px] text-muted-foreground">
            <li className="flex gap-1.5"><span className="text-primary">•</span> {profile.locationFit.marketNote}</li>
            <li className="flex gap-1.5"><span className="text-primary">•</span> {profile.locationFit.competitionNote}</li>
            <li className="flex gap-1.5"><span className="text-primary">•</span> {profile.locationFit.capitalNote}</li>
          </ul>
        </InsightCard>
      </div>

      {/* Disclosure */}
      <div className="mt-4 rounded-xl bg-muted/40 border border-border/60 p-3.5">
        <div className="flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="text-[10px] text-muted-foreground leading-relaxed">
            <p className="font-semibold text-foreground mb-0.5">How this was determined</p>
            {profile.caveats.map((c) => (
              <p key={c}>• {c}</p>
            ))}
            <p className="mt-1">
              Confidence: <ConfidenceTag confidence={profile.confidence} /> · Sources: {profile.sources.join(" · ")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Presentational helpers ─── */

function InsightCard({ icon, title, chip, children }: { icon: React.ReactNode; title: string; chip?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex-1">{title}</h3>
        {chip}
      </div>
      {children}
    </div>
  );
}

function InsightRow({ value, explanation, sourceType, confidence }: { value: string; explanation: string; sourceType: SourceType; confidence: Confidence }) {
  return (
    <li className="space-y-0.5">
      <p className="text-xs font-semibold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground leading-snug">{explanation}</p>
      <SourceTag sourceType={sourceType} confidence={confidence} />
    </li>
  );
}

function SourceTag({ sourceType, confidence }: { sourceType: SourceType; confidence: Confidence }) {
  return (
    <p className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground/70">
      {sourceLabel(sourceType)} · confidence: {confidence}
    </p>
  );
}

function ConfidenceTag({ confidence }: { confidence: Confidence }) {
  const cls =
    confidence === "high"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : confidence === "medium"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-slate-100 text-slate-600 border-slate-200";
  return <span className={cn("rounded-full border px-1.5 py-0.5 font-semibold", cls)}>{confidence}</span>;
}

function levelChip(level: string): string {
  switch (level) {
    case "high":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "moderate-high":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "moderate":
      return "bg-amber-50 text-amber-700 border-amber-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function gapChip(strength: GapStrength): string {
  if (strength === "clear-potential") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (strength === "possible") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

function gapLabel(strength: GapStrength): string {
  return strength === "clear-potential" ? "potential" : strength === "possible" ? "possible" : "limited signal";
}

function densityChip(density: "high" | "medium" | "low"): string {
  if (density === "high") return "bg-red-50 text-red-700 border-red-200";
  if (density === "medium") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function impactChip(direction: ImpactDirection): string {
  if (direction === "positive") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (direction === "mixed") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-red-50 text-red-700 border-red-200";
}

function sourceLabel(s: SourceType): string {
  switch (s) {
    case "VERIFIED_DATA":
      return "Verified data";
    case "USER_PROVIDED":
      return "You provided";
    case "CALCULATED":
      return "Calculated";
    case "AI_INFERENCE":
      return "AI-derived";
    case "ESTIMATE":
      return "Estimate";
    default:
      return "Data unavailable";
  }
}
