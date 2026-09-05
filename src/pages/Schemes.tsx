import { useOnboarding } from "@/lib/onboarding-context";
import { ModuleHeader, ModuleEmptyState, StatCard } from "@/components/module-ui";
import SchemesSection from "@/components/SchemesSection";
import { formatIndianCurrency } from "@/data/assessment";
import { Landmark, FileText, ShieldAlert, ArrowRight } from "lucide-react";
import { Link } from "react-router";

export default function Schemes() {
  const { feasibility: f, business, location } = useOnboarding();

  if (!f || !business || !location) {
    return (
      <ModuleEmptyState
        title="Schemes are matched to your full profile"
        description="Complete the assessment with your location, business and capital — GramUdaan will rank government schemes and financing options against your project cost and funding need, with official sources to verify."
      />
    );
  }

  const fin = f.financial;

  return (
    <div className="space-y-5">
      <ModuleHeader
        icon={<Landmark className="h-5 w-5" />}
        title="Schemes & Financing"
        badge="verify with official source"
        subtitle={`Financing options for ${business.icon} ${business.name} in ${location.name}, ${location.district} — matched to your estimated funding requirement.`}
        actions={
          <Link to="/application" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90">
            <FileText className="h-3.5 w-3.5" /> Prepare Application Draft
          </Link>
        }
      />

      {/* Funding snapshot */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Project Cost" value={formatIndianCurrency(fin.totalProjectCost)} sub="current plan estimate" />
        <StatCard label="Your Capital" value={formatIndianCurrency(fin.availableContribution)} sub="own contribution" />
        <StatCard
          label="Funding Need"
          value={fin.potentialLoan > 0 ? formatIndianCurrency(fin.potentialLoan) : "None"}
          tone={fin.potentialLoan > 0 ? "warning" : "positive"}
          sub={fin.potentialLoan > 0 ? "to arrange via loan / scheme / partner" : "your capital covers the plan"}
        />
        <StatCard label="Matched Profile" value={`${business.name}`} sub={`${location.name}, ${location.district}`} className="truncate" />
      </div>

      {/* Scheme matching (existing engine + UI) */}
      <SchemesSection />

      {/* How to use this page */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
            <ShieldAlert className="h-4 w-4 text-amber-500" /> Read this before applying
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Matches are preliminary and rule-based — GramUdaan is <span className="font-semibold text-foreground">not</span> a bank or scheme authority, and never guarantees eligibility or approval.
            Always open the official source on each scheme and confirm current criteria, documents and deadlines with the implementing agency.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
            <FileText className="h-4 w-4 text-emerald-600" /> Next step after shortlisting
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Open a scheme and tap <span className="font-semibold text-foreground">“Prepare Application Draft”</span> — GramUdaan pre-fills an editable, downloadable loan application draft
            from your financial structure so you can verify and submit it to your bank.
          </p>
          <Link to="/reports" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary">
            See all reports & drafts <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
