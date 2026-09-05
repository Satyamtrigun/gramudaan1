import { useOnboarding } from "@/lib/onboarding-context";
import { useAuth } from "@/hooks/use-auth";
import { ModuleHeader, ModuleEmptyState, StatCard } from "@/components/module-ui";
import { formatIndianCurrency } from "@/data/assessment";
import {
  Settings,
  Store,
  MapPin,
  IndianRupee,
  Pencil,
  LogOut,
  RotateCcw,
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { Link, useNavigate } from "react-router";

const PLACE_LABELS: Record<string, string> = {
  own: "I already have the place",
  rent: "I will rent",
  buy: "I will buy",
  build: "I will build",
  unsure: "Not decided yet",
};

export default function Profile() {
  const {
    feasibility: f,
    business,
    subCategory,
    location,
    radius,
    capital,
    otherFunding,
    targetInvestment,
    placeStatus,
    scaleChoice,
    costOverrides,
    reset,
  } = useOnboarding();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const overrideCount = Object.values(costOverrides).filter((v) => v > 0).length;

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    }
    navigate("/");
  };

  const handleReset = () => {
    reset();
    navigate("/onboarding");
  };

  const rows: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    {
      icon: <Store className="h-4 w-4 text-emerald-600" />,
      label: "Business",
      value: business ? `${business.icon} ${business.name}${subCategory ? ` · ${subCategory.name}` : ""}` : "Not selected",
    },
    {
      icon: <MapPin className="h-4 w-4 text-emerald-600" />,
      label: "Location",
      value: location ? `${location.name}, ${location.district} (${location.state}) · ${radius} km radius` : "Not selected",
    },
    {
      icon: <IndianRupee className="h-4 w-4 text-emerald-600" />,
      label: "Your capital",
      value: `${formatIndianCurrency(capital)}${otherFunding > 0 ? ` + ${formatIndianCurrency(otherFunding)} other funding` : ""}`,
    },
    {
      icon: <IndianRupee className="h-4 w-4 text-emerald-600" />,
      label: "Target investment",
      value: targetInvestment > 0 ? formatIndianCurrency(targetInvestment) : "Not entered",
    },
    {
      icon: <Store className="h-4 w-4 text-emerald-600" />,
      label: "Place / infrastructure",
      value: PLACE_LABELS[placeStatus] ?? "Not decided",
    },
    {
      icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />,
      label: "Starting scale",
      value: scaleChoice === "recommended" ? "Recommended setup" : scaleChoice === "small" ? "Small start" : "Expanded setup",
    },
    {
      icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />,
      label: "Feasibility",
      value: f ? `${f.overallScore}/100 · ${f.verdictLabel}` : "Not analyzed yet",
    },
    {
      icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />,
      label: "Cost edits",
      value: overrideCount > 0 ? `${overrideCount} cost line${overrideCount > 1 ? "s" : ""} customized` : "Using model estimates",
    },
  ];

  return (
    <div className="space-y-5">
      <ModuleHeader
        icon={<Settings className="h-5 w-5" />}
        title="Profile & Business Context"
        badge="one source of truth"
        subtitle="This is the profile every module reads. Change it here and Dashboard, Analysis, Finance, Market, Schemes, Reports and the AI Advisor all recalculate together."
      />

      {/* Business profile */}
      <div className="rounded-2xl border border-border bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-foreground">Your Business Profile</h2>
            {f && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> analysis active
              </span>
            )}
          </div>
          <Link
            to="/onboarding"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit Profile
          </Link>
        </div>

        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">{row.icon}</span>
              <span className="w-40 shrink-0 text-xs font-bold uppercase tracking-wider text-muted-foreground">{row.label}</span>
              <span className="min-w-0 flex-1 text-right font-medium text-foreground sm:text-left">{row.value}</span>
            </div>
          ))}
        </div>

        {!f && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Run an assessment to fill the profile with live financials.
          </p>
        )}
      </div>

      {/* Financial snapshot */}
      {f && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="Your Capital" value={formatIndianCurrency(f.financial.availableContribution || capital)} />
          <StatCard label="Project Cost" value={formatIndianCurrency(f.financial.totalProjectCost)} />
          <StatCard
            label="Funding Gap"
            value={f.profitModel ? formatIndianCurrency(f.profitModel.capital.fundingGap) : "—"}
            tone={f.profitModel?.capital.fundingGap ? "warning" : "positive"}
          />
          <StatCard label="Feasibility" value={`${f.overallScore}/100`} tone={f.overallScore >= 70 ? "positive" : f.overallScore >= 50 ? "warning" : "negative"} />
        </div>
      )}

      {/* Account */}
      <div className="rounded-2xl border border-border bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-foreground">Account</h2>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{user?.name || "GramUdaan User"}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email ?? "Signed in"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/advisor"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3.5 py-2 text-xs font-bold text-foreground hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Back to modules
            </Link>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Reset */}
      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-xs font-bold text-foreground">Start a completely fresh assessment?</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Clears the current business profile and analysis from this session. You can always rebuild it in a few minutes.
          </p>
        </div>
        <button
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 self-start rounded-full border border-amber-300 bg-white px-3.5 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Start fresh
        </button>
      </div>
    </div>
  );
}
