import { useState, useCallback } from "react";
import { useOnboarding } from "@/lib/onboarding-context";
import { generateFeasibility } from "@/data/feasibility";
import { formatIndianCurrency, getVerdictColor, getVerdictIcon } from "@/data/assessment";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { locations, type Location } from "@/data/locations";
import { businessCategories, type BusinessCategory } from "@/data/businesses";
import {
  ArrowUpRight,
  Home,
  ChevronRight,
  ArrowRight,
  RotateCcw,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

const QUICK_AMOUNTS = [
  { label: "₹50K", value: 50000 },
  { label: "₹1L", value: 100000 },
  { label: "₹2L", value: 200000 },
  { label: "₹5L", value: 500000 },
  { label: "₹6L", value: 600000 },
];

export default function WhatIf() {
  const { feasibility: currentFeasibility, location: currentLocation, business: currentBusiness, capital: currentCapital, radius: currentRadius } = useOnboarding();

  const [newCapital, setNewCapital] = useState(currentCapital);
  const [newBusinessId, setNewBusinessId] = useState(currentBusiness?.id || "dairy");
  const [newLocationId, setNewLocationId] = useState(currentLocation?.id || "loc-1");
  const [newFeasibility, setNewFeasibility] = useState<ReturnType<typeof generateFeasibility> | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const newBusiness = businessCategories.find((b) => b.id === newBusinessId) || businessCategories[0];
  const newLocation = locations.find((l) => l.id === newLocationId) || locations[0];

  const handleCompare = useCallback(async () => {
    setIsComparing(true);
    await new Promise((r) => setTimeout(r, 800));
    const result = generateFeasibility(newBusinessId, newCapital, newLocationId, currentRadius);
    setNewFeasibility(result);
    setIsComparing(false);
  }, [newBusinessId, newCapital, newLocationId, currentRadius]);

  const handleReset = () => {
    setNewCapital(currentCapital);
    setNewBusinessId(currentBusiness?.id || "dairy");
    setNewLocationId(currentLocation?.id || "loc-1");
    setNewFeasibility(null);
  };

  const getScoreDelta = (current: number, newScore: number) => {
    const diff = newScore - current;
    if (diff > 0) return { icon: <TrendingUp className="h-3 w-3 text-emerald-500" />, text: `+${diff}`, color: "text-emerald-600" };
    if (diff < 0) return { icon: <TrendingDown className="h-3 w-3 text-red-500" />, text: `${diff}`, color: "text-red-600" };
    return { icon: <Minus className="h-3 w-3 text-muted-foreground" />, text: "0", color: "text-muted-foreground" };
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar variant="app" />

      <main className="flex-1 mx-auto max-w-5xl w-full px-4 py-6 sm:py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6">
          <Link to="/" className="hover:text-foreground transition-colors">
            <Home className="h-3.5 w-3.5" />
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/dashboard" className="hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">What-If Simulator</span>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">What-If Simulator</h1>
              <p className="text-sm text-muted-foreground">
                Change your inputs and see how the analysis changes
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls */}
          <div className="lg:col-span-1 space-y-5">
            <div className="rounded-2xl border border-border bg-white p-5">
              <h3 className="text-sm font-bold text-foreground mb-4">Modify Inputs</h3>

              {/* Capital */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Capital Contribution
                </label>
                <CurrencyInput value={newCapital} onChange={setNewCapital} />
                <div className="flex gap-1.5 mt-2">
                  {QUICK_AMOUNTS.map((amt) => (
                    <button
                      key={amt.value}
                      onClick={() => setNewCapital(amt.value)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all",
                        newCapital === amt.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      {amt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Business */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Business Type
                </label>
                <select
                  value={newBusinessId}
                  onChange={(e) => setNewBusinessId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {businessCategories.filter((b) => b.id !== "suggest").map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.icon} {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Location */}
              <div className="mb-5">
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Location
                </label>
                <select
                  value={newLocationId}
                  onChange={(e) => setNewLocationId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}, {l.district}
                    </option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleCompare}
                  disabled={isComparing || newCapital <= 0}
                  className={cn(
                    "flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
                    newCapital > 0 && !isComparing
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-muted text-muted-foreground cursor-not-allowed",
                  )}
                >
                  {isComparing ? (
                    <>
                      <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Comparing...
                    </>
                  ) : (
                    <>
                      Compare
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center justify-center h-10 w-10 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Current summary */}
            {currentFeasibility && (
              <div className="rounded-2xl border border-border bg-white p-5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Current Assessment
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Business</span>
                    <span className="font-semibold text-foreground">{currentBusiness?.name || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span className="font-semibold text-foreground">{currentLocation?.name || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Capital</span>
                    <span className="font-semibold text-foreground">{formatIndianCurrency(currentCapital)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-border">
                    <span className="text-muted-foreground">Score</span>
                    <span className="font-bold text-foreground">{currentFeasibility.overallScore}/100</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Comparison Results */}
          <div className="lg:col-span-2">
            {!newFeasibility ? (
              <div className="rounded-2xl border border-border bg-white p-8 text-center min-h-[400px] flex flex-col items-center justify-center">
                <Sparkles className="h-10 w-10 text-primary/30 mb-3" />
                <h3 className="text-lg font-bold text-foreground mb-1">
                  Modify inputs and click Compare
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Change the capital, business type or location to see how your feasibility analysis would change.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Score Comparison */}
                <div className="rounded-2xl border border-border bg-white p-6">
                  <h3 className="text-sm font-bold text-foreground mb-4">Overall Score</h3>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{currentBusiness?.name || "Current"}</p>
                      <p className="text-3xl font-bold text-foreground">{currentFeasibility?.overallScore || 0}</p>
                      <div className={cn("mt-1 inline-flex items-center gap-1 text-xs font-semibold", getVerdictColor(currentFeasibility?.verdict || "caution"))}>
                        {getVerdictIcon(currentFeasibility?.verdict || "caution")} {currentFeasibility?.verdictLabel || "N/A"}
                      </div>
                    </div>
                    <div className="text-2xl text-muted-foreground">→</div>
                    <div className="flex-1 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{newBusiness.name}</p>
                      <p className="text-3xl font-bold text-foreground">{newFeasibility.overallScore}</p>
                      <div className={cn("mt-1 inline-flex items-center gap-1 text-xs font-semibold", getVerdictColor(newFeasibility.verdict))}>
                        {getVerdictIcon(newFeasibility.verdict)} {newFeasibility.verdictLabel}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sub-score Comparison */}
                <div className="rounded-2xl border border-border bg-white p-6">
                  <h3 className="text-sm font-bold text-foreground mb-4">Score Breakdown</h3>
                  <div className="space-y-3">
                    {(["marketScore", "opportunityScore", "competitionScore", "riskScore", "financialFitScore"] as const).map((key) => {
                      const label = key.replace("Score", "").replace(/([A-Z])/g, " $1").trim();
                      const current = currentFeasibility?.subScores?.[key] || 0;
                      const newVal = newFeasibility.subScores[key];
                      const delta = getScoreDelta(current, newVal);

                      return (
                        <div key={key} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-28 capitalize">{label}</span>
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary/60 rounded-full transition-all duration-500"
                              style={{ width: `${newVal}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-foreground w-8 text-right">{newVal}</span>
                          <div className={cn("flex items-center gap-0.5 text-[10px] font-bold w-10", delta.color)}>
                            {delta.icon}
                            {delta.text}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Financial Comparison */}
                <div className="rounded-2xl border border-border bg-white p-6">
                  <h3 className="text-sm font-bold text-foreground mb-4">Financial Structure</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-muted/50 p-4">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Current</p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Project Cost</span>
                          <span className="font-semibold">{formatIndianCurrency(currentFeasibility?.financial.totalProjectCost || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Loan</span>
                          <span className="font-semibold">{formatIndianCurrency(currentFeasibility?.financial.potentialLoan || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Scheme</span>
                          <span className="font-semibold">{currentFeasibility?.financial.recommendedScheme || "N/A"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-primary/5 border border-primary/10 p-4">
                      <p className="text-[10px] font-semibold text-primary uppercase mb-2">New Scenario</p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Project Cost</span>
                          <span className="font-semibold">{formatIndianCurrency(newFeasibility.financial.totalProjectCost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Loan</span>
                          <span className="font-semibold">{formatIndianCurrency(newFeasibility.financial.potentialLoan)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Scheme</span>
                          <span className="font-semibold">{newFeasibility.financial.recommendedScheme}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Decision Comparison */}
                <div className="rounded-2xl border border-border bg-white p-6">
                  <h3 className="text-sm font-bold text-foreground mb-4">Decision</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className={cn(
                      "rounded-xl p-4 border",
                      currentFeasibility?.verdict === "good" ? "bg-emerald-50 border-emerald-200" : currentFeasibility?.verdict === "caution" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200",
                    )}>
                      <p className="text-lg mb-1">{getVerdictIcon(currentFeasibility?.verdict || "caution")}</p>
                      <p className={cn("text-sm font-bold", getVerdictColor(currentFeasibility?.verdict || "caution"))}>
                        {currentFeasibility?.verdictLabel || "N/A"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{currentBusiness?.name}</p>
                    </div>
                    <div className={cn(
                      "rounded-xl p-4 border",
                      newFeasibility.verdict === "good" ? "bg-emerald-50 border-emerald-200" : newFeasibility.verdict === "caution" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200",
                    )}>
                      <p className="text-lg mb-1">{getVerdictIcon(newFeasibility.verdict)}</p>
                      <p className={cn("text-sm font-bold", getVerdictColor(newFeasibility.verdict))}>
                        {newFeasibility.verdictLabel}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{newBusiness.name}</p>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <div className="flex gap-3">
                  <Link
                    to="/dashboard"
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    View Full Dashboard
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
