import { useOnboarding } from "@/lib/onboarding-context";
import { ModuleHeader, ModuleEmptyState, StatCard } from "@/components/module-ui";
import { FinancialOverviewSection } from "@/pages/Dashboard";
import GramUdaanInsights from "@/components/GramUdaanInsights";
import { formatIndianCurrency } from "@/data/assessment";
import { Wallet, ArrowRight, Calculator, Compass, FileText } from "lucide-react";
import { Link } from "react-router";

export default function Finance() {
  const { feasibility: f, business, capital } = useOnboarding();

  if (!f || !business) {
    return (
      <ModuleEmptyState
        title="Financial planning unlocks after your assessment"
        description="Financial Planning answers: how much does this business really need, where does your money go, what can you afford to borrow, and when do you break even? Run an assessment to see your personalized numbers."
      />
    );
  }

  const fin = f.financial;
  const monthlyRevenue = f.profitModel?.monthlyRevenue ?? fin.affordability?.expectedRevenue ?? null;
  const monthlyProfit = f.profitModel?.monthlyProfit ?? (fin.affordability ? fin.affordability.cashFlow - (fin.affordability.monthlyRepayment || 0) : null);

  return (
    <div className="space-y-5">
      <ModuleHeader
        icon={<Wallet className="h-5 w-5" />}
        title="Financial Planning"
        badge="your numbers"
        subtitle={`Where your money goes for ${business.icon} ${business.name} — cost breakdown, capital allocation, funding gap, loan affordability, profit, break-even and scenarios.`}
        actions={
          <>
            <Link to="/plan" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted">
              <Compass className="h-3.5 w-3.5" /> Guided Journey
            </Link>
            <Link to="/what-if" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90">
              <Calculator className="h-3.5 w-3.5" /> What-If Simulator
            </Link>
          </>
        }
      />

      {/* At a glance */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Available Capital" value={formatIndianCurrency(fin.availableContribution || capital || 0)} sub="own contribution" />
        <StatCard label="Total Project Cost" value={formatIndianCurrency(fin.totalProjectCost)} sub="setup + working capital" tone={f.profitModel?.capital.fundingGap ? "warning" : "neutral"} />
        <StatCard
          label="Funding Gap"
          value={f.profitModel ? formatIndianCurrency(f.profitModel.capital.fundingGap) : fin.potentialLoan > 0 ? formatIndianCurrency(fin.potentialLoan) : "₹0"}
          tone={f.profitModel?.capital.fundingGap ? "warning" : "positive"}
          sub="to arrange via loan / scheme / partner"
        />
        {monthlyRevenue != null ? (
          <StatCard label="Est. Monthly Profit" value={formatIndianCurrency(monthlyProfit ?? 0)} tone={(monthlyProfit ?? 0) >= 0 ? "positive" : "negative"} sub="after operating costs" />
        ) : (
          <StatCard label="Est. Monthly Profit" value="—" sub="unlocks at business-type step" />
        )}
      </div>

      {/* Loan snapshot + funding structure */}
      <FinancialOverviewSection f={f} />

      {/* Deep financial model: breakdown, capital & scale, timeline, alternatives */}
      <GramUdaanInsights f={f} />

      {/* Module quick links */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link to="/application" className="group rounded-2xl border border-border bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <FileText className="h-4 w-4 text-emerald-600" /> Loan Application Draft
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Pre-fill an editable application from this financial structure.</p>
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary">Open <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /></span>
        </Link>
        <Link to="/schemes" className="group rounded-2xl border border-border bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Calculator className="h-4 w-4 text-emerald-600" /> Schemes & Financing
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Government schemes ranked against this funding need.</p>
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary">Open <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /></span>
        </Link>
        <Link to="/what-if" className="group rounded-2xl border border-border bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Calculator className="h-4 w-4 text-emerald-600" /> “What if I invest more?”
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Change capital, customers or price — instantly see the effect.</p>
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary">Try it <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /></span>
        </Link>
      </div>
    </div>
  );
}
