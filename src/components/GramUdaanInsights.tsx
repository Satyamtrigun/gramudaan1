import { useMemo } from "react";
import type { FeasibilityData } from "@/data/feasibility-types";
import { formatIndianCurrency } from "@/data/assessment";
import {
  Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  IndianRupee, TrendingUp, Scale as ScaleIcon, Target, Layers,
  CheckCircle2, AlertTriangle, Sparkles, Info, ArrowRight, ListChecks,
} from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  CALCULATED: { label: "calculated", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  ESTIMATED: { label: "estimated", cls: "bg-amber-50 text-amber-600 border-amber-200" },
  USER_PROVIDED: { label: "user-provided", cls: "bg-blue-50 text-blue-600 border-blue-200" },
};

const RISK_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  low: { label: "Lower risk", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  medium: { label: "Moderate risk", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  high: { label: "Higher risk", cls: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
};

export default function GramUdaanInsights({ f }: { f: FeasibilityData }) {
  return (
    <div className="space-y-5">
      <CostBreakdownSection f={f} />
      {f.profitModel && <CapitalScaleSection f={f} />}
      {f.profitModel && <ProfitTimelineSection f={f} />}
      {f.alternatives && f.alternatives.length > 0 && <AlternativesSection f={f} />}
    </div>
  );
}

/* ═══ 1. TRANSPARENT COST BREAKDOWN ═══ */

function CostBreakdownSection({ f }: { f: FeasibilityData }) {
  const breakdown = f.costBreakdown;
  if (!breakdown) return null;

  return (
    <div className="rounded-2xl border border-border bg-white p-5 sm:p-6 transition-all hover:shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Layers className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-foreground">Transparent Cost Breakdown</h3>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600">≈ estimates</span>
      </div>

      <div className="rounded-xl border border-border/60 bg-[#F4F8EF] p-4 mb-4 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Estimated initial requirement</p>
          <p className="text-2xl font-bold text-primary font-serif-display">{formatIndianCurrency(breakdown.total)}</p>
        </div>
        {breakdown.monthlyRentEstimate > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">If renting · monthly</p>
            <p className="text-lg font-bold text-foreground">{formatIndianCurrency(breakdown.monthlyRentEstimate)}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
        {breakdown.components.filter((c) => c.amount > 0).map((c) => {
          const badge = SOURCE_BADGE[c.source] || SOURCE_BADGE.ESTIMATED;
          const pct = breakdown.total > 0 ? Math.round((c.amount / breakdown.total) * 100) : 0;
          return (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-white px-3.5 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{c.label}</p>
                <p className="text-[10px] text-muted-foreground">{c.labelHi}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className="text-sm font-bold text-foreground">{formatIndianCurrency(c.amount)}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-muted-foreground">{pct}%</span>
                  <span className={cn("rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide", badge.cls)}>{badge.label}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-1.5 mb-3">
        {breakdown.notes.map((n, i) => (
          <p key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="h-3 w-3 text-primary flex-shrink-0 mt-0.5" />
            {n}
          </p>
        ))}
      </div>

      <details className="rounded-lg border border-border/60 bg-white/70 px-3 py-2 text-xs">
        <summary className="cursor-pointer select-none font-semibold text-primary">How was this estimated?</summary>
        <p className="mt-2 text-muted-foreground leading-relaxed">
          Component shares are based on typical rural micro-enterprise setups for this business type, your place arrangement (own/rent/buy/build), and the selected scale.
          These are preliminary estimates for decision support — actual costs depend on local prices, quality of equipment and the scale you finally choose.
        </p>
      </details>
    </div>
  );
}

/* ═══ 2. CAPITAL UTILIZATION + SCALE ═══ */

function CapitalScaleSection({ f }: { f: FeasibilityData }) {
  const pm = f.profitModel!;
  const cap = pm.capital;

  return (
    <div className="rounded-2xl border border-border bg-white p-5 sm:p-6 transition-all hover:shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ScaleIcon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-foreground">Capital Utilization & Business Scale</h3>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600">≈ estimates</span>
      </div>

      {/* Capital vs requirement */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl bg-muted/50 p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Your available capital</p>
          <p className="text-lg font-bold text-foreground mt-1">{formatIndianCurrency(cap.availableCapital)}</p>
        </div>
        <div className={cn("rounded-xl p-4 text-center border", cap.fundingGap > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200")}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Funding gap</p>
          <p className={cn("text-lg font-bold mt-1", cap.fundingGap > 0 ? "text-amber-700" : "text-emerald-700")}>
            {cap.fundingGap > 0 ? formatIndianCurrency(cap.fundingGap) : "₹0 — covered"}
          </p>
        </div>
        <div className={cn("rounded-xl p-4 text-center border", cap.remainingCapital > 0 ? "bg-emerald-50 border-emerald-200" : "bg-muted/50")}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Remaining capital</p>
          <p className={cn("text-lg font-bold mt-1", cap.remainingCapital > 0 ? "text-emerald-700" : "text-muted-foreground")}>
            {formatIndianCurrency(cap.remainingCapital)}
          </p>
        </div>
      </div>

      {/* Remaining capital allocation */}
      {cap.allocationSuggestions.length > 0 && (
        <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3.5 mb-4">
          <p className="text-xs font-bold text-primary mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            {cap.remainingCapital > 0 ? "Possible use of your remaining capital" : "How to handle the requirement"}
          </p>
          <ul className="space-y-1">
            {cap.allocationSuggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0 mt-0.5" /> {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Scale comparison */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-xs min-w-[560px]">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-3 font-semibold text-muted-foreground">Scale</th>
              <th className="py-2 pr-3 font-semibold text-muted-foreground">Investment</th>
              <th className="py-2 pr-3 font-semibold text-muted-foreground">Monthly revenue</th>
              <th className="py-2 pr-3 font-semibold text-muted-foreground">Monthly profit</th>
              <th className="py-2 pr-3 font-semibold text-muted-foreground">Margin</th>
              <th className="py-2 pr-3 font-semibold text-muted-foreground">Break-even</th>
              <th className="py-2 font-semibold text-muted-foreground">Risk</th>
            </tr>
          </thead>
          <tbody>
            {pm.scales.map((s) => {
              const risk = RISK_STYLE[s.risk];
              const isRecommended = s.id === "recommended";
              return (
                <tr key={s.id} className={cn("border-b border-border/50", isRecommended && "bg-primary/[0.03]")}>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("font-bold", isRecommended ? "text-primary" : "text-foreground")}>{s.label}</span>
                      {isRecommended && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">recommended</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{s.note}</p>
                  </td>
                  <td className="py-2.5 pr-3 font-semibold">{formatIndianCurrency(s.investment)}</td>
                  <td className="py-2.5 pr-3">{formatIndianCurrency(s.revenue)}</td>
                  <td className={cn("py-2.5 pr-3 font-semibold", s.profit >= 0 ? "text-emerald-600" : "text-red-600")}>{formatIndianCurrency(s.profit)}</td>
                  <td className="py-2.5 pr-3">{s.margin}%</td>
                  <td className="py-2.5 pr-3">{s.breakEvenMonth ? `Month ${s.breakEvenMonth}` : "9+ months"}</td>
                  <td className="py-2.5">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold", risk.cls)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", risk.dot)} /> {risk.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">Investment is the estimated setup requirement at each scale. All figures are estimates for decision support.</p>
    </div>
  );
}

/* ═══ 3. PROFIT TIMELINE + BREAK-EVEN ═══ */

function ProfitTimelineSection({ f }: { f: FeasibilityData }) {
  const pm = f.profitModel!;

  const chartData = useMemo(
    () => pm.timeline.map((p) => ({ month: p.label, revenue: p.revenue, expenses: p.expenses, profit: p.profit })),
    [pm],
  );

  return (
    <div className="rounded-2xl border border-border bg-white p-5 sm:p-6 transition-all hover:shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-foreground">Profit Timeline & Break-even</h3>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600">≈ estimates</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded-xl bg-muted/50 p-3.5 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Est. monthly revenue</p>
          <p className="text-base font-bold text-foreground mt-1">{formatIndianCurrency(pm.monthlyRevenue)}</p>
        </div>
        <div className="rounded-xl bg-muted/50 p-3.5 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Est. monthly expenses</p>
          <p className="text-base font-bold text-foreground mt-1">{formatIndianCurrency(pm.monthlyExpenses)}</p>
        </div>
        <div className={cn("rounded-xl p-3.5 text-center border", pm.monthlyProfit >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200")}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Est. monthly profit</p>
          <p className={cn("text-base font-bold mt-1", pm.monthlyProfit >= 0 ? "text-emerald-700" : "text-red-600")}>{formatIndianCurrency(pm.monthlyProfit)}</p>
        </div>
        <div className="rounded-xl bg-primary/5 border border-primary/10 p-3.5 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Operating break-even</p>
          <p className="text-base font-bold text-primary mt-1">{pm.breakEvenMonth ? `~Month ${pm.breakEvenMonth}` : "9+ months"}</p>
        </div>
      </div>

      {/* 12-month chart */}
      <div className="mb-3">
        <ChartContainer config={{ revenue: { label: "Revenue", color: "#10b981" }, expenses: { label: "Expenses", color: "#f59e0b" }, profit: { label: "Profit/Loss", color: "#6366f1" } }} className="h-64">
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={10} />
            <YAxis tickLine={false} axisLine={false} fontSize={9} width={44} tickFormatter={(v: number) => `₹${Math.round(v / 1000)}k`} />
            <RechartsTooltip content={<ChartTooltipContent />} />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
            <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="expenses" stroke="#f59e0b" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="profit" stroke="#6366f1" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ChartContainer>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5">
          <p className="text-xs font-bold text-foreground mb-1 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-primary" /> Break-even explained
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {pm.breakEvenMonth
              ? `Under current assumptions the business is estimated to cover its operating costs around month ${pm.breakEvenMonth} (break-even sales ≈ ${formatIndianCurrency(pm.breakEvenSales)}/month). Months before that may show a loss as customers build up.`
              : "Under current assumptions operating break-even is not reached within 12 months — revisit the scale, pricing or costs."}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <p className="text-xs font-bold text-foreground">Profit-based risk — {pm.risk.label}</p>
            <span className={cn("ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold", RISK_STYLE[pm.risk.level].cls)}>{pm.risk.level.toUpperCase()}</span>
          </div>
          <ul className="space-y-1">
            {pm.risk.reasons.positive.map((r, i) => (
              <li key={`p${i}`} className="flex items-start gap-1.5 text-[11px] text-emerald-700">
                <CheckCircle2 className="h-3 w-3 flex-shrink-0 mt-0.5" /> {r}
              </li>
            ))}
            {pm.risk.reasons.concerns.map((r, i) => (
              <li key={`c${i}`} className="flex items-start gap-1.5 text-[11px] text-amber-700">
                <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" /> {r}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <details className="rounded-lg border border-border/60 bg-white/70 px-3 py-2 text-xs">
        <summary className="cursor-pointer select-none font-semibold text-primary">Assumptions behind these numbers</summary>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          {pm.assumptions.map((a, i) => <li key={i}>• {a}</li>)}
        </ul>
      </details>
    </div>
  );
}

/* ═══ 4. ALTERNATIVE BUSINESSES ═══ */

function AlternativesSection({ f }: { f: FeasibilityData }) {
  const alts = f.alternatives!;

  return (
    <div className="rounded-2xl border border-border bg-white p-5 sm:p-6 transition-all hover:shadow-sm">
      <div className="flex items-center gap-3 mb-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ListChecks className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-foreground">Other Businesses Worth Comparing</h3>
        </div>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-600">🤖 ranked for your situation</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Ranked for <span className="font-semibold text-foreground">{formatIndianCurrency(f.financial.availableContribution)}</span> capital and your selected location — by capital fit, estimated profit, risk and local feasibility.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {alts.map((a, idx) => {
          const risk = RISK_STYLE[a.risk];
          return (
            <div key={a.businessId} className="rounded-xl border border-border/60 p-4 transition-all hover:shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-lg">{a.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-foreground truncate">{a.businessName}</p>
                    {idx === 0 && (
                      <span className="rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[9px] font-bold whitespace-nowrap">⭐ top fit</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{a.subCategoryName}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-primary font-serif-display">{a.fitScore}</p>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">fit score</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-2">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Needs {formatIndianCurrency(a.requiredInvestment)}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", a.fundingGap > 0 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200")}>
                  {a.fundingGap > 0 ? `Gap ${formatIndianCurrency(a.fundingGap)}` : "No funding gap"}
                </span>
                <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold">
                  ~{formatIndianCurrency(a.monthlyProfit)}/mo profit
                </span>
                <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", risk.cls)}>{risk.label}</span>
              </div>

              <ul className="space-y-1 mb-2">
                {a.reasons.slice(0, 3).map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-primary flex-shrink-0" /> {r}
                  </li>
                ))}
              </ul>

              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                Feasibility {a.feasibilityScore}/100 · Break-even {a.breakEvenMonth ? `~month ${a.breakEvenMonth}` : "9+ months"} · Margin {a.margin}%
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-primary/10 bg-primary/[0.03] p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <IndianRupee className="h-3.5 w-3.5 text-primary" /> Which one suits you best?
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Compare the full analysis of each business side by side before deciding.
          </p>
        </div>
        <Link to="/compare" className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors">
          Compare Businesses <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}