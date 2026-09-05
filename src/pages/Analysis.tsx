import { useOnboarding } from "@/lib/onboarding-context";
import { ModuleHeader, ModuleEmptyState } from "@/components/module-ui";
import {
  DecisionSection,
  SWOTSection,
  RisksSection,
  PricingSection,
} from "@/pages/Dashboard";
import { ShieldCheck, AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

const FACTORS: { key: string; label: string }[] = [
  { key: "marketScore", label: "Market" },
  { key: "opportunityScore", label: "Opportunity" },
  { key: "competitionScore", label: "Competition" },
  { key: "financialFitScore", label: "Financial fit" },
  { key: "riskScore", label: "Risk" },
];

export default function Analysis() {
  const { feasibility: f, location, business } = useOnboarding();

  if (!f || !business) {
    return (
      <ModuleEmptyState
        title="No analysis to show yet"
        description="Business Analysis covers your feasibility score, what drives it, your SWOT, the local risks and recommended pricing. Run an assessment first and everything here becomes personalized."
      />
    );
  }

  const locationLabel = location ? `${location.name}, ${location.district}` : "Selected Location";
  const sub = f.subScores;

  return (
    <div className="space-y-5">
      <ModuleHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Business Analysis"
        badge="personalized"
        subtitle={`Why this business does (or doesn't) work for ${business.icon} ${business.name} in ${locationLabel} — the score, its drivers, SWOT, risks and pricing.`}
        actions={
          <>
            <Link to="/plan" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted">
              Open My Plan
            </Link>
            <Link to="/advisor" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90">
              Ask AI about this
            </Link>
          </>
        }
      />

      {/* Why this score */}
      <div className="rounded-2xl border border-border bg-white p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Feasibility Score: {f.overallScore}/100</h3>
            <p className="text-xs text-muted-foreground">Five explainable factors drive the overall score.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-5">
          {FACTORS.map((factor) => {
            const score = (sub as Record<string, number>)[factor.key] ?? 0;
            return (
              <div key={factor.key}>
                <div className="mb-1.5 flex items-baseline justify-between gap-1">
                  <p className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{factor.label}</p>
                  <p className={cn("text-xs font-bold", score >= 70 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-500")}>{score}</p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", score >= 70 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500")}
                    style={{ width: `${Math.max(2, Math.min(100, score))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Final decision */}
      <DecisionSection f={f} business={business} locationLabel={locationLabel} verdict={f.verdict as "good" | "caution" | "rethink"} />

      {/* SWOT */}
      <SWOTSection f={f} />

      {/* Risks + pricing */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <RisksSection f={f} />
        <PricingSection f={f} />
      </div>

      {/* quick explainers */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            <span className="font-bold text-foreground">Remember: </span>
            scores reflect your current inputs (location, capital, scale, costs). Edit any input and this whole analysis recalculates.
          </span>
        </div>
        <Link to="/onboarding" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          Edit inputs
        </Link>
      </div>
    </div>
  );
}
