import { useState, useMemo } from "react";
import { generateFeasibility } from "@/data/feasibility";
import { formatIndianCurrency, getVerdictColor, getVerdictIcon } from "@/data/assessment";
import { businessCategories } from "@/data/businesses";
import { locations } from "@/data/locations";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  Home,
  ChevronRight,
  ArrowUpRight,
  Plus,
  X,
  Check,
} from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

interface Scenario {
  businessId: string;
  locationId: string;
  capital: number;
}

const DEFAULT_SCENARIOS: Scenario[] = [
  { businessId: "dairy", locationId: "loc-1", capital: 100000 },
  { businessId: "poultry-feed", locationId: "loc-1", capital: 100000 },
  { businessId: "grocery", locationId: "loc-1", capital: 100000 },
];

export default function Compare() {
  const [scenarios, setScenarios] = useState<Scenario[]>(DEFAULT_SCENARIOS);

  const results = useMemo(() => {
    return scenarios.map((s) => ({
      scenario: s,
      feasibility: generateFeasibility(s.businessId, s.capital, s.locationId),
      business: businessCategories.find((b) => b.id === s.businessId),
      location: locations.find((l) => l.id === s.locationId),
    }));
  }, [scenarios]);

  const bestScore = Math.max(...results.map((r) => r.feasibility.overallScore));
  const bestIndex = results.findIndex((r) => r.feasibility.overallScore === bestScore);

  const addScenario = () => {
    if (scenarios.length < 3) {
      setScenarios([...scenarios, { businessId: "mobile-repair", locationId: "loc-1", capital: 100000 }]);
    }
  };

  const removeScenario = (index: number) => {
    if (scenarios.length > 2) {
      setScenarios(scenarios.filter((_, i) => i !== index));
    }
  };

  const updateScenario = (index: number, field: keyof Scenario, value: string | number) => {
    const updated = [...scenarios];
    updated[index] = { ...updated[index], [field]: value };
    setScenarios(updated);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar variant="app" />

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-6 sm:py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6">
          <Link to="/" className="hover:text-foreground transition-colors">
            <Home className="h-3.5 w-3.5" />
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">Compare Businesses</span>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-1">Compare Business Ideas</h1>
          <p className="text-sm text-muted-foreground">
            Compare up to 3 business options side by side. Based on available data.
          </p>
        </div>

        {/* Scenario Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {scenarios.map((s, i) => (
            <div key={i} className={cn(
              "rounded-xl border p-4 relative",
              i === bestIndex ? "border-emerald-300 bg-emerald-50/50" : "border-border bg-white",
            )}>
              {i === bestIndex && (
                <span className="absolute -top-2.5 left-3 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  BEST FIT
                </span>
              )}
              {scenarios.length > 2 && (
                <button
                  onClick={() => removeScenario(i)}
                  className="absolute top-2 right-2 h-5 w-5 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-red-100 hover:text-red-500 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              <select
                value={s.businessId}
                onChange={(e) => updateScenario(i, "businessId", e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm mb-2 focus:border-primary focus:outline-none"
              >
                {businessCategories.filter((b) => b.id !== "suggest").map((b) => (
                  <option key={b.id} value={b.id}>{b.icon} {b.name}</option>
                ))}
              </select>
              <select
                value={s.locationId}
                onChange={(e) => updateScenario(i, "locationId", e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm mb-2 focus:border-primary focus:outline-none"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}, {l.district}</option>
                ))}
              </select>
              <select
                value={s.capital}
                onChange={(e) => updateScenario(i, "capital", Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm focus:border-primary focus:outline-none"
              >
                {[50000, 100000, 200000, 500000, 600000].map((v) => (
                  <option key={v} value={v}>{formatIndianCurrency(v)}</option>
                ))}
              </select>
            </div>
          ))}
          {scenarios.length < 3 && (
            <button
              onClick={addScenario}
              className="rounded-xl border-2 border-dashed border-border p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors min-h-[120px]"
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs font-semibold">Add Scenario</span>
            </button>
          )}
        </div>

        {/* Comparison Table */}
        <div className="rounded-2xl border border-border bg-white overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-40">
                    Metric
                  </th>
                  {results.map((r, i) => (
                    <th key={i} className={cn(
                      "text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider",
                      i === bestIndex ? "text-emerald-600 bg-emerald-50/50" : "text-muted-foreground",
                    )}>
                      {r.business?.icon} {r.business?.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <ComparisonRow
                  label="Overall Score"
                  values={results.map((r) => ({
                    value: `${r.feasibility.overallScore}/100`,
                    highlight: r.feasibility.overallScore === bestScore,
                  }))}
                />
                <ComparisonRow
                  label="Verdict"
                  values={results.map((r) => ({
                    value: `${getVerdictIcon(r.feasibility.verdict)} ${r.feasibility.verdictLabel}`,
                    color: getVerdictColor(r.feasibility.verdict),
                  }))}
                />
                <ComparisonRow
                  label="Market Score"
                  values={results.map((r) => ({ value: `${r.feasibility.subScores.marketScore}` }))}
                />
                <ComparisonRow
                  label="Opportunity Score"
                  values={results.map((r) => ({ value: `${r.feasibility.subScores.opportunityScore}` }))}
                />
                <ComparisonRow
                  label="Competition Score"
                  values={results.map((r) => ({ value: `${r.feasibility.subScores.competitionScore}` }))}
                />
                <ComparisonRow
                  label="Risk Score"
                  values={results.map((r) => ({ value: `${r.feasibility.subScores.riskScore}` }))}
                />
                <ComparisonRow
                  label="Financial Fit"
                  values={results.map((r) => ({ value: `${r.feasibility.subScores.financialFitScore}` }))}
                />
                <ComparisonRow
                  label="Project Cost"
                  values={results.map((r) => ({ value: formatIndianCurrency(r.feasibility.financial.totalProjectCost) }))}
                />
                <ComparisonRow
                  label="Loan Amount"
                  values={results.map((r) => ({ value: formatIndianCurrency(r.feasibility.financial.potentialLoan) }))}
                />
                <ComparisonRow
                  label="Scheme"
                  values={results.map((r) => ({ value: r.feasibility.financial.recommendedScheme }))}
                />
                <ComparisonRow
                  label="Repayment"
                  values={results.map((r) => ({ value: r.feasibility.financial.repayment }))}
                />
                <ComparisonRow
                  label="Competitors"
                  values={results.map((r) => ({ value: `${r.feasibility.competition.totalBusinesses} (${r.feasibility.competition.density})` }))}
                />
                <ComparisonRow
                  label="Households"
                  values={results.map((r) => ({ value: r.feasibility.marketReach.households.toLocaleString("en-IN") }))}
                />
                <ComparisonRow
                  label="Required Investment"
                  values={results.map((r) => ({ value: formatIndianCurrency(r.feasibility.profitModel?.capital.requiredInvestment ?? r.feasibility.financial.totalProjectCost) }))}
                />
                <ComparisonRow
                  label="Est. Monthly Revenue"
                  values={results.map((r) => ({ value: formatIndianCurrency(r.feasibility.profitModel?.monthlyRevenue ?? 0) }))}
                />
                <ComparisonRow
                  label="Est. Monthly Profit"
                  values={results.map((r) => ({ value: formatIndianCurrency(r.feasibility.profitModel?.monthlyProfit ?? 0) }))}
                />
                <ComparisonRow
                  label="Profit Margin"
                  values={results.map((r) => ({ value: r.feasibility.profitModel ? `${r.feasibility.profitModel.profitMargin}%` : "—" }))}
                />
                <ComparisonRow
                  label="Break-even"
                  values={results.map((r) => ({ value: r.feasibility.profitModel?.breakEvenMonth ? `~Month ${r.feasibility.profitModel.breakEvenMonth}` : "9+ months" }))}
                />
                <ComparisonRow
                  label="Profit-based Risk"
                  values={results.map((r) => ({ value: r.feasibility.profitModel ? r.feasibility.profitModel.risk.label : "—" }))}
                />
                <ComparisonRow
                  label="Funding Gap"
                  values={results.map((r) => ({ value: formatIndianCurrency(r.feasibility.profitModel?.capital.fundingGap ?? 0) }))}
                />
              </tbody>
            </table>
          </div>
        </div>

        {/* Recommendation */}
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-6 mb-8">
          <div className="flex items-start gap-3">
            <Check className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-emerald-800 mb-1">
                Based on the current assessment, {results[bestIndex]?.business?.name} appears to be the strongest fit.
              </h3>
              <p className="text-xs text-emerald-600">
                This comparison is based on available simulated data for demonstration purposes. Actual results may vary based on real market conditions.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex justify-center gap-3 mb-12">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            View Full Dashboard
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link
            to="/onboarding"
            className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Start New Assessment
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function ComparisonRow({
  label,
  values,
}: {
  label: string;
  values: { value: string; highlight?: boolean; color?: string }[];
}) {
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="px-5 py-3 text-xs font-semibold text-muted-foreground">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={cn(
          "px-4 py-3 text-center text-sm font-medium",
          v.highlight ? "font-bold text-emerald-600" : "text-foreground",
          v.color,
        )}>
          {v.value}
        </td>
      ))}
    </tr>
  );
}
