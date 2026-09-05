import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useOnboarding } from "@/lib/onboarding-context";
import { buildAdvisoryPlan, simulateEmi, type AdvisoryPlan } from "@/engine/plan";
import { generateFeasibility } from "@/data/feasibility";
import { formatIndianCurrency, getVerdictColor, getVerdictIcon } from "@/data/assessment";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { ProgressStepper } from "@/components/ui/ProgressStepper";
import {
  initLocationService, searchLocations, searchPinOnline, suggestLocations, curatedSuggestions, registerHit,
  getLoadState, type LocationHit, type GeoLoadState,
} from "@/services/geo/locationService";
import { isPinQuery, PinLookupError } from "@/services/geo/pinApi";
import { businessCategories, type BusinessCategory } from "@/data/businesses";
import {
  getSubCategoriesForBusiness, getSubCategory,
  PLACE_STATUS_OPTIONS, SCALE_OPTIONS,
  type BusinessSubCategory, type PlaceStatus, type ScaleChoice,
} from "@/data/businessConfig";
import { matchSchemesForProfileSource } from "@/engine/schemeMatching";
import {
  MapPin, Store, Building2, IndianRupee, Landmark, TrendingUp, ShieldAlert, Award,
  ArrowLeft, ArrowRight, Check, X, Loader2, Search, Database, AlertCircle, RotateCcw,
  Info, RefreshCw, Sparkles, Users, Target, Lightbulb, Calendar,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  LineChart, Line, Legend, ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const JOURNEY = [
  { id: 0, label: "Location" },
  { id: 1, label: "Business" },
  { id: 2, label: "Resources" },
  { id: 3, label: "Capital & Cost" },
  { id: 4, label: "Funding" },
  { id: 5, label: "Profitability" },
  { id: 6, label: "Risk & Alternatives" },
  { id: 7, label: "Recommendation" },
] as const;

export default function Plan() {
  const ob = useOnboarding();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [loanSim, setLoanSim] = useState<{ amount: number; rate: number; tenure: number } | null>(null);
  const [whatIf, setWhatIf] = useState<null | {
    userCapital: number; otherFunding: number; revenueFactor: number; expenseFactor: number;
  }>(null);

  const ctx = {
    subCategoryId: ob.subCategory?.id ?? null,
    placeStatus: ob.placeStatus,
    rentMonthly: ob.rentMonthly,
    scaleChoice: ob.scaleChoice,
  };

  /* ── Single source of truth: one plan derived from shared state; every section reads it ── */
  const plan: AdvisoryPlan = useMemo(
    () => buildAdvisoryPlan({
      businessId: ob.business?.id ?? "other",
      subCategoryId: ctx.subCategoryId,
      placeStatus: ctx.placeStatus,
      rentMonthly: ctx.rentMonthly,
      scaleChoice: ctx.scaleChoice,
      userCapital: ob.capital,
      targetInvestment: ob.targetInvestment,
      otherFunding: ob.otherFunding,
      competitionDensity: ob.feasibility?.competition?.density,
    }),
    [ob.business?.id, ctx.subCategoryId, ctx.placeStatus, ctx.rentMonthly, ctx.scaleChoice, ob.capital, ob.targetInvestment, ob.otherFunding, ob.feasibility],
  );

  const schemeResult = useMemo(() => {
    if (!ob.business || !ob.location) return null;
    try {
      return matchSchemesForProfileSource({
        businessId: ob.business.id,
        businessName: ob.business.name,
        businessCategory: ob.business.category,
        state: ob.location.state,
        district: ob.location.district,
        contribution: plan.funding.userCapital + plan.funding.otherFunding,
        projectCost: plan.cost.totalProjectCost,
        fundingRequirement: plan.funding.loanRequired,
      });
    } catch {
      return null;
    }
  }, [ob.business, ob.location, plan.cost.totalProjectCost, plan.funding.userCapital, plan.funding.otherFunding, plan.funding.loanRequired]);

  const canProceed = [
    ob.location !== null,
    ob.business !== null,
    true,
    ob.capital > 0,
    true, true, true, true,
  ][step];

  const goNext = () => {
    const next = Math.min(7, step + 1);
    setStep(next);
    setMaxStep((m) => Math.max(m, next));
    window.scrollTo({ top: 0 });
  };
  const goBack = () => {
    setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0 });
  };
  const goTo = (i: number) => {
    setStep(i);
    setMaxStep((m) => Math.max(m, i));
    window.scrollTo({ top: 0 });
  };

  const loanSimDefaults = {
    amount: plan.funding.loanRequired,
    rate: plan.loan.interestRate,
    tenure: plan.loan.tenureYears,
  };
  const sim = useMemo(
    () => (loanSim && loanSim.amount > 0 ? simulateEmi(loanSim.amount, loanSim.rate, loanSim.tenure) : null),
    [loanSim],
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar variant="app" />
      <main className="flex-1 mx-auto max-w-3xl w-full px-4 py-6 sm:py-8">
        {/* Journey header */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary">GramUdaan Plan</p>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Step {step + 1} of 8 — {JOURNEY[step].label}</h1>
            </div>
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Exit
          </button>
          </div>
          <ProgressStepper steps={JOURNEY.map((s) => ({ id: s.id, label: s.label }))} currentStep={step} />
        </div>

        {/* ── STEP 0: Location & Profile ── */}
        {step === 0 && (
          <StepLocation ob={ob} onNext={goNext} />
        )}

        {/* ── STEP 1: Business ── */}
        {step === 1 && (
          <StepBusiness ob={ob} onNext={goNext} onBack={goBack} />
        )}

        {/* ── STEP 2: Resources & Local Market ── */}
        {step === 2 && (
          <StepResources ob={ob} plan={plan} onNext={goNext} onBack={goBack} />
        )}

        {/* ── STEP 3: Capital & Total Cost ── */}
        {step === 3 && (
          <StepCapital
            ob={ob}
            plan={plan}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {/* ── STEP 4: Funding & Loan ── */}
        {step === 4 && (
          <StepFunding
            ob={ob}
            plan={plan}
            schemeResult={schemeResult}
            sim={sim}
            loanSim={loanSim}
            setLoanSim={setLoanSim}
            loanSimDefaults={loanSimDefaults}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {/* ── STEP 5: Profitability & Projections ── */}
        {step === 5 && (
          <StepProfitability ob={ob} plan={plan} onNext={goNext} onBack={goBack} />
        )}

        {/* ── STEP 6: Risk, Feasibility & Alternatives ── */}
        {step === 6 && (
          <StepRisk ob={ob} plan={plan} onNext={goNext} onBack={goBack} />
        )}

        {/* ── STEP 7: Final Recommendation ── */}
        {step === 7 && (
          <StepRecommendation ob={ob} plan={plan} schemeResult={schemeResult} onRestart={() => { ob.reset(); goTo(0); }} />
        )}

        {/* Global nav (hidden on final step which has its own actions) */}
        {step < 7 && (
          <div className="sticky bottom-0 mt-8 border-t border-border/60 bg-background/95 backdrop-blur py-3 flex items-center justify-between gap-3">
            <button
              onClick={goBack}
              disabled={step === 0}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold",
                step === 0 ? "opacity-40 cursor-not-allowed" : "hover:bg-muted",
              )}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={goNext}
              disabled={!canProceed}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all",
                canProceed ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

/* ═════════════════ STEP 0 — LOCATION & PROFILE ═════════════════ */

function StepLocation({ ob, onNext }: { ob: ReturnType<typeof useOnboarding>; onNext: () => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LocationHit[]>([]);
  const [geo, setGeo] = useState<GeoLoadState>(getLoadState());
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinTick, setPinTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const s = getLoadState();
    setGeo(s.status === "ready" ? s : { status: "loading", progress: 0 });
    setHits(curatedSuggestions(8));
    if (s.status === "ready") return;
    initLocationService(
      (pct: number) => { if (!cancelled) setGeo({ status: "loading", progress: pct }); },
      undefined,
      undefined,
    )
      .then(() => { if (!cancelled) setGeo(getLoadState()); })
      .catch(() => { if (!cancelled) setGeo(getLoadState()); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (isPinQuery(q)) return;
    if (!q) {
      setHits(geo.status === "ready" ? suggestLocations(10) : curatedSuggestions(8));
      return;
    }
    if (geo.status !== "ready") {
      setHits(curatedSuggestions(8).filter((h) =>
        `${h.title} ${h.district} ${h.state} ${h.pincode}`.toLowerCase().includes(q.toLowerCase()),
      ));
      return;
    }
    const t = setTimeout(() => setHits(searchLocations(q, 12)), 180);
    return () => clearTimeout(t);
  }, [query, geo.status]);

  useEffect(() => {
    const q = query.trim();
    if (!isPinQuery(q)) { setPinBusy(false); setPinError(null); return; }
    let cancelled = false;
    setPinBusy(true); setPinError(null);
    searchPinOnline(q)
      .then((h) => { if (!cancelled) setHits(h); })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHits([]);
        setPinError(err instanceof PinLookupError && err.kind === "busy"
          ? "Location search is temporarily busy. Please try again."
          : "Unable to search this PIN code right now. Please try again.");
      })
      .finally(() => { if (!cancelled) setPinBusy(false); });
    return () => { cancelled = true; };
  }, [query, pinTick]);

  return (
    <div className="animate-fade-in space-y-4">
      <StepHeader
        icon={<MapPin className="h-5 w-5" />}
        title="Where do you want to start your business?"
        hint="Your location shapes local demand, competition, costs and alternatives."
      />

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by PIN code, village, town or district across India…"
          className="w-full rounded-xl border border-border bg-white py-3 pl-10 pr-10 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isPinQuery(query.trim()) ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Database className="h-3 w-3" /> Online PIN lookup
        </p>
      ) : geo.status === "loading" ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin text-primary" /> Loading location index…
        </p>
      ) : geo.status === "error" ? (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-600">
          <AlertCircle className="h-3 w-3" /> Location data unavailable — demo towns are searchable.
        </p>
      ) : null}

      <div className="max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border/50">
        {hits.map((hit) => (
          <button
            key={hit.key}
            onClick={() => { registerHit(hit); ob.setLocation(hit.location); setQuery(hit.title); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-muted/50",
              ob.location?.id === hit.key && "bg-primary/5 border-l-2 border-primary",
            )}
          >
            <MapPin className={cn("h-4 w-4", ob.location?.id === hit.key ? "text-primary" : "text-muted-foreground")} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{hit.title}</p>
              <p className="text-xs text-muted-foreground truncate">{hit.subtitle}</p>
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">{hit.pincode}</span>
            {ob.location?.id === hit.key && <Check className="h-4 w-4 text-primary" />}
          </button>
        ))}
        {hits.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            {pinBusy ? "Searching this PIN code…" : pinError ? pinError : "No locations found. Try another spelling or PIN."}
          </div>
        )}
      </div>

      {ob.location && (
        <div className="rounded-xl border border-border bg-white p-4 animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold">{ob.location.name}</p>
              <p className="text-xs text-muted-foreground">{ob.location.district}, {ob.location.state} · PIN {ob.location.pincode}</p>
            </div>
            <span className="rounded-lg bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
              {ob.location.type}
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs font-semibold mb-2">Market analysis radius</p>
            <div className="flex gap-2">
              {[5, 10, 15, 25].map((r) => (
                <button key={r} onClick={() => ob.setRadius(r)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-xs font-semibold transition-all",
                    ob.radius === r ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/40",
                  )}>
                  {r} km
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Estimated market data will be derived for this radius. Population & household figures are regional estimates, not verified counts.
            </p>
          </div>
        </div>
      )}

      <button onClick={onNext} disabled={!ob.location}
        className={cn(
          "w-full rounded-full px-6 py-3 text-sm font-bold transition-all",
          ob.location ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed",
        )}>
        Continue to Business <ArrowRight className="inline h-4 w-4 ml-1" />
      </button>
    </div>
  );
}

/* ═════════════════ STEP 1 — BUSINESS ═════════════════ */

function StepBusiness({ ob, onNext, onBack }: { ob: ReturnType<typeof useOnboarding>; onNext: () => void; onBack: () => void }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search) return businessCategories.filter((b) => b.id !== "other");
    const q = search.toLowerCase();
    return businessCategories.filter(
      (b) => b.id !== "other" && (b.name.toLowerCase().includes(q) || b.description.toLowerCase().includes(q)),
    );
  }, [search]);

  return (
    <div className="animate-fade-in space-y-4">
      <StepHeader
        icon={<Store className="h-5 w-5" />}
        title="Which business are you planning?"
        hint="Pick a category, then the exact type — it drives every downstream calculation."
      />

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search businesses…"
          className="w-full rounded-xl border border-border bg-white py-3 pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {filtered.map((biz) => (
          <button key={biz.id} onClick={() => ob.setBusiness(biz)}
            className={cn(
              "flex flex-col items-center rounded-xl border p-4 text-center transition-all",
              ob.business?.id === biz.id ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-white hover:border-primary/40",
            )}>
            <span className="text-3xl mb-2">{biz.icon}</span>
            <span className="text-sm font-semibold">{biz.name}</span>
            <span className="text-[10px] text-primary/60 font-medium">{biz.nameHi}</span>
            <span className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{biz.description}</span>
          </button>
        ))}
      </div>

      {ob.business && (
        <div className="rounded-xl border border-border bg-white p-4 animate-fade-in">
          <p className="text-sm font-bold mb-1">
            {getSubCategoryGroupNameLabel(ob.business.id)}
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Exact type changes costs, revenue and feasibility. Select one to continue.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {getSubCategoriesForBusiness(ob.business.id).map((opt) => (
              <button key={opt.id} onClick={() => ob.setSubCategory(opt)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                  ob.subCategory?.id === opt.id ? "border-primary bg-primary/5" : "border-border bg-white hover:border-primary/40",
                )}>
                <span className="text-xl">{opt.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{opt.name}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{opt.description}</p>
                </div>
                {ob.subCategory?.id === opt.id && <Check className="h-4 w-4 text-primary ml-auto" />}
              </button>
            ))}
          </div>

          {ob.subCategory && ob.subCategory.questions.length > 0 && (
            <div className="mt-4 rounded-xl bg-[#F4F8EF] border border-border/60 p-4">
              <p className="text-sm font-bold mb-1">A few quick questions</p>
              <p className="text-xs text-muted-foreground mb-3">These fine-tune the estimate for your plan.</p>
              <div className="space-y-3">
                {ob.subCategory.questions.map((q) => (
                  <div key={q.id}>
                    <p className="text-sm font-semibold mb-2">{q.label}</p>
                    {q.options ? (
                      <div className="flex flex-wrap gap-2">
                        {q.options.map((o) => (
                          <button key={o.value} onClick={() => ob.setBusinessAnswer(q.id, o.value)}
                            className={cn(
                              "rounded-full border px-4 py-1.5 text-xs font-semibold transition-all",
                              ob.businessAnswers[q.id] === o.value
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-white text-muted-foreground hover:border-primary/40",
                            )}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={ob.businessAnswers[q.id] || ""}
                        onChange={(e) => ob.setBusinessAnswer(q.id, e.target.value)}
                        placeholder={q.placeholder || q.label}
                        className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button onClick={onNext} disabled={!ob.business}
          className={cn(
            "flex-1 rounded-full px-6 py-3 text-sm font-bold transition-all",
            ob.business ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed",
          )}>
          Continue <ArrowRight className="inline h-4 w-4 ml-1" />
        </button>
      </div>
    </div>
  );
}

/* ═════════════════ STEP 2 — RESOURCES & LOCAL MARKET ═════════════════ */

function StepResources({ ob, plan, onNext, onBack }: {
  ob: ReturnType<typeof useOnboarding>; plan: AdvisoryPlan; onNext: () => void; onBack: () => void;
}) {
  return (
    <div className="animate-fade-in space-y-4">
      <StepHeader
        icon={<Building2 className="h-5 w-5" />}
        title="What does this business need, and how does your area look?"
        hint="Place requirement, local competition and data confidence — before money is discussed."
      />

      {/* Workspace need */}
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-sm font-bold mb-1">Workspace / land requirement</p>
        <p className="text-xs text-muted-foreground mb-3">
          {ob.subCategory
            ? <>{ob.subCategory.icon} {ob.subCategory.name} typically needs {placeTypeLabel(ob.subCategory.placeType)}.</>
            : "Select a business first — the requirement follows the business type."}
          {" "}If you already own it, no purchase cost is added downstream.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PLACE_STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => ob.setPlaceStatus(opt.value)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                ob.placeStatus === opt.value ? "border-primary bg-primary/5" : "border-border bg-white hover:border-primary/40",
              )}>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-[11px] text-muted-foreground">{opt.hint}</p>
              </div>
              {ob.placeStatus === opt.value && <Check className="h-4 w-4 text-primary ml-auto" />}
            </button>
          ))}
        </div>
        {ob.placeStatus === "rent" && (
          <div className="mt-3">
            <p className="text-xs font-semibold mb-1.5">Expected monthly rent (₹)?</p>
            <input
              type="number"
              min={0}
              value={ob.rentMonthly || ""}
              onChange={(e) => ob.setRentMonthly(Math.max(0, Number(e.target.value) || 0))}
              placeholder="Leave blank to use a typical estimate"
              className="w-full sm:w-64 rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Scale */}
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-sm font-bold mb-1">Starting scale</p>
        <p className="text-xs text-muted-foreground mb-3">Smaller scale = lower investment & risk; larger scale = more capacity and revenue.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SCALE_OPTIONS.map((s) => (
            <button key={s.value} onClick={() => ob.setScaleChoice(s.value)}
              className={cn(
                "rounded-xl border p-3 text-left transition-all",
                ob.scaleChoice === s.value ? "border-primary bg-primary/5" : "border-border bg-white hover:border-primary/40",
              )}>
              <p className="text-sm font-semibold">{s.label}</p>
              <p className="text-[11px] text-muted-foreground">{s.hint}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Local market context */}
      {ob.feasibility && (
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-sm font-bold mb-1">Local market — {ob.location?.name}</p>
          <div className="grid grid-cols-3 gap-2 my-3">
            <MiniStat label="Households" value={ob.feasibility.marketReach.households.toLocaleString("en-IN")} />
            <MiniStat label="Potential customers" value={ob.feasibility.marketReach.potentialCustomers.toLocaleString("en-IN")} />
            <MiniStat label="Nearby villages" value={String(ob.feasibility.marketReach.nearbyVillages)} />
          </div>
          <div className={cn(
            "rounded-lg p-3 mb-2",
            ob.feasibility.competition.density === "low" ? "bg-emerald-50 border border-emerald-200"
              : ob.feasibility.competition.density === "medium" ? "bg-amber-50 border border-amber-200"
              : "bg-red-50 border border-red-200",
          )}>
            <p className="text-xs font-bold capitalize">{ob.feasibility.competition.density} competition</p>
            <p className="text-[11px] text-muted-foreground">{ob.feasibility.competition.summary}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ob.feasibility.competition.competitors.slice(0, 4).map((c, i) => (
              <span key={i} className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                {c.name} · {c.distance}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Live local availability (shops/land listings) is currently unavailable — figures are regional estimates. Verify locally.
          </p>
        </div>
      )}
      {!ob.feasibility && ob.location && ob.business && (
        <button
          onClick={() => {
            const f = generateFeasibility(ob.business!.id, Math.max(1, ob.capital || 50000), ob.location!.id, ob.radius);
            ob.setFeasibility(f);
          }}
          className="w-full rounded-xl border-2 border-dashed border-primary/40 p-4 text-center hover:bg-primary/5 transition-all"
        >
          <Sparkles className="h-5 w-5 text-primary mx-auto mb-1" />
          <span className="text-sm font-semibold text-primary">Run local market analysis for this location</span>
        </button>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button onClick={onNext}
          className="flex-1 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90">
          Continue to Capital & Cost <ArrowRight className="inline h-4 w-4 ml-1" />
        </button>
      </div>
    </div>
  );
}

/* ═════════════════ STEP 3 — CAPITAL & TOTAL COST ═════════════════ */

function StepCapital({ ob, plan, onNext, onBack }: {
  ob: ReturnType<typeof useOnboarding>; plan: AdvisoryPlan; onNext: () => void; onBack: () => void;
}) {
  return (
    <div className="animate-fade-in space-y-4">
      <StepHeader
        icon={<IndianRupee className="h-5 w-5" />}
        title="How much do you have, and what will the business cost?"
        hint="Your capital vs the total project cost — with a full breakdown."
      />

      {/* USER_CAPITAL */}
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-sm font-bold mb-1">Your Capital — money you can invest from your own pocket</p>
        <p className="text-xs text-muted-foreground mb-3">हिंदी: आप अपनी तरफ से कितना पैसा invest कर सकते हैं?</p>
        <CurrencyInput value={ob.capital} onChange={ob.setCapital} />
        <div className="flex gap-2 mt-3">
          {[50000, 100000, 200000, 500000].map((v) => (
            <button key={v} onClick={() => ob.setCapital(v)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-xs font-semibold transition-all",
                ob.capital === v ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/40",
              )}>
              {v >= 100000 ? `₹${v / 100000}L` : `₹${v / 1000}K`}
            </button>
          ))}
        </div>
      </div>

      {/* TARGET_INVESTMENT */}
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-sm font-bold mb-1">Target Investment — how much you're planning to invest</p>
        <p className="text-xs text-muted-foreground mb-3">
          Optional. This is your goal — it can be higher or lower than your capital. It never feeds the funding-gap math; the gap always uses actual available funding.
        </p>
        <CurrencyInput value={ob.targetInvestment} onChange={ob.setTargetInvestment} />
        {ob.targetInvestment > 0 && plan.cost.totalProjectCost > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {ob.targetInvestment >= plan.cost.totalProjectCost
              ? `Your target covers the estimated project cost (${formatIndianCurrency(plan.cost.totalProjectCost)}).`
              : `Your target is ${formatIndianCurrency(plan.cost.totalProjectCost - ob.targetInvestment)} below the estimated project cost — the extra would need funding or a smaller scale.`}
          </p>
        )}
      </div>

      {/* Setup vs working capital + total */}
      <div className="rounded-xl border-2 border-primary/30 bg-primary/[0.03] p-4">
        <p className="text-sm font-bold mb-3">Estimated Total Project Cost</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <Metric label="Initial setup cost" value={formatIndianCurrency(plan.cost.setupCost)} />
          <Metric label={`Initial working capital (~${plan.cost.workingCapitalMonths} mo)`} value={formatIndianCurrency(plan.cost.workingCapital)} />
          <Metric label="TOTAL PROJECT COST" value={formatIndianCurrency(plan.cost.totalProjectCost)} highlight />
        </div>

        {/* Breakdown chart — actual calculated values */}
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={plan.cost.components.filter((c) => c.amount > 0)} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
              <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
              <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
              <RTooltip formatter={(v: number) => formatIndianCurrency(v)} />
              <Bar dataKey="amount" fill="var(--primary)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 space-y-1">
          {plan.cost.components.filter((c) => c.amount > 0).map((c) => (
            <div key={c.id} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{c.label} <span className="text-[9px] uppercase">({c.source.toLowerCase()})</span></span>
              <span className="font-semibold">{formatIndianCurrency(c.amount)}</span>
            </div>
          ))}
        </div>
        {plan.cost.notes.map((n, i) => (
          <p key={i} className="mt-2 text-[11px] text-muted-foreground">• {n}</p>
        ))}
      </div>

      {/* Capital vs project cost */}
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-sm font-bold mb-3">Your Capital vs Total Project Cost</p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[
                { name: "Your Capital", value: plan.funding.totalAvailableFunding },
                { name: "Project Cost", value: plan.cost.totalProjectCost },
              ]}
              layout="vertical"
            >
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <RTooltip formatter={(v: number) => formatIndianCurrency(v)} />
              <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Coverage</span>
          <span className="font-bold">
            {plan.cost.totalProjectCost > 0 ? Math.round((plan.funding.totalAvailableFunding / plan.cost.totalProjectCost) * 100) : 100}%
            <span className="text-xs text-muted-foreground font-medium"> of estimated project cost</span>
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button onClick={onNext} disabled={ob.capital <= 0}
          className={cn(
            "flex-1 rounded-full px-6 py-3 text-sm font-bold transition-all",
            ob.capital > 0 ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed",
          )}>
          Continue to Funding <ArrowRight className="inline h-4 w-4 ml-1" />
        </button>
      </div>
    </div>
  );
}

/* ═════════════════ STEP 4 — FUNDING & LOAN ═════════════════ */

function StepFunding({
  ob, plan, schemeResult, sim, loanSim, setLoanSim, loanSimDefaults, onNext, onBack,
}: {
  ob: ReturnType<typeof useOnboarding>; plan: AdvisoryPlan;
  schemeResult: ReturnType<typeof matchSchemesForProfileSource> | null;
  sim: ReturnType<typeof simulateEmi> | null;
  loanSim: { amount: number; rate: number; tenure: number } | null;
  setLoanSim: (v: { amount: number; rate: number; tenure: number } | null) => void;
  loanSimDefaults: { amount: number; rate: number; tenure: number };
  onNext: () => void; onBack: () => void;
}) {
  return (
    <div className="animate-fade-in space-y-4">
      <StepHeader
        icon={<Landmark className="h-5 w-5" />}
        title="How much do you need to arrange or borrow?"
        hint="Available funding → funding gap → required vs recommended loan → EMI → repayment pressure."
      />

      {/* Other funding */}
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-sm font-bold mb-1">Other funding — family, partner, grants, savings</p>
        <p className="text-xs text-muted-foreground mb-3">Any legitimate money beyond your own capital. Reduces the funding gap directly.</p>
        <CurrencyInput value={ob.otherFunding} onChange={ob.setOtherFunding} />
      </div>

      {/* Funding chain */}
      <div className="rounded-xl border-2 border-primary/30 bg-primary/[0.03] p-4">
        <p className="text-sm font-bold mb-3">Funding picture</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          <Metric label="Total project cost" value={formatIndianCurrency(plan.funding.totalProjectCost)} />
          <Metric label="Your capital" value={formatIndianCurrency(plan.funding.userCapital)} />
          <Metric label="Other funding" value={formatIndianCurrency(plan.funding.otherFunding)} />
          <Metric label="Total available funding" value={formatIndianCurrency(plan.funding.totalAvailableFunding)} />
          <Metric label="FUNDING GAP" value={formatIndianCurrency(plan.funding.fundingGap)} highlight />
          <Metric label="Estimated loan requirement" value={formatIndianCurrency(plan.funding.loanRequired)} highlight />
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[
                { name: "Available", value: plan.funding.totalAvailableFunding },
                { name: "Gap", value: plan.funding.fundingGap },
                { name: "Total cost", value: plan.cost.totalProjectCost },
              ]}
              layout="vertical"
            >
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <RTooltip formatter={(v: number) => formatIndianCurrency(v)} />
              <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Required vs recommended */}
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-sm font-bold mb-1">Required loan vs recommended borrowing</p>
        <p className="text-xs text-muted-foreground mb-3">{plan.funding.recommendationNote}</p>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Required (fills the whole gap)" value={formatIndianCurrency(plan.funding.loanRequired)} />
          <Metric label="Recommended (keeps ~1 month ops buffer)" value={formatIndianCurrency(plan.funding.recommendedLoan)} highlight />
        </div>
      </div>

      {/* Loan simulator */}
      {plan.funding.loanRequired > 0 && (
        <div className="rounded-xl border border-border bg-white p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-bold">Loan simulator — all values are estimates</p>
            {loanSim && (
              <button onClick={() => setLoanSim(null)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <RotateCcw className="h-3 w-3" /> Reset to estimate
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Try different amounts, interest rates and tenures. Nothing is guaranteed — banks decide final terms.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Loan amount (₹)</label>
              <input type="number" min={0} value={loanSim?.amount ?? loanSimDefaults.amount}
                onChange={(e) => setLoanSim({
                  amount: Math.max(0, Number(e.target.value) || 0),
                  rate: loanSim?.rate ?? loanSimDefaults.rate,
                  tenure: loanSim?.tenure ?? loanSimDefaults.tenure,
                })}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Interest rate (%/yr)</label>
              <input type="number" min={0} max={30} step={0.5} value={loanSim?.rate ?? loanSimDefaults.rate}
                onChange={(e) => setLoanSim({
                  amount: loanSim?.amount ?? loanSimDefaults.amount,
                  rate: Math.max(0, Number(e.target.value) || 0),
                  tenure: loanSim?.tenure ?? loanSimDefaults.tenure,
                })}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Tenure (years)</label>
              <input type="number" min={1} max={15} value={loanSim?.tenure ?? loanSimDefaults.tenure}
                onChange={(e) => setLoanSim({
                  amount: loanSim?.amount ?? loanSimDefaults.amount,
                  rate: loanSim?.rate ?? loanSimDefaults.rate,
                  tenure: Math.max(1, Number(e.target.value) || 1),
                })}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
            </div>
          </div>
          {sim && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Metric label="Estimated EMI" value={formatIndianCurrency(sim.emi)} highlight />
              <Metric label="Total interest" value={formatIndianCurrency(sim.totalInterest)} />
              <Metric label="Total repayment" value={formatIndianCurrency(sim.totalRepayment)} />
            </div>
          )}
        </div>
      )}

      {/* EMI stress test */}
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-sm font-bold mb-1">EMI stress test</p>
        <div className={cn(
          "rounded-lg p-3 mb-2",
          plan.emiStress.level === "low" ? "bg-emerald-50 border border-emerald-200"
            : plan.emiStress.level === "medium" ? "bg-amber-50 border border-amber-200"
            : "bg-red-50 border border-red-200",
        )}>
          <p className="text-sm font-bold">{stressIcon(plan.emiStress.level)} {plan.emiStress.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{plan.emiStress.explanation}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Operating profit" value={formatIndianCurrency(plan.emiStress.operatingProfit)} />
          <Metric label="Estimated EMI" value={formatIndianCurrency(plan.emiStress.emi)} />
          <Metric label="EMI / profit" value={plan.emiStress.ratio !== null ? `${Math.round(plan.emiStress.ratio * 100)}%` : "—"} />
        </div>
      </div>

      {/* Scheme matching */}
      {schemeResult && schemeResult.matches.length > 0 && (
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-sm font-bold mb-1">Financing options that may be relevant</p>
          <p className="text-xs text-muted-foreground mb-3">
            Preliminary matches based on your business, location and funding need. Eligibility is never guaranteed — verify with the official source.
          </p>
          <div className="space-y-2">
            {schemeResult.matches.slice(0, 3).map((m) => (
              <div key={m.scheme.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold">{m.scheme.name}</p>
                  <span className={cn(
                    "rounded-full border px-2 py-0.5 text-[9px] font-bold",
                    m.level === "high" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : m.level === "possible" ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-muted text-muted-foreground border-border",
                  )}>
                    {m.level === "high" ? "HIGH MATCH" : m.level === "possible" ? "POSSIBLE" : "LOW"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{m.scheme.shortDescription}</p>
                {m.reasons[0] && <p className="text-[11px] text-emerald-700 mt-1">✓ {m.reasons[0].text}</p>}
                {m.gaps[0] && <p className="text-[11px] text-amber-700 mt-0.5">≈ {m.gaps[0].text}</p>}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">{schemeResult.disclaimer}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button onClick={onNext}
          className="flex-1 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90">
          Continue to Profitability <ArrowRight className="inline h-4 w-4 ml-1" />
        </button>
      </div>
    </div>
  );
}

/* ═════════════════ STEP 5 — PROFITABILITY & PROJECTIONS ═════════════════ */

function StepProfitability({ ob, plan, onNext, onBack }: {
  ob: ReturnType<typeof useOnboarding>; plan: AdvisoryPlan; onNext: () => void; onBack: () => void;
}) {
  const projectionData = plan.projection.map((p) => ({
    label: p.label,
    Revenue: p.revenue,
    Expenses: p.expenses,
    Profit: p.profit,
  }));

  return (
    <div className="animate-fade-in space-y-4">
      <StepHeader
        icon={<TrendingUp className="h-5 w-5" />}
        title="What can you earn, spend, and keep?"
        hint="Revenue → expenses → operating profit → EMI → cash after EMI → 12-month projection → break-even."
      />

      {/* Revenue & expenses */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Monthly revenue (est.)" value={formatIndianCurrency(plan.operating.monthlyRevenue)} />
        <Metric label="Fixed expenses" value={formatIndianCurrency(plan.operating.monthlyFixedCosts)} />
        <Metric label="Variable expenses" value={formatIndianCurrency(plan.operating.monthlyVariableCosts)} />
        <Metric label="Total expenses" value={formatIndianCurrency(plan.operating.monthlyExpenses)} />
      </div>

      {/* Profit chain */}
      <div className="rounded-xl border-2 border-primary/30 bg-primary/[0.03] p-4">
        <p className="text-sm font-bold mb-3">Monthly profit chain</p>
        <div className="space-y-2">
          <FlowRow label="Monthly revenue" value={formatIndianCurrency(plan.operating.monthlyRevenue)} tone="pos" />
          <FlowRow label="− Operating expenses" value={formatIndianCurrency(plan.operating.monthlyExpenses)} tone="neg" />
          <FlowRow label="= Operating profit" value={formatIndianCurrency(plan.operating.operatingProfit)} tone="neutral" bold />
          <FlowRow label="− Estimated EMI" value={formatIndianCurrency(plan.emiStress.emi)} tone="neg" />
          <FlowRow label="= Cash available after EMI" value={formatIndianCurrency(plan.profitAfterEmi)} tone={plan.profitAfterEmi >= 0 ? "pos" : "neg"} bold />
        </div>
        {plan.cashFlowWarning && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-xs font-bold text-red-700">⚠️ Cash-flow warning</p>
            <p className="text-xs text-red-600 mt-0.5">{plan.cashFlowWarning}</p>
          </div>
        )}
      </div>

      {/* 12-month projection chart */}
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-sm font-bold mb-1">12-month projection</p>
        <p className="text-xs text-muted-foreground mb-3">
          Revenue ramps up over ~{plan.projection.length > 0 ? plan.projection[0].label : "M1"}–M{plan.projection.length} as customers build. All values are estimates.
        </p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projectionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
              <YAxis tickFormatter={compact} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
              <RTooltip formatter={(v: number) => formatIndianCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Revenue" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Expenses" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Profit" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Break-even */}
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-sm font-bold mb-1">Break-even</p>
        <p className="text-xs text-muted-foreground mb-3">{plan.breakEven.explanation}</p>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Operating break-even" value={plan.breakEven.operatingBreakEvenMonth ? `~Month ${plan.breakEven.operatingBreakEvenMonth}` : "12+ months"} />
          <Metric label="Break-even sales / month" value={formatIndianCurrency(plan.breakEven.operatingBreakEvenSales)} />
          <Metric label="Investment payback" value={plan.breakEven.investmentPaybackMonths ? `~${plan.breakEven.investmentPaybackMonths} months` : "3+ years"} highlight />
        </div>
      </div>

      {/* Scenarios */}
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-sm font-bold mb-1">Scenario analysis</p>
        <p className="text-xs text-muted-foreground mb-3">
          The optimistic case is possible, not guaranteed. Plan around the conservative case.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {plan.scenarios.map((s) => (
            <div key={s.id} className={cn(
              "rounded-xl border p-3",
              s.id === "conservative" ? "border-amber-200 bg-amber-50/50"
                : s.id === "expected" ? "border-primary/30 bg-primary/[0.03]"
                : "border-emerald-200 bg-emerald-50/50",
            )}>
              <p className="text-xs font-bold">{s.label} <span className="text-muted-foreground font-medium">({s.labelHi})</span></p>
              <div className="mt-2 space-y-1 text-[11px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span><span className="font-semibold">{formatIndianCurrency(s.monthlyRevenue)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Expenses</span><span className="font-semibold">{formatIndianCurrency(s.monthlyExpenses)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Profit</span><span className={cn("font-semibold", s.monthlyProfit >= 0 ? "text-emerald-600" : "text-red-600")}>{formatIndianCurrency(s.monthlyProfit)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">After EMI</span><span className={cn("font-semibold", s.profitAfterEmi >= 0 ? "text-emerald-600" : "text-red-600")}>{formatIndianCurrency(s.profitAfterEmi)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Payback</span><span className="font-semibold">{s.paybackMonths ? `~${s.paybackMonths} mo` : "3+ yrs"}</span></div>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">{s.note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* What-if simulator (reversible) */}
      <WhatIfCard plan={plan} ob={ob} />

      <div className="flex gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button onClick={onNext}
          className="flex-1 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90">
          Continue to Risk & Alternatives <ArrowRight className="inline h-4 w-4 ml-1" />
        </button>
      </div>
    </div>
  );
}

/* ═════════════════ STEP 6 — RISK, FEASIBILITY & ALTERNATIVES ═════════════════ */

function StepRisk({ ob, plan, onNext, onBack }: {
  ob: ReturnType<typeof useOnboarding>; plan: AdvisoryPlan; onNext: () => void; onBack: () => void;
}) {
  const comparison = useMemo(() => {
    const alts = ob.feasibility?.alternatives ?? [];
    const altRows = alts.map((a) => ({
      name: `${a.icon} ${a.businessName}`,
      investment: a.requiredInvestment,
      fundingGap: a.fundingGap,
      loan: a.fundingGap,
      emi: emiFor(a.fundingGap),
      revenue: a.monthlyRevenue,
      profit: a.monthlyProfit,
      afterEmi: a.monthlyProfit - emiFor(a.fundingGap),
      payback: a.breakEvenMonth,
      risk: a.risk,
      feasibility: a.feasibilityScore,
      isCurrent: false,
    }));
    const current = {
      name: `${ob.business?.icon ?? ""} ${ob.business?.name ?? "Selected"}`,
      investment: plan.cost.totalProjectCost,
      fundingGap: plan.funding.fundingGap,
      loan: plan.funding.loanRequired,
      emi: plan.emiStress.emi,
      revenue: plan.operating.monthlyRevenue,
      profit: plan.operating.operatingProfit,
      afterEmi: plan.profitAfterEmi,
      payback: plan.breakEven.investmentPaybackMonths,
      risk: plan.risk.level,
      feasibility: plan.feasibility.score,
      isCurrent: true,
    };
    return [current, ...altRows];
  }, [ob.feasibility, ob.business, plan]);

  const feasibilityData = plan.feasibility.factors.map((f) => ({ name: f.label, score: f.score }));

  return (
    <div className="animate-fade-in space-y-4">
      <StepHeader
        icon={<ShieldAlert className="h-5 w-5" />}
        title="How risky is it — and is anything better?"
        hint="Risk with reasons, a 0–100 feasibility score with its drivers, and alternatives compared on the same metrics."
      />

      {/* Risk */}
      <div className="rounded-xl border border-border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold">Risk assessment</p>
          <span className={cn(
            "rounded-full px-3 py-1 text-xs font-bold",
            plan.risk.level === "low" ? "bg-emerald-100 text-emerald-700"
              : plan.risk.level === "medium" ? "bg-amber-100 text-amber-700"
              : "bg-red-100 text-red-700",
          )}>{plan.risk.label}</span>
        </div>
        {plan.risk.reasons.positive.length > 0 && (
          <div className="mb-2">
            {plan.risk.reasons.positive.map((r, i) => (
              <p key={i} className="text-xs text-emerald-700">✓ {r}</p>
            ))}
          </div>
        )}
        {plan.risk.reasons.concerns.map((r, i) => (
          <p key={i} className="text-xs text-amber-700">⚠ {r}</p>
        ))}
      </div>

      {/* Feasibility */}
      <div className="rounded-xl border border-border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold">Feasibility score</p>
          <span className="text-2xl font-bold text-primary">{plan.feasibility.score}<span className="text-sm text-muted-foreground font-medium">/100</span></span>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={feasibilityData} layout="vertical" margin={{ left: 8, right: 24 }}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
              <RTooltip formatter={(v: number) => `${v}/100`} />
              <Bar dataKey="score" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 space-y-1.5">
          {plan.feasibility.factors.map((f) => (
            <div key={f.id} className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{f.label}</span> ({Math.round(f.weight * 100)}% weight): {f.detail}
            </div>
          ))}
        </div>
      </div>

      {/* Data confidence */}
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-sm font-bold mb-2">Data confidence</p>
        <div className="space-y-2">
          {plan.confidence.map((c) => (
            <div key={c.label} className="flex items-start gap-2">
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[9px] font-bold flex-shrink-0 mt-0.5",
                c.level === "high" ? "bg-emerald-100 text-emerald-700"
                  : c.level === "medium" ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700",
              )}>{c.level.toUpperCase()}</span>
              <p className="text-[11px] text-muted-foreground"><span className="font-semibold text-foreground">{c.label}</span> — {c.why}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison */}
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-sm font-bold mb-1">Selected business vs alternatives</p>
        <p className="text-xs text-muted-foreground mb-3">Same metrics, same assumptions — ranked by feasibility.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[560px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-2 font-semibold">Business</th>
                <th className="py-1.5 px-2 font-semibold text-right">Cost</th>
                <th className="py-1.5 px-2 font-semibold text-right">Gap</th>
                <th className="py-1.5 px-2 font-semibold text-right">EMI</th>
                <th className="py-1.5 px-2 font-semibold text-right">Profit</th>
                <th className="py-1.5 px-2 font-semibold text-right">After EMI</th>
                <th className="py-1.5 px-2 font-semibold text-right">Risk</th>
                <th className="py-1.5 pl-2 font-semibold text-right">Feas.</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.name} className={cn("border-b border-border/40", row.isCurrent && "bg-primary/5 font-semibold")}>
                  <td className="py-2 pr-2">{row.name}{row.isCurrent && <span className="text-[9px] text-primary ml-1">SELECTED</span>}</td>
                  <td className="py-2 px-2 text-right">{formatIndianCurrency(row.investment)}</td>
                  <td className="py-2 px-2 text-right">{formatIndianCurrency(row.fundingGap)}</td>
                  <td className="py-2 px-2 text-right">{row.emi > 0 ? formatIndianCurrency(row.emi) : "—"}</td>
                  <td className="py-2 px-2 text-right">{formatIndianCurrency(row.profit)}</td>
                  <td className={cn("py-2 px-2 text-right", row.afterEmi < 0 && "text-red-600")}>{formatIndianCurrency(row.afterEmi)}</td>
                  <td className="py-2 px-2 text-right capitalize">{row.risk}</td>
                  <td className="py-2 pl-2 text-right font-bold">{row.feasibility}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button onClick={onNext}
          className="flex-1 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90">
          See Final Recommendation <ArrowRight className="inline h-4 w-4 ml-1" />
        </button>
      </div>
    </div>
  );
}

/* ═════════════════ STEP 7 — FINAL RECOMMENDATION ═════════════════ */

function StepRecommendation({ ob, plan, schemeResult, onRestart }: {
  ob: ReturnType<typeof useOnboarding>; plan: AdvisoryPlan;
  schemeResult: ReturnType<typeof matchSchemesForProfileSource> | null;
  onRestart: () => void;
}) {
  const verdict = plan.feasibility.score >= 70 ? "good" : plan.feasibility.score >= 50 ? "caution" : "rethink";
  const statusText = verdict === "good" ? "RECOMMENDED" : verdict === "caution" ? "PROCEED WITH CAUTION" : "NOT RECOMMENDED UNDER CURRENT ASSUMPTIONS";
  const scaleLabel = SCALE_OPTIONS.find((s) => s.value === ob.scaleChoice)?.label ?? "Recommended Scale";

  const whyBusiness = useMemo(() => {
    const parts: string[] = [];
    const coverage = plan.cost.totalProjectCost > 0
      ? Math.round((plan.funding.totalAvailableFunding / plan.cost.totalProjectCost) * 100)
      : 100;
    if (coverage >= 100) parts.push(`your available funding of ${formatIndianCurrency(plan.funding.totalAvailableFunding)} covers the full estimated project cost of ${formatIndianCurrency(plan.cost.totalProjectCost)}`);
    else parts.push(`your available funding covers about ${coverage}% of the estimated project cost of ${formatIndianCurrency(plan.cost.totalProjectCost)}`);
    if (plan.funding.loanRequired > 0) parts.push(`a loan of about ${formatIndianCurrency(plan.funding.loanRequired)} would be needed, with an estimated EMI of ${formatIndianCurrency(plan.emiStress.emi)}`);
    else parts.push("no external loan is needed under current assumptions");
    parts.push(`estimated monthly operating profit is ${formatIndianCurrency(plan.operating.operatingProfit)} with cash after EMI of ${formatIndianCurrency(plan.profitAfterEmi)}`);
    if (ob.feasibility) parts.push(`local competition appears ${ob.feasibility.competition.density}`);
    parts.push(`estimated payback is ${plan.breakEven.investmentPaybackMonths ? `about ${plan.breakEven.investmentPaybackMonths} months` : "longer than 3 years"}`);
    return `This appears suitable because ${parts.join(", ")}, under the current assumptions.`;
  }, [plan, ob.feasibility]);

  const whyNotOthers = useMemo(() => {
    const alts = (ob.feasibility?.alternatives ?? []).slice(0, 2);
    return alts.map((a) => {
      const reasons: string[] = [];
      if (a.fundingGap > plan.funding.fundingGap) reasons.push(`needs ${formatIndianCurrency(a.fundingGap - plan.funding.fundingGap)} more external funding`);
      if (a.feasibilityScore < plan.feasibility.score) reasons.push(`scores lower on feasibility (${a.feasibilityScore} vs ${plan.feasibility.score})`);
      if (a.risk !== "low" && plan.risk.level === "low") reasons.push("carries more risk under the same assumptions");
      if (reasons.length === 0) reasons.push("is comparable but didn't rank as high overall for your capital and location");
      return `${a.icon} ${a.businessName}: ${reasons.join("; ")}.`;
    });
  }, [ob.feasibility, plan]);

  const mainRisks = plan.risk.reasons.concerns.slice(0, 3);

  const checklist = buildChecklist(plan, ob);

  const nextFive = [
    `Verify the local rent/purchase price for ${ob.subCategory?.placeType === "land" ? "land" : "a shop/workspace"} in ${ob.location?.name ?? "your area"}.`,
    `Obtain 2–3 quotations for the main equipment/inventory items (estimated at ${formatIndianCurrency(plan.cost.setupCost)} setup).`,
    "Confirm local selling prices with 3–5 actual customers or nearby shops.",
    plan.funding.loanRequired > 0
      ? `Check your loan eligibility for about ${formatIndianCurrency(plan.funding.loanRequired)} and compare offers from 2 banks.`
      : "Confirm your funding sources and keep an emergency buffer before starting.",
    `Start at the ${scaleLabel.toLowerCase()} and review after 3 months.`,
  ];

  const navigate = useNavigate();

  return (
    <div className="animate-fade-in space-y-4">
      {/* Final decision */}
      <div className={cn(
        "rounded-2xl border-2 p-5",
        verdict === "good" ? "border-emerald-300 bg-emerald-50"
          : verdict === "caution" ? "border-amber-300 bg-amber-50"
          : "border-red-300 bg-red-50",
      )}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">GramUdaan Recommendation</p>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">{getVerdictIcon(verdict)}</span>
          <h2 className={cn("text-xl sm:text-2xl font-bold", getVerdictColor(verdict))}>{statusText}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Feasibility {plan.feasibility.score}/100 · {plan.risk.label.toLowerCase()} · payback ~{plan.breakEven.investmentPaybackMonths ?? "36+"} months
        </p>
      </div>

      {/* Best fit summary */}
      <div className="rounded-2xl border border-border bg-white p-5">
        <p className="text-sm font-bold mb-3">Best fit for your situation</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Metric label="Business" value={`${ob.business?.icon ?? ""} ${ob.business?.name ?? "—"}`} />
          <Metric label="Scale" value={scaleLabel} />
          <Metric label="Location" value={ob.location?.name ?? "—"} />
          <Metric label="Your capital" value={formatIndianCurrency(plan.funding.userCapital)} />
          <Metric label="Total project cost" value={formatIndianCurrency(plan.cost.totalProjectCost)} />
          <Metric label="Funding gap" value={formatIndianCurrency(plan.funding.fundingGap)} />
          <Metric label="Estimated loan" value={formatIndianCurrency(plan.funding.loanRequired)} />
          <Metric label="Estimated EMI" value={formatIndianCurrency(plan.emiStress.emi)} />
          <Metric label="Monthly revenue" value={formatIndianCurrency(plan.operating.monthlyRevenue)} />
          <Metric label="Monthly expenses" value={formatIndianCurrency(plan.operating.monthlyExpenses)} />
          <Metric label="Operating profit" value={formatIndianCurrency(plan.operating.operatingProfit)} />
          <Metric label="Cash after EMI" value={formatIndianCurrency(plan.profitAfterEmi)} />
          <Metric label="Break-even" value={plan.breakEven.investmentPaybackMonths ? `${plan.breakEven.investmentPaybackMonths} months` : "3+ years"} />
          <Metric label="Risk" value={plan.risk.label} />
          <Metric label="Feasibility" value={`${plan.feasibility.score}/100`} highlight />
        </div>
      </div>

      {/* Why this business / why not others */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-sm font-bold mb-1">Why this business?</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{whyBusiness}</p>
        </div>
        {whyNotOthers.length > 0 && (
          <div className="rounded-2xl border border-border bg-white p-4">
            <p className="text-sm font-bold mb-1">Why not the other options?</p>
            <ul className="space-y-1.5">
              {whyNotOthers.map((t, i) => (
                <li key={i} className="text-xs text-muted-foreground">• {t}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Main risks */}
      {mainRisks.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
          <p className="text-sm font-bold mb-1">Main risks</p>
          <ul className="space-y-1">
            {mainRisks.map((r, i) => (
              <li key={i} className="text-xs text-amber-700">⚠ {r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Before you start */}
      <div className="rounded-2xl border border-border bg-white p-5">
        <p className="text-sm font-bold mb-1">Before you start — verify each item</p>
        <p className="text-xs text-muted-foreground mb-3">Nothing here is confirmed. These are the checks that protect your money.</p>
        <div className="space-y-1.5">
          {checklist.map((item, i) => (
            <label key={i} className="flex items-start gap-2.5 text-xs cursor-pointer group">
              <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-primary" />
              <span className="text-muted-foreground group-hover:text-foreground">{item}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Next 5 steps */}
      <div className="rounded-2xl border border-border bg-white p-5">
        <p className="text-sm font-bold mb-1">Your next 5 steps</p>
        <ol className="space-y-2 mt-2">
          {nextFive.map((s, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
              <span className="text-muted-foreground">{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Final dashboard actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={() => navigate("/dashboard")}
          className="flex-1 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90">
          Open Full Dashboard
        </button>
        <button onClick={() => navigate("/onboarding")} className="flex-1 rounded-full border border-border px-6 py-3 text-sm font-semibold hover:bg-muted">
          Edit Plan
        </button>
        <button onClick={onRestart} className="rounded-full border border-border px-6 py-3 text-sm font-semibold hover:bg-muted">
          Start Over
        </button>
      </div>
    </div>
  );
}

/* ═════════════════ WHAT-IF (reversible) ═════════════════ */

function WhatIfCard({ plan, ob }: { plan: AdvisoryPlan; ob: ReturnType<typeof useOnboarding> }) {
  const [draft, setDraft] = useState<{ capital: number; otherFunding: number; revenueFactor: number; expenseFactor: number } | null>(null);

  const baseline = {
    capital: ob.capital,
    otherFunding: ob.otherFunding,
    revenueFactor: 1,
    expenseFactor: 1,
  };

  const whatIfPlan = useMemo(() => {
    if (!draft) return null;
    return buildAdvisoryPlan({
      businessId: ob.business?.id ?? "other",
      subCategoryId: ob.subCategory?.id ?? null,
      placeStatus: ob.placeStatus,
      rentMonthly: ob.rentMonthly,
      scaleChoice: ob.scaleChoice,
      userCapital: draft.capital,
      otherFunding: draft.otherFunding,
      competitionDensity: ob.feasibility?.competition?.density,
    });
  }, [draft, ob.business?.id, ob.subCategory?.id, ob.placeStatus, ob.rentMonthly, ob.scaleChoice, ob.feasibility]);

  return (
    <div className="rounded-xl border-2 border-dashed border-primary/40 bg-white p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-bold">What if…?</p>
        {draft && (
          <button onClick={() => setDraft(null)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            <RotateCcw className="h-3 w-3" /> Back to my plan
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Try changes without touching your saved plan — press "Back to my plan" to revert.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Own investment (₹)</label>
          <input type="number" min={0} value={draft?.capital ?? baseline.capital}
            onChange={(e) => setDraft({ capital: Math.max(0, Number(e.target.value) || 0), otherFunding: draft?.otherFunding ?? baseline.otherFunding, revenueFactor: 1, expenseFactor: 1 })}
            className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Other funding (₹)</label>
          <input type="number" min={0} value={draft?.otherFunding ?? baseline.otherFunding}
            onChange={(e) => setDraft({ capital: draft?.capital ?? baseline.capital, otherFunding: Math.max(0, Number(e.target.value) || 0), revenueFactor: 1, expenseFactor: 1 })}
            className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Revenue change (%)</label>
          <input type="number" min={-50} max={50} value={draft ? Math.round((draft.revenueFactor - 1) * 100) : 0}
            onChange={(e) => setDraft({ capital: draft?.capital ?? baseline.capital, otherFunding: draft?.otherFunding ?? baseline.otherFunding, revenueFactor: 1 + (Number(e.target.value) || 0) / 100, expenseFactor: 1 })}
            className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        </div>
      </div>

      {whatIfPlan && draft && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Delta label="Funding gap" now={whatIfPlan.funding.fundingGap} base={plan.funding.fundingGap} invert />
          <Delta label="EMI" now={whatIfPlan.emiStress.emi} base={plan.emiStress.emi} invert />
          <Delta label="Profit after EMI" now={whatIfPlan.profitAfterEmi} base={plan.profitAfterEmi} />
          <Delta label="Feasibility" now={whatIfPlan.feasibility.score} base={plan.feasibility.score} suffix="/100" />
        </div>
      )}
      {!draft && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Example: type +50000 in "Own investment" to see "If I invest ₹50,000 more, what changes?"
        </p>
      )}
    </div>
  );
}

function Delta({ label, now, base, suffix = "", invert }: {
  label: string; now: number; base: number; suffix?: string; invert?: boolean;
}) {
  const diff = now - base;
  const good = invert ? diff < 0 : diff > 0;
  const neutral = diff === 0;
  return (
    <div className="rounded-lg border border-border bg-white p-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{typeof now === "number" && label !== "Feasibility" ? formatIndianCurrency(now) : `${now}${suffix}`}</p>
      <p className={cn(
        "text-[10px] font-semibold",
        neutral ? "text-muted-foreground" : good ? "text-emerald-600" : "text-red-600",
      )}>
        {diff === 0 ? "unchanged" : `${diff > 0 ? "+" : "−"}${formatIndianCurrency(Math.abs(diff))}`}
      </p>
    </div>
  );
}

/* ═════════════════ Shared small components ═════════════════ */

function StepHeader({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="text-center mb-2">
      <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-2">{icon}</div>
      <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground max-w-xl mx-auto">{hint}</p>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl p-3 text-center", highlight ? "bg-primary text-primary-foreground" : "bg-muted/50")}>
      <p className={cn("text-[9px] font-semibold uppercase tracking-wider", highlight ? "text-primary-foreground/80" : "text-muted-foreground")}>{label}</p>
      <p className={cn("text-sm font-bold mt-0.5 break-words")}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2 text-center">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

function FlowRow({ label, value, tone, bold }: {
  label: string; value: string; tone: "pos" | "neg" | "neutral"; bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={cn("text-muted-foreground", bold && "font-semibold text-foreground")}>{label}</span>
      <span className={cn(
        "font-semibold",
        tone === "pos" && "text-emerald-600",
        tone === "neg" && "text-red-600",
        bold && "text-base",
      )}>{value}</span>
    </div>
  );
}

function stressIcon(level: "low" | "medium" | "high"): string {
  return level === "low" ? "🟢" : level === "medium" ? "🟡" : "🔴";
}

function placeTypeLabel(t: string): string {
  return t === "land" ? "land/shed" : t === "workspace" ? "a workspace/shed" : t === "shed" ? "a shed" : t === "none" ? "no separate place" : "a shop";
}

function getSubCategoryGroupNameLabel(businessId: string): string {
  const names: Record<string, string> = {
    dairy: "What exactly within Dairy?",
    grocery: "What type of store?",
    poultry: "What type of poultry?",
    "poultry-feed": "What type of feed business?",
    clothing: "What type of clothing business?",
    "mobile-repair": "What type of mobile business?",
    "food-processing": "What type of processing?",
    "agri-inputs": "What type of inputs store?",
    retail: "What type of retail store?",
    services: "What type of service?",
    manufacturing: "What type of manufacturing?",
    other: "Tell us about your idea",
  };
  return names[businessId] ?? "Choose a specific business type";
}

function buildChecklist(plan: AdvisoryPlan, ob: ReturnType<typeof useOnboarding>): string[] {
  const items = [
    "Confirm shop/land availability and price locally",
    "Get equipment quotations (2–3 sources)",
    "Verify supplier prices for inventory",
    "Verify local selling prices with real customers",
    "Check competitors in person within your radius",
    "Check licences required for this business",
    "Verify loan eligibility with 2 banks/lenders",
    "Verify relevant government schemes officially",
    "Arrange working capital for the first 2–3 months",
    "Maintain an emergency buffer",
  ];
  if (plan.funding.loanRequired > 0) items.push(`Prepare documents for a loan of about ${formatIndianCurrency(plan.funding.loanRequired)}`);
  if (ob.placeStatus === "rent") items.push("Negotiate and document the rent agreement");
  return items;
}

function emiFor(loanAmount: number): number {
  if (loanAmount <= 0) return 0;
  const rate = loanAmount <= 125000 ? 6.5 : 8;
  const years = loanAmount <= 125000 ? 3 : 5;
  const n = years * 12;
  const r = rate / 12 / 100;
  return Math.round((loanAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
}

function compact(v: number): string {
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${v}`;
}
