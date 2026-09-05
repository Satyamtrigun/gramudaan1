import { useMemo } from "react";
import { useOnboarding } from "@/lib/onboarding-context";
import { formatIndianCurrency, getSeverityColor, getVerdictColor, getVerdictBg, getVerdictIcon } from "@/data/assessment";
import type { Location } from "@/data/locations";
import IndiaMap, { type MapPoint } from "@/components/IndiaMap";
import { hashString, offsetKm } from "@/services/geo/geoUtils";
import { DataConfidenceBadge } from "@/components/ui/DataConfidenceBadge";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useCountUp } from "@/hooks/useCountUp";
import SchemesSection from "@/components/SchemesSection";
import HyperlocalIntelligence from "@/components/HyperlocalIntelligence";
import GramUdaanInsights from "@/components/GramUdaanInsights";
import { useInView } from "@/hooks/useInView";
import {
  Users, Lightbulb, ShieldCheck, AlertTriangle, Target,
  TrendingUp, IndianRupee, CheckCircle2, ArrowUpRight,
  Zap, ChevronRight, CircleDot, Home, Store, Calculator,
  Clock, AlertCircle, Brain, ArrowRight,
} from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { feasibility, location, business, capital, radius } = useOnboarding();

  if (!feasibility) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar variant="app" />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md animate-fade-in">
            <div className="h-16 w-16 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center">
              <Store className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">No Analysis Found</h2>
            <p className="text-sm text-muted-foreground mb-6">
              You haven't run an assessment yet. Tell us about your business idea and we will analyze it for you.
            </p>
            <Link
              to="/onboarding"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Start Assessment
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const f = feasibility;
  const locationLabel = location ? `${location.name}, ${location.district}` : "Selected Location";

  return (
    <div className="min-h-screen bg-background">
      <Navbar variant="app" />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6">
          <Link to="/" className="hover:text-foreground transition-colors"><Home className="h-3.5 w-3.5" /></Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">Feasibility Dashboard</span>
        </div>

        {/* ═══ HERO SCORE ═══ */}
        <HeroScore
          score={f.overallScore}
          verdict={f.verdict}
          verdictLabel={f.verdictLabel}
          businessName={business?.name || "Your Business"}
          locationName={locationLabel}
          radius={radius}
          subScores={f.subScores}
        />

        {/* ═══ BUSINESS AT A GLANCE ═══ */}
        <BusinessAtGlance decision={f.decision} verdict={f.verdict} />

        {/* Data Trust */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <DataConfidenceBadge type="estimated" confidence="medium" />
          <p className="text-xs text-muted-foreground">
            Analysis based on simulated market data for demonstration purposes
          </p>
        </div>

        {/* ═══ SECTION GRID ═══ */}
        <div className="mt-8 space-y-5">
          {/* ── Decision Section ── */}
          <DecisionSection f={f} business={business} locationLabel={locationLabel} verdict={f.verdict as "good" | "caution" | "rethink"} />

          {/* ── Market + Opportunity ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <MarketReachSection f={f} />
            <OpportunitySection f={f} />
          </div>

          {/* ── SWOT ── */}
          <SWOTSection f={f} />

          {/* ── Risks + Competition ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <RisksSection f={f} />
            <CompetitionSection f={f} location={location} radius={radius} />
          </div>

          {/* ── Hyperlocal Market Intelligence ── */}
          {location && business && capital > 0 && (
            <HyperlocalIntelligence
              feasibility={f}
              location={location}
              business={business}
              capital={capital}
              radius={radius}
            />
          )}

          {/* ── Pricing ── */}
          <PricingSection f={f} />

          {/* ── Financial Overview ── */}
          <FinancialOverviewSection f={f} />

          {/* ── GramUdaan: cost breakdown, capital & scale, profit timeline, alternatives ── */}
          <GramUdaanInsights f={f} />

          {/* ── Government Schemes & Financing ── */}
          <SchemesSection />
        </div>

        {/* ═══ NEXT STEPS ACTION PLAN ═══ */}
        <ActionPlanSection nextSteps={f.nextSteps} verdict={f.verdict} />

        {/* ═══ CTA ═══ */}
        <div className="mt-8 mb-12 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/plan"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/15"
          >
            Open My Plan
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/advisor" className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
            Ask AI Advisor
          </Link>
          <Link to="/what-if" className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
            Try What-If
          </Link>
          <Link to="/compare" className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
            Compare Businesses
          </Link>
          <Link to="/report" className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
            View Report
          </Link>
          <Link to="/onboarding" className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
            New Assessment
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}

/* ═══ HERO SCORE ═══ */
function HeroScore({ score, verdict, verdictLabel, businessName, locationName, radius, subScores }: {
  score: number; verdict: "good" | "caution" | "rethink"; verdictLabel: string; businessName: string;
  locationName: string; radius: number; subScores?: {
    marketScore: number; opportunityScore: number; competitionScore: number;
    riskScore: number; financialFitScore: number;
  };
}) {
  const { count: animatedScore, ref: countRef } = useCountUp(score, 1200);
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;
  const { ref: viewRef, isInView } = useInView();

  const miniScores = subScores ? [
    { label: "Market", value: subScores.marketScore },
    { label: "Opportunity", value: subScores.opportunityScore },
    { label: "Competition", value: subScores.competitionScore },
    { label: "Risk", value: subScores.riskScore },
    { label: "Financial Fit", value: subScores.financialFitScore },
  ] : [];

  return (
    <div ref={viewRef} className="rounded-2xl border-2 border-border bg-white p-6 sm:p-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
        {/* Animated Ring */}
        <div ref={countRef} className="relative flex-shrink-0">
          <svg width="120" height="120" viewBox="0 0 100 100" className="transform -rotate-90">
            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="6" />
            <circle
              cx="50" cy="50" r="45" fill="none"
              stroke={verdict === "good" ? "#10b981" : verdict === "caution" ? "#f59e0b" : "#ef4444"}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={isInView ? offset : circumference}
              style={{ transition: "stroke-dashoffset 1.2s ease-out 0.3s" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-foreground font-serif-display">{animatedScore}</span>
            <span className="text-[10px] font-semibold text-muted-foreground">/ 100</span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Business Feasibility</p>
          <h1 className={cn("text-2xl sm:text-3xl font-bold font-serif-display", getVerdictColor(verdict))}>
            {verdictLabel}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {businessName} · {locationName} · {radius} km analysis radius
          </p>
        </div>
      </div>

      {/* Sub-scores */}
      {miniScores.length > 0 && (
        <div className="mt-6 pt-5 border-t border-border/60 grid grid-cols-5 gap-2 sm:gap-4">
          {miniScores.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{s.label}</p>
              <div className="relative mx-auto w-10 h-10 sm:w-12 sm:h-12">
                <svg width="100%" height="100%" viewBox="0 0 100 100" className="transform -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke={s.value >= 70 ? "#10b981" : s.value >= 50 ? "#f59e0b" : "#ef4444"}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 40}
                    strokeDashoffset={isInView ? (2 * Math.PI * 40) - (s.value / 100) * (2 * Math.PI * 40) : 2 * Math.PI * 40}
                    style={{ transition: "stroke-dashoffset 1s ease-out 0.5s" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs sm:text-sm font-bold text-foreground">{s.value}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ BUSINESS AT A GLANCE ═══ */
function BusinessAtGlance({ decision, verdict }: { decision: { whyPoints: string[]; watchOuts: string[] }; verdict: string }) {
  const signals = [
    {
      icon: <CheckCircle2 className="h-4 w-4" />,
      label: "STRONGEST SIGNAL",
      text: decision.whyPoints[0] || "Positive market indicators",
      color: "bg-emerald-50 border-emerald-200 text-emerald-700",
      iconColor: "text-emerald-500",
    },
    {
      icon: <AlertTriangle className="h-4 w-4" />,
      label: "WATCH CLOSELY",
      text: decision.watchOuts[0] || "Some risks to monitor",
      color: "bg-amber-50 border-amber-200 text-amber-700",
      iconColor: "text-amber-500",
    },
    {
      icon: <IndianRupee className="h-4 w-4" />,
      label: "FINANCIAL POSITION",
      text: verdict === "good"
        ? "Current contribution appears manageable"
        : verdict === "caution"
          ? "Financial structure needs careful planning"
          : "Consider adjusting your investment level",
      color: "bg-blue-50 border-blue-200 text-blue-700",
      iconColor: "text-blue-500",
    },
  ];

  return (
    <div className="mt-5 rounded-2xl border border-border bg-white p-5 sm:p-6">
      <h3 className="text-sm font-bold text-foreground mb-3 font-serif-display">Your Business at a Glance</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {signals.map((s) => (
          <div key={s.label} className={cn("rounded-xl border p-4", s.color)}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={s.iconColor}>{s.icon}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="text-sm font-medium leading-relaxed">{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ DECISION SECTION ═══ */
function DecisionSection({ f, business, locationLabel }: {
  f: any; business: any; locationLabel: string; verdict: "good" | "caution" | "rethink";
}) {
  return (
    <div className="rounded-2xl border-2 border-border bg-white p-6 sm:p-8 animate-slide-up">
      <div className="flex items-start gap-4 mb-6">
        <div className={cn(
          "flex h-14 w-14 items-center justify-center rounded-2xl flex-shrink-0",
          f.verdict === "good" ? "bg-emerald-50" : f.verdict === "caution" ? "bg-amber-50" : "bg-red-50",
        )}>
          <span className="text-3xl">{getVerdictIcon(f.verdict)}</span>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Final Decision</p>
          <h2 className={cn("text-2xl sm:text-3xl font-bold mt-1 font-serif-display", getVerdictColor(f.verdict))}>
            {f.verdict === "good" ? "GOOD TO GO" : f.verdict === "caution" ? "PROCEED CAREFULLY" : "CONSIDER AN ALTERNATIVE"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            {f.overallScore}/100 · {business?.name} · {locationLabel}
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed mb-6">{f.decision.summary}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Why we recommend this
          </h3>
          <ul className="space-y-2">
            {f.decision.whyPoints.map((point: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Watch before investing
          </h3>
          <ul className="space-y-2">
            {f.decision.watchOuts.map((point: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-[#F4F8EF] border border-border/60 p-4">
        <p className="text-xs font-semibold text-foreground mb-1">Recommended Next Step</p>
        <p className="text-sm text-muted-foreground">Validate local demand with 10–15 potential customers before investing.</p>
      </div>
    </div>
  );
}

/* ═══ MARKET REACH ═══ */
function MarketReachSection({ f }: { f: any }) {
  const { ref, isInView } = useInView();
  const householdPct = Math.min(100, (f.marketReach.households / 5000) * 100);
  const customerPct = Math.min(100, (f.marketReach.potentialCustomers / 20000) * 100);

  return (
    <SectionCard icon={<Users className="h-5 w-5" />} title="Market Reach" badge="Estimated" score={f.subScores?.marketScore}>
      <div ref={ref} className="mb-4">
        <div className="mb-3">
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Households</p>
            <p className="text-lg font-bold text-foreground">{f.marketReach.households.toLocaleString("en-IN")}</p>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary/60 rounded-full" style={{ width: isInView ? `${householdPct}%` : "0%", transition: "width 1s ease-out 0.2s" }} />
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Potential Customers</p>
            <p className="text-lg font-bold text-foreground">{f.marketReach.potentialCustomers.toLocaleString("en-IN")}</p>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary/40 rounded-full" style={{ width: isInView ? `${customerPct}%` : "0%", transition: "width 1s ease-out 0.4s" }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricBlock label="Population" value={f.marketReach.population.toLocaleString("en-IN")} />
        <MetricBlock label="Nearby Villages" value={f.marketReach.nearbyVillages.toString()} />
      </div>

      <div className="mb-3">
        <p className="text-xs font-semibold text-foreground mb-1.5">Customer Groups</p>
        <div className="flex flex-wrap gap-1.5">
          {f.marketReach.customerGroups.map((g: string) => (
            <span key={g} className="rounded-full bg-primary/5 border border-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">{g}</span>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <p className="text-xs font-semibold text-foreground mb-1.5">Distribution Channels</p>
        <div className="flex flex-wrap gap-1.5">
          {f.marketReach.distributionChannels.map((d: string) => (
            <span key={d} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{d}</span>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{f.marketReach.summary}</p>
    </SectionCard>
  );
}

/* ═══ OPPORTUNITY ═══ */
function OpportunitySection({ f }: { f: any }) {
  return (
    <SectionCard icon={<Lightbulb className="h-5 w-5" />} title="Opportunity" badge="AI Insight" badgeType="ai" score={f.subScores?.opportunityScore}>
      {/* Market Gap Card */}
      <div className="rounded-xl bg-gradient-to-r from-emerald-50 to-primary/5 border border-emerald-200 p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 flex-shrink-0">
            <Lightbulb className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Market Gap</p>
            <p className="text-sm font-semibold text-emerald-800 mt-0.5">💡 {f.opportunity.underserved}</p>
          </div>
        </div>
      </div>

      {f.opportunity.highCompetitionWarning && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mb-4">
          <p className="text-xs font-bold text-amber-700 mb-0.5">⚠️ Competition Alert</p>
          <p className="text-xs text-amber-600">{f.opportunity.highCompetitionWarning}</p>
        </div>
      )}

      <p className="text-xs font-semibold text-foreground mb-2">Existing Businesses in Area</p>
      <div className="space-y-2 mb-3">
        {f.opportunity.existingBusinesses.map((b: any) => (
          <div key={b.name} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-28 truncate">{b.name}</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary/60 rounded-full" style={{ width: `${Math.min(100, (b.count / 40) * 100)}%` }} />
            </div>
            <span className="text-xs font-semibold text-foreground w-6 text-right">{b.count}</span>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 mb-2">
        <p className="text-xs font-semibold text-primary mb-0.5">✦ AI Insight</p>
        <p className="text-xs text-muted-foreground">
          {f.opportunity.score >= 75
            ? "Your selected category has relatively low local competition compared with nearby business categories."
            : "Competition is moderate. Differentiation and service quality will be key to success."}
        </p>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{f.opportunity.summary}</p>
    </SectionCard>
  );
}

/* ═══ SWOT ═══ */
function SWOTSection({ f }: { f: any }) {
  return (
    <SectionCard icon={<ShieldCheck className="h-5 w-5" />} title="SWOT Analysis" badge="Personalized" className="rounded-2xl border border-border bg-white p-5 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <SWOTQuadrant title="Strengths" items={f.swot.strengths} color="emerald" />
        <SWOTQuadrant title="Weaknesses" items={f.swot.weaknesses} color="red" />
        <SWOTQuadrant title="Opportunities" items={f.swot.opportunities} color="blue" />
        <SWOTQuadrant title="Threats" items={f.swot.threats} color="amber" />
      </div>
      <div className="rounded-xl bg-primary/5 border border-primary/10 p-3">
        <p className="text-xs font-semibold text-primary mb-0.5">✦ AI Insight</p>
        <p className="text-xs text-muted-foreground">
          Your biggest advantage is local demand; your biggest concern is supply reliability.
        </p>
      </div>
      <div className="mt-3">
        <DataConfidenceBadge type="ai-insight" confidence="medium" />
        <p className="text-[11px] text-muted-foreground mt-1">Personalized based on your location + business + capital + local data</p>
      </div>
    </SectionCard>
  );
}

function SWOTQuadrant({ title, items, color }: { title: string; items: string[]; color: string }) {
  const colorMap: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    emerald: { bg: "bg-emerald-50/50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
    red: { bg: "bg-red-50/50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" },
    blue: { bg: "bg-blue-50/50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-500" },
    amber: { bg: "bg-amber-50/50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
  };
  const c = colorMap[color] || colorMap.emerald;

  return (
    <div className={cn("rounded-xl border p-4", c.bg, c.border)}>
      <p className={cn("text-xs font-bold uppercase tracking-wider mb-2", c.text)}>{title}</p>
      <ul className="space-y-1.5">
        {items.slice(0, 3).map((item: string, i: number) => (
          <li key={i} className="flex items-start gap-2 text-xs text-foreground/80 leading-relaxed">
            <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0", c.dot)} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ═══ LOCAL RISKS ═══ */
function RisksSection({ f }: { f: any }) {
  const severityIcon: Record<string, string> = { high: "🔴", medium: "🟠", low: "🟢" };
  const severityBorder: Record<string, string> = { high: "border-l-red-400", medium: "border-l-amber-400", low: "border-l-emerald-400" };

  return (
    <SectionCard icon={<AlertTriangle className="h-5 w-5" />} title="Local Risks" badge="Estimated" score={f.subScores?.riskScore}>
      <div className="space-y-3">
        {f.risks.map((risk: any) => (
          <div key={risk.id} className={cn("rounded-xl border border-border border-l-4 p-4 transition-all hover:shadow-sm", severityBorder[risk.severity])}>
            <div className="flex items-center gap-2 mb-1.5">
              <span>{severityIcon[risk.severity]}</span>
              <span className="text-sm font-bold text-foreground">{risk.name}</span>
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border", getSeverityColor(risk.severity))}>
                {risk.severity.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{risk.explanation}</p>
            <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5">What you can do</p>
              <p className="text-xs font-medium text-primary/80">{risk.mitigation}</p>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/* ═══ COMPETITION ═══ */

/**
 * Deterministically place the (estimated) competitor set on a real map:
 * each competitor keeps its reported distance from the selected location and
 * gets a stable bearing derived from its name — so the layout is consistent
 * for a given location and changes plausibly when the location changes.
 */
function competitorPoints(
  location: Location | null,
  competitors: { name: string; type: string; distance: string }[],
): MapPoint[] {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return [];
  return competitors.map((c, i) => {
    const parsed = parseFloat(c.distance);
    const km = Number.isFinite(parsed) && parsed > 0 ? parsed : 0.3 + (i % 6) * 0.4;
    const bearing = hashString(`${location.id}|${c.name}|${c.type}`) % 360;
    const [lat, lng] = offsetKm(location.lat, location.lng, bearing, km);
    return { lat, lng, label: c.name, sublabel: `${c.type} · ${c.distance}` };
  });
}

function CompetitionSection({ f, location, radius }: { f: any; location: Location | null; radius: number }) {
  const densityColors: Record<string, string> = { high: "text-red-600", medium: "text-amber-600", low: "text-emerald-600" };
  const densityBg: Record<string, string> = { high: "bg-red-50 border-red-200", medium: "bg-amber-50 border-amber-200", low: "bg-emerald-50 border-emerald-200" };

  const centerLoc =
    location && Number.isFinite(location.lat) && Number.isFinite(location.lng) && location.lat !== 0 && location.lng !== 0
      ? location
      : null;
  const dots = useMemo(
    () => competitorPoints(centerLoc, f.competition.competitors),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [centerLoc, f.competition.competitors],
  );

  return (
    <SectionCard icon={<Target className="h-5 w-5" />} title="Competition" badge="Estimated" score={f.subScores?.competitionScore}>
      {/* Real geographic map: selected location marker + analysis radius + estimated competitors */}
      {centerLoc ? (
        <div className="mb-4">
          <IndiaMap
            point={{ lat: centerLoc.lat, lng: centerLoc.lng, label: centerLoc.name, sublabel: `${centerLoc.district}, ${centerLoc.state}` }}
            radiusKm={radius}
            competitors={dots}
            className="h-64 sm:h-72"
          />
          <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
            Map data © OpenStreetMap contributors · competitor positions are estimated from distance data
          </p>
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-border/60 bg-muted/40 px-4 py-6 text-center text-xs text-muted-foreground">
          Location coordinates unavailable — competitor map can't be drawn for this place.
        </div>
      )}

      <div className={cn("rounded-xl border p-3 mb-4", densityBg[f.competition.density])}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-foreground">{f.competition.totalBusinesses} competitors within analysis radius</p>
            <p className="text-[11px] text-muted-foreground">Estimated competitor density</p>
          </div>
          <span className={cn("text-sm font-bold uppercase", densityColors[f.competition.density])}>
            {f.competition.density}
          </span>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        {f.competition.competitors.slice(0, 6).map((c: any, i: number) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <CircleDot className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground truncate">{c.name}</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-muted-foreground">{c.type}</span>
              <span className="text-muted-foreground font-medium">{c.distance}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{f.competition.summary}</p>
    </SectionCard>
  );
}

/* ═══ PRICING ═══ */
function PricingSection({ f }: { f: any }) {
  return (
    <SectionCard icon={<TrendingUp className="h-5 w-5" />} title="Product Pricing" badge="AI Insight" badgeType="ai" className="rounded-2xl border border-border bg-white p-5 sm:p-6">
      {f.pricing.unit && (
        <p className="text-xs text-muted-foreground mb-4">Unit: {f.pricing.unit}</p>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl bg-muted/50 p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Regional Price</p>
          <p className="text-lg font-bold text-foreground mt-1">{f.pricing.regionalPrice}</p>
        </div>
        <div className="rounded-xl bg-muted/50 p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Competitor Range</p>
          <p className="text-sm font-bold text-foreground mt-1">{f.pricing.competitorRange}</p>
        </div>
        <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Recommended</p>
          <p className="text-lg font-bold text-primary mt-1">{f.pricing.recommendedPrice}</p>
        </div>
      </div>

      <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 mb-3">
        <p className="text-xs font-semibold text-primary mb-1">Why this price?</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{f.pricing.explanation}</p>
      </div>

      <DataConfidenceBadge type="ai-insight" confidence="low" />
    </SectionCard>
  );
}

/* ═══ FINANCIAL OVERVIEW ═══ */
function FinancialOverviewSection({ f }: { f: any }) {
  return (
    <SectionCard icon={<IndianRupee className="h-5 w-5" />} title="Financial Overview" badge="Engine" badgeType="verified" className="rounded-2xl border border-border bg-white p-5 sm:p-6 lg:col-span-2">
      {/* Funding Structure */}
      {f.financial.projectCostBreakdown && (
        <div className="mb-6">
          <h4 className="text-xs font-bold text-foreground mb-3 flex items-center gap-2 uppercase tracking-wider">
            <Calculator className="h-3.5 w-3.5" />
            Funding Structure
          </h4>

          {f.financial.projectCostBreakdown.isLimitExceeded && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 mb-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold text-amber-700">Scheme Limit Exceeded</p>
                  <p className="text-xs text-amber-600 mt-1">
                    Calculated project cost ({formatIndianCurrency(f.financial.projectCostBreakdown.rawProjectCost)}) exceeds the scheme maximum.
                    A compliant structure is shown below.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 mb-4">
            <MetricBlock
              label="Your Contribution"
              value={formatIndianCurrency(f.financial.projectCostBreakdown.entrepreneurContribution)}
              highlight
            />
            <MetricBlock
              label="Total Project Cost"
              value={formatIndianCurrency(
                f.financial.projectCostBreakdown.isLimitExceeded
                  ? f.financial.projectCostBreakdown.compliantProjectCost || f.financial.totalProjectCost
                  : f.financial.totalProjectCost
              )}
            />
            <MetricBlock
              label="Agency Funding"
              value={formatIndianCurrency(
                f.financial.projectCostBreakdown.isLimitExceeded
                  ? f.financial.projectCostBreakdown.compliantAgencyFunding || f.financial.potentialLoan
                  : f.financial.potentialLoan
              )}
            />
          </div>
        </div>
      )}

      {/* Loan Snapshot */}
      {f.financial.loanDetails && (
        <div className="mb-6">
          <h4 className="text-xs font-bold text-foreground mb-3 flex items-center gap-2 uppercase tracking-wider">
            <Clock className="h-3.5 w-3.5" />
            Loan Snapshot — {f.financial.recommendedScheme}
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricBlock label="Loan Amount" value={formatIndianCurrency(f.financial.loanDetails.amount)} />
            <MetricBlock label="Interest Rate" value={`${f.financial.loanDetails.interestRate}%`} />
            <MetricBlock label="Tenure" value={`${f.financial.loanDetails.tenure} years`} />
            <MetricBlock label="Moratorium" value={`${f.financial.loanDetails.moratorium} months`} />
          </div>
        </div>
      )}

      {/* Monthly Affordability */}
      {f.financial.affordability && (
        <div className="mb-4">
          <h4 className="text-xs font-bold text-foreground mb-3 uppercase tracking-wider">Monthly Affordability</h4>
          <div className={cn(
            "rounded-xl border p-5",
            f.financial.affordability.rating === "comfortable"
              ? "bg-emerald-50 border-emerald-200"
              : f.financial.affordability.rating === "tight"
                ? "bg-amber-50 border-amber-200"
                : "bg-red-50 border-red-200",
          )}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">{f.financial.affordability.ratingIcon}</span>
              <span className={cn(
                "text-sm font-bold",
                f.financial.affordability.rating === "comfortable" ? "text-emerald-700"
                  : f.financial.affordability.rating === "tight" ? "text-amber-700"
                  : "text-red-700",
              )}>{f.financial.affordability.ratingLabel}</span>
            </div>

            {/* Cash flow visual breakdown */}
            <div className="space-y-3">
              <CashFlowRow label="Expected Revenue" value={f.financial.affordability.expectedRevenue} type="positive" />
              <CashFlowRow label="Operating Costs" value={f.financial.affordability.operatingCosts} type="negative" />
              <div className="border-t border-current/10 pt-2">
                <CashFlowRow label="Estimated Cash Flow" value={f.financial.affordability.cashFlow} type="neutral" bold />
              </div>
              <CashFlowRow label="Loan Repayment" value={f.financial.affordability.monthlyRepayment} type="negative" />
              <div className="border-t border-current/10 pt-2">
                <CashFlowRow
                  label="Net Monthly Position"
                  value={f.financial.affordability.surplus}
                  type={f.financial.affordability.surplus >= 0 ? "positive" : "negative"}
                  bold
                />
              </div>
            </div>

            {f.financial.affordability.assumptions.length > 0 && (
              <div className="mt-4 pt-3 border-t border-current/10">
                <p className="text-[10px] font-semibold text-muted-foreground mb-1">Assumptions</p>
                <ul className="text-[10px] text-muted-foreground space-y-0.5">
                  {f.financial.affordability.assumptions.map((a: string, i: number) => (
                    <li key={i}>• {a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-3">
        <DataConfidenceBadge type="verified" />
        <p className="text-[11px] text-muted-foreground mt-1">
          Financial calculations are deterministic and based on PMEGP/MUDRA scheme rules
        </p>
      </div>

      {/* Loan application entry */}
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-primary/10 bg-primary/[0.03] p-3.5">
        <div className="flex-1">
          <p className="text-xs font-bold text-foreground">Prepare your loan application</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Pre-fill an editable application draft from this financial structure and your matched schemes.
          </p>
        </div>
        <Link
          to="/application"
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Prepare Loan Application
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </SectionCard>
  );
}

function CashFlowRow({ label, value, type, bold }: { label: string; value: number; type: "positive" | "negative" | "neutral"; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-xs", bold ? "font-bold text-foreground" : "text-muted-foreground")}>{label}</span>
      <span className={cn(
        "text-sm font-semibold",
        type === "positive" ? "text-emerald-600" : type === "negative" ? "text-red-600" : "text-foreground",
      )}>
        {type === "negative" ? "−" : type === "positive" && value > 0 ? "+" : ""}{formatIndianCurrency(Math.abs(value))}/mo
      </span>
    </div>
  );
}

/* ═══ ACTION PLAN ═══ */
function ActionPlanSection({ nextSteps, verdict }: { nextSteps: string[]; verdict: string }) {
  const actionLabels = [
    "Validate Demand", "Secure Supply", "Validate Pricing",
    "Prepare Investment", "Explore Financing", "Prepare Documentation",
  ];

  return (
    <div className="mt-6 rounded-2xl border border-border bg-white p-6 sm:p-8 animate-slide-up">
      <h3 className="text-lg font-bold text-foreground mb-1 font-serif-display">Your Action Plan</h3>
      <p className="text-sm text-muted-foreground mb-5">
        Complete these steps in order to prepare for your business launch.
      </p>
      <div className="space-y-3">
        {nextSteps.slice(0, 6).map((step, i) => (
          <label
            key={i}
            className={cn(
              "flex items-start gap-4 rounded-xl border p-4 hover:bg-muted/30 transition-all cursor-pointer group",
              i === 0 ? "border-primary/30 bg-primary/[0.02]" : "border-border",
            )}
          >
            <div className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0 text-xs font-bold",
              i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}>
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-0.5">
                {actionLabels[i] || `Step ${i + 1}`}
              </p>
              <p className="text-sm text-foreground group-hover:text-foreground/90">{step}</p>
            </div>
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary/20 accent-primary"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

/* ═══ SECTION CARD ═══ */
function SectionCard({ icon, title, badge, badgeType, score, children, className }: {
  icon: React.ReactNode; title: string; badge?: string; badgeType?: "verified" | "estimated" | "ai";
  score?: number; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-white p-5 sm:p-6 transition-all hover:shadow-sm", className)}>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
        </div>
        {score !== undefined && (
          <div className={cn(
            "text-xs font-bold px-2 py-0.5 rounded-full",
            score >= 70 ? "bg-emerald-50 text-emerald-600" : score >= 50 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600",
          )}>{score}</div>
        )}
        {badge && (
          <span className={cn(
            "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
            badgeType === "ai" ? "bg-blue-50 text-blue-600 border-blue-200"
              : badgeType === "verified" ? "bg-emerald-50 text-emerald-600 border-emerald-200"
              : "bg-amber-50 text-amber-600 border-amber-200",
          )}>
            {badgeType === "ai" ? "🤖 " : badgeType === "verified" ? "✓ " : "≈ "}{badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function MetricBlock({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl p-3 text-center", highlight ? "bg-primary/5 border border-primary/10" : "bg-muted/50")}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold mt-1", highlight ? "text-primary" : "text-foreground")}>{value}</p>
    </div>
  );
}
