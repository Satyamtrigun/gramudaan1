import { useCallback } from "react";
import { useNavigate } from "react-router";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { demoScenarios, type DemoScenario } from "@/data/demos";
import { useOnboarding } from "@/lib/onboarding-context";
import { cn } from "@/lib/utils";
import {
  MapPin,
  Store,
  IndianRupee,
  BarChart3,
  ShieldCheck,
  Target,
  TrendingUp,
  AlertTriangle,
  Users,
  Lightbulb,
  ArrowUpRight,
  Check,
  ChevronRight,
  Play,
  Sparkles,
  BrainCircuit,
  GitCompareArrows,
  FileText,
} from "lucide-react";
import { Link } from "react-router";

/* ─── Hero Section ─── */
function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#EDF3E3] via-[#F4F8EF] to-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(200,230,77,0.15),transparent_60%)]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-12 pb-16 sm:pt-20 sm:pb-20">
        <div className="max-w-3xl mx-auto text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            AI-Powered Business Advisory
          </p>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight">
            Turn Your Business Idea Into a{" "}
            <span className="italic text-primary">Smarter Decision</span>
          </h1>

          <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto">
            Understand your local market, competition, risks and financing options
            before you invest your hard-earned money. Built for rural and semi-urban
            entrepreneurs who deserve clarity, not guesswork.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/onboarding"
              className="group inline-flex items-center gap-2.5 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
            >
              Check My Business Idea
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-[11px] transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-6 py-3.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              See How It Works
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </a>
          </div>
        </div>

        {/* Product Visualization — Sample Analysis */}
        <div className="mt-12 sm:mt-16 mx-auto max-w-4xl">
          <div className="rounded-2xl border border-border/60 bg-white/90 backdrop-blur-sm p-5 sm:p-7 shadow-xl shadow-black/5">
            {/* Sample label */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Sample Analysis
              </p>
              <span className="text-[10px] font-medium text-muted-foreground/50 bg-muted/50 px-2 py-0.5 rounded-full">
                Demo data — not a real assessment
              </span>
            </div>

            {/* Flow visualization */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-2">
              <FlowCard
                icon={<MapPin className="h-5 w-5" />}
                title="Location"
                desc="Rampur, UP"
              />
              <Arrow />
              <FlowCard
                icon={<Store className="h-5 w-5" />}
                title="Business"
                desc="Dairy Farm"
              />
              <Arrow />
              <FlowCard
                icon={<IndianRupee className="h-5 w-5" />}
                title="Capital"
                desc="₹2,00,000"
              />
              <Arrow className="hidden sm:flex" />
              <div className="hidden sm:block">
                <FlowResult score={78} verdict="Good Potential" />
              </div>
            </div>
            <div className="sm:hidden mt-3">
              <FlowResult score={78} verdict="Good Potential" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FlowCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[#F4F8EF] px-4 py-3 min-w-[130px] sm:min-w-[140px]">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <p className="text-sm font-bold text-foreground">{desc}</p>
      </div>
    </div>
  );
}

function Arrow({ className }: { className?: string }) {
  return (
    <div className={`text-primary/30 ${className}`}>
      <ChevronRight className="h-5 w-5 rotate-90 sm:rotate-0" />
    </div>
  );
}

function FlowResult({ score, verdict }: { score: number; verdict: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200/60 px-5 py-3 min-w-[170px]">
      <div className="text-center">
        <span className="text-2xl font-bold text-emerald-600">{score}</span>
        <span className="text-xs text-emerald-500 block">/ 100</span>
      </div>
      <div className="border-l border-emerald-200 pl-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600/70">
          AI Analysis
        </p>
        <p className="text-sm font-bold text-emerald-700">🟢 {verdict}</p>
      </div>
    </div>
  );
}

/* ─── How It Works ─── */
function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Choose Your Location",
      desc: "Select your village, town or block where you plan to start your business.",
      icon: <MapPin className="h-5 w-5" />,
    },
    {
      num: "02",
      title: "Pick Your Business & Type",
      desc: "Choose from 12+ business categories, then the exact type — dairy farming, kirana, repair shop and more.",
      icon: <Store className="h-5 w-5" />,
    },
    {
      num: "03",
      title: "Tell Us Your Place & Capital",
      desc: "Do you already own a shop or land? How much can you contribute? Costs adjust automatically.",
      icon: <IndianRupee className="h-5 w-5" />,
    },
    {
      num: "04",
      title: "Get Your Decision",
      desc: "Full feasibility with transparent costs, profit timeline, break-even, risk and better alternatives.",
      icon: <BarChart3 className="h-5 w-5" />,
    },
  ];

  return (
    <section id="how-it-works" className="py-16 sm:py-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">
            Simple Process
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            How It <span className="italic text-primary">Works</span>
          </h2>
          <p className="mt-3 text-muted-foreground text-sm sm:text-base">
            Four simple steps from idea to informed decision.
          </p>
        </div>

        <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-4">
          <div className="hidden lg:block absolute top-12 left-[12%] right-[12%] h-0.5 bg-border" />
          {steps.map((step) => (
            <div key={step.num} className="relative flex flex-col items-center text-center group">
              <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-2xl bg-[#F4F8EF] border border-border/60 mb-4 transition-all duration-200 group-hover:shadow-md group-hover:border-primary/20 group-hover:-translate-y-0.5">
                <div className="flex flex-col items-center">
                  <div className="text-primary">{step.icon}</div>
                  <span className="mt-1 text-[10px] font-bold text-primary/60">{step.num}</span>
                </div>
              </div>
              <h3 className="text-base font-bold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-[240px] leading-relaxed">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── What We Analyze (with sample metrics) ─── */
function WhatWeAnalyze() {
  const pillars = [
    {
      icon: <Users className="h-5 w-5" />,
      title: "Market Reach",
      desc: "How many potential customers can you realistically reach from your location?",
      metric: "≈ 4,200 households",
      metricLabel: "Example reach",
      color: "bg-blue-50 text-blue-600 border-blue-200/60",
    },
    {
      icon: <Lightbulb className="h-5 w-5" />,
      title: "Opportunity",
      desc: "What gaps exist in the local market that your business could fill?",
      metric: "3 underserved categories",
      metricLabel: "Example finding",
      color: "bg-amber-50 text-amber-600 border-amber-200/60",
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: "SWOT Analysis",
      desc: "A personalized breakdown of your strengths, weaknesses, opportunities and threats.",
      metric: "Personalized to your situation",
      metricLabel: "Generated for you",
      color: "bg-emerald-50 text-emerald-600 border-emerald-200/60",
    },
    {
      icon: <AlertTriangle className="h-5 w-5" />,
      title: "Local Risks",
      desc: "Key risks in your area, their severity, and practical ways to reduce them.",
      metric: "3 key risks identified",
      metricLabel: "Example output",
      color: "bg-red-50 text-red-600 border-red-200/60",
    },
    {
      icon: <Target className="h-5 w-5" />,
      title: "Competition",
      desc: "Who your competitors are, how many exist nearby, and where they operate.",
      metric: "18 similar businesses",
      metricLabel: "Example count",
      color: "bg-purple-50 text-purple-600 border-purple-200/60",
    },
    {
      icon: <TrendingUp className="h-5 w-5" />,
      title: "Product Pricing",
      desc: "Regional pricing data and a recommended price range for your products.",
      metric: "₹58–₹64 range",
      metricLabel: "Example pricing",
      color: "bg-cyan-50 text-cyan-600 border-cyan-200/60",
    },
  ];

  return (
    <section id="features" className="py-16 sm:py-24 bg-gradient-to-b from-white to-[#F4F8EF]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">
            Comprehensive Analysis
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            What We <span className="italic text-primary">Analyze</span>
          </h2>
          <p className="mt-3 text-muted-foreground text-sm sm:text-base">
            Your analysis combines your location, business type and available capital
            to give you a complete picture.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-border/60 bg-white p-5 sm:p-6 transition-all duration-200 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 group"
            >
              <div
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${p.color} mb-3`}
              >
                {p.icon}
              </div>
              <h3 className="text-base font-bold text-foreground mb-1.5">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">{p.desc}</p>
              {/* Sample metric */}
              <div className="rounded-lg bg-muted/40 px-3 py-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">{p.metric}</span>
                <span className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                  {p.metricLabel}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Financial Planning Section ─── */
function FinancialPlanning() {
  const items = [
    {
      icon: <IndianRupee className="h-5 w-5" />,
      title: "Smart Capital Planning",
      desc: "See exactly how your savings connect to loan amounts, government schemes and monthly repayment plans — so you know your financial picture before you commit.",
    },
    {
      icon: <BarChart3 className="h-5 w-5" />,
      title: "Revenue Estimates",
      desc: "Get projected monthly revenue ranges based on local market data and realistic assumptions for your specific business and location.",
    },
    {
      icon: <Check className="h-5 w-5" />,
      title: "Clear GO / CAUTION / RETHINK",
      desc: "A straightforward, honest recommendation so you know whether to proceed with confidence, be careful, or consider a different direction.",
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">
              Financial Clarity
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
              Complete{" "}
              <span className="italic text-primary">Financial Planning</span>{" "}
              for Your Business
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              From your initial savings to government loan schemes, GramUdaan
              helps you understand every rupee before you invest. No surprises, no
              guesswork — just clarity.
            </p>
            <Link
              to="/onboarding"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Start Your Analysis
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.title}
                className="flex gap-4 rounded-2xl border border-border/60 bg-[#F4F8EF] p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {item.icon}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Trust Section (with data trust legend) ─── */
function TrustSection() {
  return (
    <section id="trust" className="py-16 sm:py-20 bg-[#F4F8EF]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-5">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold">
            Trusted & <span className="italic text-primary">Transparent</span>
          </h2>
          <p className="mt-4 text-muted-foreground leading-relaxed text-sm sm:text-base">
            GramUdaan provides recommendations based on available data, market
            estimates and defined rules. We clearly label what is verified data,
            what is estimated, and what is AI-generated insight. Always verify
            critical financial and regulatory information before making investment
            decisions.
          </p>

          {/* Data Trust Legend */}
          <div className="mt-6 inline-flex items-center gap-3 sm:gap-4 rounded-full border border-border/60 bg-white px-5 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <span className="h-4 w-4 rounded-full bg-emerald-100 flex items-center justify-center text-[10px]">✓</span>
              Verified
            </span>
            <span className="h-4 w-4 border-l border-border" />
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600">
              <span className="h-4 w-4 rounded-full bg-amber-100 flex items-center justify-center text-[10px]">≈</span>
              Estimated
            </span>
            <span className="h-4 w-4 border-l border-border" />
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
              <span className="h-4 w-4 rounded-full bg-blue-100 flex items-center justify-center text-[10px]">🤖</span>
              AI Insight
            </span>
          </div>

          {/* Confidence indicators */}
          <div className="mt-4 flex items-center justify-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> High Confidence
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Medium Confidence
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> Low Confidence
            </span>
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: "✓", label: "Data-Driven Insights", desc: "Based on real market data where available" },
              { icon: "≈", label: "Clearly Marked Estimates", desc: "We never hide uncertainty" },
              { icon: "🛡️", label: "Privacy-First Approach", desc: "Your data stays with you" },
            ].map((t) => (
              <div
                key={t.label}
                className="rounded-2xl border border-border/60 bg-white p-5 text-center transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="text-2xl mb-2">{t.icon}</div>
                <h4 className="text-sm font-bold text-foreground">{t.label}</h4>
                <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── What's Inside ─── */
function WhatsInside() {
  const features = [
    {
      icon: <BrainCircuit className="h-5 w-5" />,
      title: "AI Business Advisor",
      desc: "Ask context-aware questions about your assessment. The AI understands your location, business, capital and all analysis results.",
    },
    {
      icon: <Sparkles className="h-5 w-5" />,
      title: "What-If Simulator",
      desc: "Change your capital, business type or location and instantly see how the analysis changes. Compare scenarios side by side.",
    },
    {
      icon: <GitCompareArrows className="h-5 w-5" />,
      title: "Business Comparison",
      desc: "Compare 2–3 business ideas across market reach, competition, risk and financial fit to find your best option.",
    },
    {
      icon: <FileText className="h-5 w-5" />,
      title: "Business Decision Report",
      desc: "A professional report with all your analysis, financial structure and action plan — ready to share with bank officers or partners.",
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">
            Beyond Feasibility
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            Everything You Need to <span className="italic text-primary">Decide</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border/60 bg-[#F4F8EF] p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3">
                {f.icon}
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1.5">{f.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Demo Mode (interactive) ─── */
function DemoMode() {
  const navigate = useNavigate();
  const { loadDemo } = useOnboarding();

  const handleDemoClick = useCallback(
    (demo: DemoScenario) => {
      loadDemo(demo);
      navigate("/dashboard");
    },
    [loadDemo, navigate],
  );

  const verdictColors = {
    good: "text-emerald-600 bg-emerald-50",
    caution: "text-amber-600 bg-amber-50",
    rethink: "text-red-600 bg-red-50",
  };

  return (
    <section className="py-16 sm:py-20 bg-[#F4F8EF]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">
            Try It Now
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            Demo <span className="italic text-primary">Scenarios</span>
          </h2>
          <p className="mt-3 text-muted-foreground text-sm sm:text-base">
            Explore preset scenarios to see how GramUdaan works. Each demonstrates a different aspect of the analysis.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {demoScenarios.map((demo) => (
            <button
              key={demo.id}
              onClick={() => handleDemoClick(demo)}
              className="text-left rounded-2xl border border-border/60 bg-white p-5 transition-all duration-200 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 hover:border-primary/20 group cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{demo.icon}</span>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", verdictColors[demo.verdict])}>
                  {demo.verdict === "good" ? "🟢 GOOD" : demo.verdict === "caution" ? "🟡 CAUTION" : "🔴 RETHINK"}
                </span>
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1">{demo.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">{demo.description}</p>

              {/* Edge case callout for scheme limit */}
              {demo.id === "demo-scheme-edge" && (
                <div className="rounded-lg bg-amber-50 border border-amber-200/60 px-3 py-2 mb-3">
                  <p className="text-[10px] font-semibold text-amber-700">
                    ₹6L → ₹60L project → exceeds ₹50L scheme limit
                  </p>
                  <p className="text-[10px] text-amber-600 mt-0.5">
                    Shows compliant financing structure
                  </p>
                </div>
              )}

              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary group-hover:gap-2.5 transition-all">
                <Play className="h-3 w-3" /> Try Demo
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Final CTA (compact) ─── */
function FinalCTA() {
  return (
    <section className="py-12 sm:py-16 bg-gradient-to-b from-[#F4F8EF] to-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-primary p-8 sm:p-10 text-center text-primary-foreground overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(200,230,77,0.12),transparent_60%)]" />
          <div className="relative">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">
              Ready to Check Your Business Idea?
            </h2>
            <p className="text-primary-foreground/70 text-sm sm:text-base max-w-lg mx-auto mb-6">
              Tell us where you want to start, what you want to build, and how
              much you can invest — and we will help you understand whether this is
              a sensible business decision. It takes less than 3 minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/onboarding"
                className="inline-flex items-center gap-2.5 rounded-full bg-white px-8 py-3.5 text-sm font-bold text-primary hover:bg-white/90 transition-all shadow-lg"
              >
                Check My Business Idea
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px]">
                  →
                </span>
              </Link>
              <Link
                to="/onboarding"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-primary-foreground/80 hover:bg-white/10 transition-colors"
              >
                <Play className="h-4 w-4" /> Try Demo
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Landing Page ─── */
export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <WhatWeAnalyze />
        <FinancialPlanning />
        <WhatsInside />
        <TrustSection />
        <DemoMode />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
