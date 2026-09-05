import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { ProgressStepper } from "@/components/ui/ProgressStepper";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { useOnboarding } from "@/lib/onboarding-context";
import { generateFeasibility } from "@/data/feasibility";
import { buildCostBreakdown, buildInvestmentTiers, type CostBreakdown, type CostPriority } from "@/engine/costModel";
import { allocateCapital, capitalFitResult, recommendScale, suggestSurplusUse } from "@/engine/capitalAllocation";
import type { Location } from "@/data/locations";
import { businessCategories, type BusinessCategory } from "@/data/businesses";
import { formatIndianCurrency } from "@/data/assessment";
import { getRecommendations } from "@/data/recommendations";
import IndiaMap from "@/components/IndiaMap";
import {
  getSubCategoriesForBusiness, getSubCategory,
  PLACE_STATUS_OPTIONS, SCALE_OPTIONS, SCALE_FACTORS,
  type BusinessSubCategory, type PlaceStatus, type ScaleChoice,
} from "@/data/businessConfig";
import {
  initLocationService, searchLocations, searchPinOnline, suggestLocations, curatedSuggestions, nearestLocations, registerHit,
  getDetailState, type DetailLoadState,
  getLoadState, type LocationHit, type GeoLoadState,
} from "@/services/geo/locationService";
import { isPinQuery, PinLookupError } from "@/services/geo/pinApi";
import { loadDistrictBoundaries, resolveDistrict, adjacentDistricts, type DistrictFeature } from "@/services/geo/boundaries";
import {
  MapPin, Search, Store, Lightbulb, IndianRupee,
  CheckCircle2, ArrowLeft, ArrowRight, Edit3, Check,
  TrendingUp, X, Loader2, Sparkles, Navigation, Database, AlertCircle, RotateCcw,
  Home, Building2, Hammer, Warehouse, KeyRound, HelpCircle, SlidersHorizontal, ChevronDown,
  Wallet, ShieldCheck, BarChart3, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 0, label: "Location" },
  { id: 1, label: "Business" },
  { id: 2, label: "Business Type" },
  { id: 3, label: "Place" },
  { id: 4, label: "Capital" },
  { id: 5, label: "Review" },
];

// Quick-pick contribution chips shown on the Capital step.
const QUICK_AMOUNTS = [
  { label: "₹50K", value: 50000 },
  { label: "₹1L", value: 100000 },
  { label: "₹2L", value: 200000 },
  { label: "₹5L", value: 500000 },
];

const RADIUS_OPTIONS = [5, 10, 15, 25];

function OnboardingInner() {
  const [step, setStep] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionText, setTransitionText] = useState("");
  const navigate = useNavigate();
  const {
    location, setLocation, radius, setRadius,
    business, setBusiness, capital, setCapital,
    subCategory, setSubCategory, placeStatus, setPlaceStatus,
    rentMonthly, setRentMonthly, scaleChoice, setScaleChoice,
    businessAnswers, setBusinessAnswer,
    otherFunding, setOtherFunding,
    costOverrides, setCostOverride, resetCostOverrides,
    setFeasibility, isAnalyzing, setIsAnalyzing,
  } = useOnboarding();

  const [businessSearch, setBusinessSearch] = useState("");
  const [capitalError, setCapitalError] = useState("");
  const [analyzeError, setAnalyzeError] = useState(false);
  const analyzeBusyRef = useRef(false);

  const filteredBusinesses = useMemo(() => {
    if (!businessSearch) return businessCategories;
    const q = businessSearch.toLowerCase();
    return businessCategories.filter(
      (b) => b.name.toLowerCase().includes(q) || b.description.toLowerCase().includes(q),
    );
  }, [businessSearch]);

  const canProceed = useMemo(() => {
    switch (step) {
      case 0: return location !== null;
      case 1: return business !== null;
      case 2: return subCategory !== null;
      case 3: return true;
      case 4: return capital > 0;
      case 5: return true;
      default: return false;
    }
  }, [step, location, business, subCategory, capital]);

  const transitionTo = useCallback(async (targetStep: number, text: string) => {
    setTransitionText(text);
    setTransitioning(true);
    await new Promise((r) => setTimeout(r, 600));
    setStep(targetStep);
    setTransitioning(false);
  }, []);

  const handleNext = useCallback(() => {
    if (step === 4 && capital <= 0) {
      setCapitalError("Please enter a valid amount");
      return;
    }
    if (step < 5) {
      const texts = [
        "Looking up market data...",
        "Preparing business categories...",
        "Loading business types...",
        "Checking your workspace...",
        "Reviewing your selections...",
      ];
      transitionTo(step + 1, texts[step] || "Loading...");
    }
  }, [step, capital, transitionTo]);

  const handleBack = useCallback(() => {
    if (step > 0) transitionTo(step - 1, "Going back...");
  }, [step, transitionTo]);

  // Switching business / business-type clears cost overrides — edits belong
  // to the previous breakdown and must not silently apply to a new one.
  const chooseBusiness = useCallback((b: BusinessCategory | null) => {
    resetCostOverrides();
    setBusiness(b);
  }, [setBusiness, resetCostOverrides]);
  const chooseSubCategory = useCallback((s: BusinessSubCategory | null) => {
    resetCostOverrides();
    setSubCategory(s);
  }, [setSubCategory, resetCostOverrides]);

  const handleAnalyze = useCallback(async () => {
    if (!business || !location || analyzeBusyRef.current) return;
    // Defensive: never analyze without a capital figure — send the user back
    // to the capital step instead of running the engine with ₹0.
    if (capital <= 0) {
      setCapitalError("Please enter a valid amount");
      void transitionTo(4, "Going to capital...");
      return;
    }
    analyzeBusyRef.current = true;
    setAnalyzeError(false);
    setIsAnalyzing(true);
    try {
      const startedAt = Date.now();
      const feasibility = generateFeasibility(business.id, capital, location.id, radius, {
        subCategoryId: subCategory?.id ?? null,
        placeStatus,
        rentMonthly,
        scaleChoice,
        overrides: costOverrides,
      });
      // The calculation itself is fast — hold the polished branded loader
      // for a short minimum so there is no abrupt flash into the dashboard.
      const elapsed = Date.now() - startedAt;
      const minDisplay = 3200;
      if (elapsed < minDisplay) {
        await new Promise((resolve) => setTimeout(resolve, minDisplay - elapsed));
      }
      setFeasibility(feasibility);
      setIsAnalyzing(false);
      analyzeBusyRef.current = false;
      navigate("/dashboard");
    } catch (err) {
      console.error("Analysis failed:", err);
      setIsAnalyzing(false);
      analyzeBusyRef.current = false;
      setAnalyzeError(true);
    }
  }, [business, location, capital, radius, subCategory, placeStatus, rentMonthly, scaleChoice, navigate, setFeasibility, setIsAnalyzing, transitionTo]);

  if (analyzeError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center animate-scale-in">
          <div className="rounded-2xl border border-border bg-white p-8 shadow-xl">
            <div className="h-12 w-12 rounded-full bg-red-100 mx-auto mb-4 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Something went wrong while analyzing your business</h2>
            <p className="text-sm text-muted-foreground mt-2">Your selections are safe — your analysis was not lost.</p>
            <div className="flex flex-wrap gap-3 justify-center mt-6">
              <button
                onClick={() => setAnalyzeError(false)}
                className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Review
              </button>
              <button
                onClick={handleAnalyze}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
              >
                <RotateCcw className="h-4 w-4" /> Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isAnalyzing) {
    return <AnalysisLoader businessName={business?.name || "Your business"} locationName={location?.name || ""} />;
  }

  // Step transition screen
  if (transitioning) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{transitionText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Simplified onboarding header */}
      <div className="border-b border-border/50 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-bold text-primary font-serif-display">GramUdaan</span>
          <button onClick={() => navigate("/")} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-3.5 w-3.5" />
            Exit
          </button>
        </div>
        <div className="px-4 pb-3">
          <ProgressStepper steps={STEPS} currentStep={step} />
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-2xl">
          {step === 0 && (
            <LocationStep
              selected={location} onSelect={setLocation}
              radius={radius} onRadiusChange={setRadius}
            />
          )}
          {step === 1 && (
            <BusinessStep
              search={businessSearch} onSearchChange={setBusinessSearch}
              businesses={filteredBusinesses} selected={business} onSelect={chooseBusiness}
              location={location}
            />
          )}
          {step === 2 && (
            <SubCategoryStep
              business={business}
              selected={subCategory}
              onSelect={chooseSubCategory}
              answers={businessAnswers}
              onAnswer={setBusinessAnswer}
            />
          )}
          {step === 3 && (
            <PlaceStep
              business={business}
              subCategory={subCategory}
              status={placeStatus}
              onStatusChange={setPlaceStatus}
              rentMonthly={rentMonthly}
              onRentChange={setRentMonthly}
            />
          )}
          {step === 4 && (
            <CapitalStep
              value={capital} business={business}
              subCategory={subCategory} placeStatus={placeStatus}
              rentMonthly={rentMonthly} scaleChoice={scaleChoice}
              onScaleChange={setScaleChoice}
              otherFunding={otherFunding}
              onOtherFundingChange={setOtherFunding}
              costOverrides={costOverrides}
              onCostOverride={setCostOverride}
              onResetCostOverrides={resetCostOverrides}
              onChange={(v) => { setCapital(v); setCapitalError(""); }} error={capitalError}
            />
          )}
          {step === 5 && (
            <ReviewStep location={location} radius={radius} business={business} capital={capital}
              subCategory={subCategory} placeStatus={placeStatus} rentMonthly={rentMonthly} scaleChoice={scaleChoice}
              otherFunding={otherFunding}
              onEditLocation={() => transitionTo(0, "Going to location...")}
              onEditBusiness={() => transitionTo(1, "Going to business...")}
              onEditType={() => transitionTo(2, "Going to business type...")}
              onEditPlace={() => transitionTo(3, "Going to place...")}
              onEditCapital={() => transitionTo(4, "Going to capital...")}
              onEditScale={() => transitionTo(4, "Going to capital...")}
            />
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="border-t border-border/50 bg-white py-4 px-4 sticky bottom-0">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <button onClick={handleBack} disabled={step === 0}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {step < 5 ? (
            <button onClick={handleNext} disabled={!canProceed}
              className={cn("inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all",
                canProceed ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" : "bg-muted text-muted-foreground cursor-not-allowed",
              )}>
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={handleAnalyze}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
              Analyze My Business <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Step 1: Location — real India map + nationwide search ─── */

interface BoundaryState {
  status: "idle" | "loading" | "ready" | "error";
  progress?: number;
  feature: DistrictFeature | null;
  neighbors: DistrictFeature[];
  viaContainment?: boolean;
  note?: string;
}

function LocationStep({ selected, onSelect, radius, onRadiusChange }: {
  selected: Location | null;
  onSelect: (l: Location) => void;
  radius: number;
  onRadiusChange: (r: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LocationHit[]>([]);
  const [geo, setGeo] = useState<GeoLoadState>(getLoadState());
  const [detail, setDetail] = useState<DetailLoadState>(getDetailState());
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinTick, setPinTick] = useState(0);
  const [pickNote, setPickNote] = useState<string | null>(null);
  const [boundary, setBoundary] = useState<BoundaryState>({ status: "idle", feature: null, neighbors: [] });
  const [reloadKey, setReloadKey] = useState(0);

  // ── dataset bootstrap (tiered: curated → pin-heads index → full detail) ──
  useEffect(() => {
    let cancelled = false;
    const setIfLive = <T,>(fn: (v: T) => void) => (v: T) => {
      if (!cancelled) fn(v);
    };
    const s = getLoadState();
    setGeo(s.status === "ready" ? s : { status: "loading", progress: 0 });
    setDetail(getDetailState());
    setHits(curatedSuggestions(8));
    if (s.status === "ready") {
      // Already indexed — make sure the background enrichment subscriber is live.
      void initLocationService(undefined, undefined, setIfLive(setDetail));
      setHits((prev) => (prev.length ? prev : suggestLocations(10)));
      return;
    }
    initLocationService(
      setIfLive((pct: number) => setGeo({ status: "loading", progress: pct })),
      undefined,
      setIfLive(setDetail),
    )
      .then(() => {
        if (!cancelled) {
          setGeo(getLoadState());
          setHits((prev) => (prev.length ? prev : suggestLocations(10)));
        }
      })
      .catch(() => {
        if (!cancelled) setGeo(getLoadState());
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // ── debounced nationwide (text) search — never fires for PIN queries ──
  useEffect(() => {
    const q = query.trim();
    if (isPinQuery(q)) return; // handled by the online PIN effect below
    if (!q) {
      setHits(geo.status === "ready" ? suggestLocations(10) : curatedSuggestions(8));
      return;
    }
    if (geo.status !== "ready") {
      // while the directory loads, search within the curated demo towns
      const cur = curatedSuggestions(8).filter((h) =>
        `${h.title} ${h.district} ${h.state} ${h.pincode}`.toLowerCase().includes(q.toLowerCase()),
      );
      setHits(cur);
      return;
    }
    const t = setTimeout(() => setHits(searchLocations(q, 18)), 180);
    return () => clearTimeout(t);
  }, [query, geo.status]);

  // ── exact six-digit PIN → targeted online lookup (never blocks on dataset) ──
  useEffect(() => {
    const q = query.trim();
    if (!isPinQuery(q)) {
      setPinBusy(false);
      setPinError(null);
      return;
    }
    let cancelled = false;
    setPinBusy(true);
    setPinError(null);
    searchPinOnline(q)
      .then((hits) => {
        if (!cancelled) setHits(hits);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHits([]);
        setPinError(
          err instanceof PinLookupError && err.kind === "busy"
            ? "Location search is temporarily busy. Please try again."
            : "Unable to search this PIN code right now. Please try again.",
        );
      })
      .finally(() => {
        if (!cancelled) setPinBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, pinTick]);

  // ── real district boundary resolution for the selected location ──
  const locKey = selected ? `${selected.id}|${selected.lat}|${selected.lng}` : "";
  useEffect(() => {
    if (!selected) {
      setBoundary({ status: "idle", feature: null, neighbors: [] });
      return;
    }
    let cancelled = false;
    setBoundary((b) => ({ ...b, status: "loading", progress: 0 }));
    (async () => {
      try {
        const features = await loadDistrictBoundaries((pct) => {
          if (!cancelled) setBoundary((b) => ({ ...b, progress: pct }));
        });
        if (cancelled) return;
        const resolved = resolveDistrict(features, {
          district: selected.district,
          state: selected.state,
          lat: selected.lat,
          lng: selected.lng,
        });
        if (!resolved) {
          setBoundary({
            status: "error",
            feature: null,
            neighbors: [],
            note: "District boundary not found for this selection.",
          });
          return;
        }
        const neighbors = adjacentDistricts(features, resolved.feature, 8);
        const viaContainment = resolved.via === "containment";
        setBoundary({
          status: "ready",
          feature: resolved.feature,
          neighbors,
          viaContainment,
          note: viaContainment
            ? `Shown: ${resolved.feature.name} district (newer splits may not exist in the boundary dataset)`
            : undefined,
        });
      } catch (err) {
        if (cancelled) return;
        setBoundary({
          status: "error",
          feature: null,
          neighbors: [],
          note: err instanceof Error && err.message ? err.message : "District boundary could not be loaded.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locKey]);

  const applyHit = useCallback((hit: LocationHit) => {
    registerHit(hit);
    onSelect(hit.location);
    setPickNote(null);
  }, [onSelect]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (geo.status !== "ready") {
      setPickNote("Loading the location directory — try again in a moment.");
      return;
    }
    const near = nearestLocations(lat, lng, 30);
    if (near.length === 0) {
      setPickNote("No post office within 30 km of that point — choose a location from the search list.");
      return;
    }
    applyHit(near[0]);
    setQuery(near[0].title);
    setPickNote(`Selected nearest post office: ${near[0].title}, ${near[0].district}`);
  }, [geo.status, applyHit]);

  const datasetLoading = geo.status === "loading";
  const datasetError = geo.status === "error";

  const selectedPoint = selected
    ? { lat: selected.lat, lng: selected.lng, label: selected.name, sublabel: `${selected.district}, ${selected.state}` }
    : null;

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
          <MapPin className="h-6 w-6" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold">Where do you want to start your business?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Search any village, town or city across India — we will analyze the local market around it
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter on a full PIN (or a single strong hit) places it on the map directly.
            if (e.key === "Enter" && hits.length > 0 && !pinBusy && !pinError) {
              const q = query.trim();
              if (/^\d{6}$/.test(q) || hits.length === 1) {
                e.preventDefault();
                applyHit(hits[0]);
                setQuery(hits[0].title);
              }
            }
          }}
          placeholder="Search by PIN code, village, town or district across India…"
          className="w-full rounded-xl border border-border bg-white py-3 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* dataset status — text-search layer only; never shown for PIN queries */}
      {!isPinQuery(query.trim()) && datasetLoading && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
          <span className="flex-1">Loading location index — search will be ready in a moment…</span>
          {geo.progress != null && geo.progress > 0 && (
            <span className="font-semibold text-primary">{geo.progress}%</span>
          )}
        </div>
      )}
      {!isPinQuery(query.trim()) && datasetError && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">Location data could not be loaded. Showing demo towns only.</span>
          <button onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 font-semibold text-red-600 hover:bg-red-50 transition-colors">
            <RotateCcw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}
      {!isPinQuery(query.trim()) && geo.status === "ready" && (
        <p className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Database className="h-3 w-3" />
          {geo.total.toLocaleString("en-IN")} PIN locations indexed across India
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
            search v4
          </span>
          {detail.status === "loading" && (
            <span className="inline-flex items-center gap-1 text-primary/80">
              <Loader2 className="h-3 w-3 animate-spin" />
              adding post-office detail{detail.progress != null && detail.progress > 0 ? `… ${detail.progress}%` : "…"}
            </span>
          )}
          {detail.status === "ready" && " · full post-office detail ready"}
        </p>
      )}

      {/* Map */}
      <IndiaMap
        point={selectedPoint}
        radiusKm={selected ? radius : undefined}
        district={boundary.feature}
        neighbors={boundary.neighbors}
        onMapClick={handleMapClick}
        className="h-72 sm:h-80 mb-2"
      />

      {/* Selected location info card */}
      {selected && (
        <div className="mb-3 rounded-xl border border-border bg-white px-4 py-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                <p className="text-sm font-bold text-foreground truncate">{selected.name}</p>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary flex-shrink-0">
                  {selected.type}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{selected.district}, {selected.state}</p>
            </div>
            <span className="rounded-lg bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground whitespace-nowrap">
              PIN {selected.pincode}
            </span>
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-border/60 pt-2.5">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">District</p>
              <p className="text-xs font-bold text-foreground truncate mt-0.5">{selected.district}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Analysis area</p>
              <p className="text-xs font-bold text-foreground mt-0.5">{radius} km radius</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Nearby districts</p>
              <p className="text-xs font-bold text-foreground mt-0.5">
                {boundary.status === "ready" && boundary.feature ? boundary.neighbors.length : "…"}
              </p>
            </div>
          </div>

          {boundary.status === "loading" && (
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground border-t border-border/60 pt-2">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              {boundary.progress != null && boundary.progress > 0
                ? `Loading district boundary… ${boundary.progress}%`
                : "Finding district boundary…"}
            </p>
          )}
          {boundary.status === "ready" && boundary.feature && boundary.viaContainment && (
            <p className="mt-2 text-[10px] text-muted-foreground border-t border-border/60 pt-2">{boundary.note}</p>
          )}
          {boundary.status === "error" && (
            <p className="mt-2 text-[10px] text-amber-600 border-t border-border/60 pt-2">
              District boundary unavailable — marker &amp; radius still shown
            </p>
          )}
        </div>
      )}
      {pickNote && (
        <p className="mb-2 px-1 text-[11px] text-muted-foreground">📍 {pickNote}</p>
      )}

      {/* Location result list */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <p className="text-xs font-semibold text-muted-foreground">
            {query.trim() ? "Search results" : "Suggested locations"}
          </p>
          {isPinQuery(query.trim()) && (
            <p className="text-[10px] text-muted-foreground">online PIN lookup</p>
          )}
          {!query.trim() && geo.status === "ready" && (
            <p className="text-[10px] text-muted-foreground">Try “242001”, “Shahjahanpur”, “Mumbai”…</p>
          )}
        </div>
        <div className="max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-border/50">
          {hits.map((hit) => (
            <button
              key={hit.key}
              onClick={() => { applyHit(hit); setQuery(hit.title); }}
              className={cn("w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-muted/50",
                selected?.id === hit.key && "bg-primary/5 border-l-2 border-primary",
              )}
            >
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition-all",
                selected?.id === hit.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}>
                <MapPin className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{hit.title}</p>
                <p className="text-xs text-muted-foreground truncate">{hit.subtitle}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {hit.typeLabel}{hit.isCurated ? " · demo" : ""}
                </span>
                <span className="text-[10px] font-semibold text-[#4a6a5a]">{hit.pincode}</span>
              </div>
              {selected?.id === hit.key && (
                <Check className="h-4 w-4 text-primary flex-shrink-0" style={{ animation: "checkPop 0.3s ease-out" }} />
              )}
            </button>
          ))}
          {hits.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {isPinQuery(query.trim()) ? (
                pinBusy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    Searching this PIN code…
                  </span>
                ) : pinError ? (
                  <span className="flex flex-col items-center gap-2">
                    {pinError}
                    <button
                      onClick={() => setPinTick((t) => t + 1)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Try again
                    </button>
                  </span>
                ) : (
                  "No locations found for this PIN code."
                )
              ) : datasetError ? (
                "No matching demo town. Try a different spelling or PIN code."
              ) : datasetLoading ? (
                "Indexing locations…"
              ) : (
                "No matching Indian location found. Try a different spelling or PIN code."
              )}
            </div>
          )}
        </div>
        {!query.trim() && geo.status !== "ready" && (
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Demo towns are searchable while the India index loads.
          </p>
        )}
      </div>

      {/* Radius selection */}
      <div>
        <p className="text-sm font-semibold text-foreground mb-2">Analysis radius</p>
        <div className="flex gap-2">
          {RADIUS_OPTIONS.map((r) => (
            <button key={r} onClick={() => onRadiusChange(r)}
              className={cn("flex-1 rounded-xl border py-3 text-sm font-semibold transition-all",
                radius === r ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40",
              )}>
              {r} km
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Navigation className="h-3 w-3" />
          Tap anywhere on the map to snap to the nearest post office
        </p>
      </div>
    </div>
  );
}

/* ─── Step 2: Business with AI Recommendations ─── */
function BusinessStep({ search, onSearchChange, businesses, selected, onSelect, location }: {
  search: string; onSearchChange: (s: string) => void;
  businesses: BusinessCategory[]; selected: BusinessCategory | null;
  onSelect: (b: BusinessCategory | null) => void;
  location: Location | null;
}) {
  const recommendations = useMemo(() => (location ? getRecommendations(location) : []), [location]);
  const [showRecommendations, setShowRecommendations] = useState(true);

  const handleSuggestMe = useCallback(() => {
    if (recommendations.length > 0) {
      onSelect(recommendations[0].business);
    }
  }, [recommendations, onSelect]);

  const rankEmoji = ["🥇", "🥈", "🥉"];
  const rankColors = [
    "from-emerald-50 to-emerald-100/50 border-emerald-300",
    "from-blue-50 to-blue-100/50 border-blue-200",
    "from-amber-50 to-amber-100/50 border-amber-200",
  ];

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
          <Store className="h-6 w-6" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold">What business are you planning?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick the category that best describes what you want to start
        </p>
      </div>

      {/* AI Recommendations — always show when location selected and not searching */}
      {recommendations.length > 0 && !search && showRecommendations && (
        <div className="mb-6 animate-slide-up">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">
              Businesses that may work well in {location?.name}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Based on your selected location and available market information
          </p>
          <div className="space-y-2">
            {recommendations.map((rec) => (
              <button key={rec.business.id} onClick={() => onSelect(rec.business)}
                className={cn(
                  "w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-all hover:shadow-md",
                  selected?.id === rec.business.id
                    ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                    : cn("bg-gradient-to-r border", rankColors[rec.rank - 1] || rankColors[2]),
                )}>
                <span className="text-2xl flex-shrink-0">{rankEmoji[rec.rank - 1]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{rec.business.name}</span>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                      rec.competitionLevel === "low" ? "bg-emerald-100 text-emerald-700" :
                      rec.competitionLevel === "medium" ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700",
                    )}>{rec.competitionLevel} competition</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{rec.reason}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs font-bold text-primary">{rec.opportunityScore}</span>
                  <span className="text-[10px] text-muted-foreground">/100</span>
                </div>
                {selected?.id === rec.business.id && (
                  <Check className="h-5 w-5 text-primary flex-shrink-0" style={{ animation: "checkPop 0.3s ease-out" }} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      {recommendations.length > 0 && !search && showRecommendations && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Explore all categories</span>
          <div className="flex-1 h-px bg-border" />
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input type="text" value={search} onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search businesses..."
          className="w-full rounded-xl border border-border bg-white py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
      </div>

      {/* Business grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        {businesses.map((biz) => (
          <button key={biz.id} onClick={() => onSelect(biz)}
            className={cn(
              "flex flex-col items-center rounded-xl border p-4 text-center transition-all",
              selected?.id === biz.id
                ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                : "border-border hover:border-primary/40 bg-white hover:shadow-md",
            )}>
            <span className="text-3xl mb-2">{biz.icon}</span>
            <span className="text-sm font-semibold text-foreground">{biz.name}</span>
            <span className="text-[10px] text-primary/60 font-medium mt-0.5">{biz.nameHi}</span>
            <span className="text-[11px] text-muted-foreground mt-1 leading-tight line-clamp-2">{biz.description}</span>
            {selected?.id === biz.id && (
              <Check className="h-4 w-4 text-primary mt-2" style={{ animation: "checkPop 0.3s ease-out" }} />
            )}
          </button>
        ))}
      </div>

      {/* Not sure — suggest button */}
      <button onClick={handleSuggestMe}
        className={cn(
          "w-full rounded-xl border-2 border-dashed p-4 text-center transition-all",
          selected?.id === "suggest" || (selected && recommendations.some((r) => r.business.id === selected.id))
            ? "border-primary bg-primary/5"
            : "border-primary/30 hover:border-primary/60 hover:bg-primary/5",
        )}>
        <Lightbulb className="h-5 w-5 text-primary mx-auto mb-1" />
        <span className="text-sm font-semibold text-primary">I'm not sure — suggest a business for me</span>
        <span className="block text-xs text-muted-foreground mt-0.5">
          {location ? `We recommend ${recommendations[0]?.business?.name || "a business"} for ${location.name}` : "We'll recommend based on your location"}
        </span>
      </button>
    </div>
  );
}

/* ─── Step 2b: Business Type (sub-category) + scale ─── */
function SubCategoryStep({ business, selected, onSelect, answers, onAnswer }: {
  business: BusinessCategory | null;
  selected: BusinessSubCategory | null;
  onSelect: (s: BusinessSubCategory | null) => void;
  answers: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
}) {
  const options = useMemo(() => (business ? getSubCategoriesForBusiness(business.id) : []), [business]);

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
          <SlidersHorizontal className="h-6 w-6" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold">What exactly are you planning?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {business ? <>For <span className="font-semibold text-foreground">{business.icon} {business.name}</span> — pick the specific type. This changes the cost and revenue estimates.</> : "Pick the specific type of business"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {options.map((opt) => (
          <button key={opt.id} onClick={() => onSelect(opt)}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
              selected?.id === opt.id
                ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                : "border-border bg-white hover:border-primary/40 hover:shadow-md",
            )}>
            <span className="text-2xl flex-shrink-0">{opt.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-foreground">{opt.name}</p>
                {selected?.id === opt.id && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{opt.description}</p>
              <p className="text-[10px] text-primary/70 mt-1">की आवश्यकता: {opt.nameHi}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Business-specific questions for the chosen sub-category */}
      {selected && selected.questions.length > 0 && (
        <div className="rounded-xl border border-border bg-[#F4F8EF] p-4 mb-6 animate-fade-in">
          <p className="text-sm font-bold text-foreground mb-1">A few quick questions</p>
          <p className="text-xs text-muted-foreground mb-4">These help us fine-tune the estimate for your plan.</p>
          <div className="space-y-4">
            {selected.questions.map((q) => (
              <div key={q.id}>
                <p className="text-sm font-semibold text-foreground mb-2">{q.label}</p>
                {q.options ? (
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((o) => (
                      <button key={o.value} onClick={() => onAnswer(q.id, o.value)}
                        className={cn("rounded-full border px-4 py-2 text-xs font-semibold transition-all",
                          answers[q.id] === o.value
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
                    value={answers[q.id] || ""}
                    onChange={(e) => onAnswer(q.id, e.target.value)}
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
  );
}

/* ─── Step 3: Place / Workspace (ownership-aware costing) ─── */
const PLACE_ICONS: Record<PlaceStatus, React.ReactNode> = {
  own: <Home className="h-5 w-5" />,
  rent: <KeyRound className="h-5 w-5" />,
  buy: <Building2 className="h-5 w-5" />,
  build: <Hammer className="h-5 w-5" />,
  "not-needed": <Warehouse className="h-5 w-5" />,
  unsure: <HelpCircle className="h-5 w-5" />,
};

const PLACE_LABELS: Record<PlaceStatus, string> = {
  own: "I already have it",
  rent: "I will rent",
  buy: "I will buy",
  build: "I will build / construct",
  "not-needed": "No separate place needed",
  unsure: "Not sure yet",
};

const PLACE_TYPE_LABEL: Record<string, string> = {
  shop: "a shop",
  land: "land / shed",
  workspace: "a workspace / shed",
  shed: "a shed",
  none: "no separate place",
};

function PlaceStep({ business, subCategory, status, onStatusChange, rentMonthly, onRentChange }: {
  business: BusinessCategory | null;
  subCategory: BusinessSubCategory | null;
  status: PlaceStatus;
  onStatusChange: (p: PlaceStatus) => void;
  rentMonthly: number;
  onRentChange: (r: number) => void;
}) {
  const needs = subCategory?.placeType ?? "shop";

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
          <Building2 className="h-6 w-6" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold">Do you already have the place for this business?</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          {business && subCategory ? (
            <><span className="font-semibold text-foreground">{subCategory.icon} {subCategory.name}</span> typically needs {PLACE_TYPE_LABEL[needs]}. This directly changes the setup cost — if you own it, we won't add a purchase cost.</>
          ) : (
            "Your answer changes how we estimate the setup cost — if you own it, we don't add a purchase cost."
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {PLACE_STATUS_OPTIONS.map((opt) => (
          <button key={opt.value} onClick={() => onStatusChange(opt.value)}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
              status === opt.value
                ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                : "border-border bg-white hover:border-primary/40 hover:shadow-md",
            )}>
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0",
              status === opt.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}>
              {PLACE_ICONS[opt.value]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-foreground">{opt.label}</p>
                {status === opt.value && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{opt.hint}</p>
              <p className="text-[10px] text-primary/70 mt-0.5">{opt.labelHi}</p>
            </div>
          </button>
        ))}
      </div>

      {status === "rent" && (
        <div className="rounded-xl border border-border bg-[#F4F8EF] p-4 animate-fade-in">
          <p className="text-sm font-semibold text-foreground mb-2">Expected monthly rent (₹)?</p>
          <p className="text-xs text-muted-foreground mb-3">
            If unsure, we'll use a typical estimate for {PLACE_TYPE_LABEL[needs]} in a rural market.
          </p>
          <input
            type="number"
            min={0}
            value={rentMonthly || ""}
            onChange={(e) => onRentChange(Math.max(0, Number(e.target.value) || 0))}
            placeholder="e.g. 4000"
            className="w-full sm:w-64 rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      )}
    </div>
  );
}

/* ─── Step 4: Capital with scale choice + dynamic financing preview ─── */
const PRIORITY_BADGE: Record<CostPriority, string> = {
  essential: "bg-emerald-100 text-emerald-700",
  important: "bg-amber-100 text-amber-700",
  optional: "bg-zinc-100 text-zinc-600",
};

const PRIORITY_BAR: Record<CostPriority, string> = {
  essential: "bg-emerald-500",
  important: "bg-amber-400",
  optional: "bg-zinc-300",
};

const TIER_CARDS: { value: ScaleChoice; tierKey: "minimum" | "recommended" | "expanded"; label: string; hint: string }[] = [
  { value: "small", tierKey: "minimum", label: "Minimum Start", hint: "Essential setup only — lowest investment & risk" },
  { value: "recommended", tierKey: "recommended", label: "Recommended Setup", hint: "Balanced setup for sustainable operations" },
  { value: "expanded", tierKey: "expanded", label: "Expanded Setup", hint: "Higher inventory, capacity & marketing" },
];

function CapitalStep({ value, business, subCategory, placeStatus, rentMonthly, scaleChoice, onScaleChange, otherFunding, onOtherFundingChange, costOverrides, onCostOverride, onResetCostOverrides, onChange, error }: {
  value: number; business: BusinessCategory | null;
  subCategory: BusinessSubCategory | null; placeStatus: PlaceStatus;
  rentMonthly: number; scaleChoice: ScaleChoice; onScaleChange: (s: ScaleChoice) => void;
  otherFunding: number; onOtherFundingChange: (v: number) => void;
  costOverrides: Record<string, number>;
  onCostOverride: (id: string, v: number) => void; onResetCostOverrides: () => void;
  onChange: (v: number) => void; error: string;
}) {
  const showAnalysis = value > 0;
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const bid = business?.id ?? "other";

  // Reference investment levels for this business — user edits never move them.
  const tiers = useMemo(
    () => buildInvestmentTiers(bid, { subCategoryId: subCategory?.id ?? null, placeStatus, rentMonthly }),
    [bid, subCategory, placeStatus, rentMonthly],
  );

  // Active setup estimate at the chosen scale — user edits win. This is the
  // SAME breakdown the plan, dashboard and report read, so one change here
  // recalculates everything downstream (gap, loan, EMI, risk, feasibility).
  const breakdown = useMemo(
    () => buildCostBreakdown(bid, {
      subCategoryId: subCategory?.id ?? null,
      placeStatus,
      rentMonthly,
      scaleChoice,
      overrides: costOverrides,
    }),
    [bid, subCategory, placeStatus, rentMonthly, scaleChoice, costOverrides],
  );

  const totalRequired = breakdown.total;
  const totalAvailable = value + Math.max(0, otherFunding || 0);
  const fundingGap = Math.max(0, totalRequired - totalAvailable);
  const remainingCapital = Math.max(0, totalAvailable - totalRequired);
  const hasOverrides = Object.keys(costOverrides).length > 0;

  // How the user's own capital gets deployed — priority-ordered, not equal split.
  const allocation = useMemo(() => allocateCapital(value, breakdown.components), [value, breakdown]);
  const fit = capitalFitResult(totalAvailable, totalRequired);
  const rec = recommendScale(totalAvailable, tiers);
  const surplus = Math.max(0, totalAvailable - tiers.minimum);
  const surplusUses = useMemo(() => suggestSurplusUse(surplus, bid), [surplus, bid]);

  const visibleComponents = breakdown.components.filter((c) => c.amount > 0);
  const essentialComps = visibleComponents.filter((c) => c.priority === "essential");
  const importantComps = visibleComponents.filter((c) => c.priority === "important");
  const optionalComps = visibleComponents.filter((c) => c.priority === "optional");

  const startEdit = (id: string, amount: number) => {
    setEditing(id);
    setEditDraft(String(amount));
  };
  const saveEdit = () => {
    if (editing) onCostOverride(editing, Math.max(0, Number(editDraft) || 0));
    setEditing(null);
  };

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
          <IndianRupee className="h-6 w-6" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold">How much can you invest?</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          Tell us what you can put in from your own pocket. We'll show exactly what your business needs, where the money will go, and how much funding is actually required.
        </p>
      </div>

      <div className="mb-4">
        <CurrencyInput value={value} onChange={onChange} />
        {error && <p className="mt-2 text-sm text-red-500 text-center">{error}</p>}
      </div>

      <div className="flex gap-2 justify-center mb-6">
        {QUICK_AMOUNTS.map((amt) => (
          <button key={amt.value} onClick={() => onChange(amt.value)}
            className={cn("rounded-full border px-5 py-2.5 text-sm font-semibold transition-all",
              value === amt.value
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}>
            {amt.label}
          </button>
        ))}
      </div>

      {/* Other funding (family / partner / grants) — reduces the funding gap */}
      <div className="mb-6 rounded-xl border border-border bg-white p-4">
        <p className="text-sm font-semibold text-foreground mb-0.5">Other funding (optional)</p>
        <p className="text-xs text-muted-foreground mb-3">
          Family, partner or grant money you can add beyond your own savings. It directly reduces the funding gap.
        </p>
        <input
          type="number"
          min={0}
          value={otherFunding || ""}
          onChange={(e) => onOtherFundingChange(Math.max(0, Number(e.target.value) || 0))}
          placeholder="e.g. 50000"
          className="w-full sm:w-64 rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* THREE LEVELS OF INVESTMENT — Small Start / Recommended / Expanded */}
      <div className="mb-6">
        <div className="flex items-start gap-2.5 mb-3">
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wallet className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground leading-tight">Your business investment</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Three reference levels for {business ? `${business.name}${subCategory ? ` — ${subCategory.name}` : ""}` : "your business"}. Tap one to set your starting scale.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {TIER_CARDS.map((t) => (
            <button key={t.value} onClick={() => onScaleChange(t.value)}
              className={cn(
                "rounded-xl border p-3.5 text-left transition-all",
                scaleChoice === t.value
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-white hover:border-primary/40",
              )}>
              <p className="text-sm font-semibold">{t.label}</p>
              <p className="text-lg font-bold text-foreground mt-1">{formatIndianCurrency(tiers[t.tierKey])}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t.hint}</p>
            </button>
          ))}
        </div>
        {showAnalysis && (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-xs">
            <span className="font-bold text-foreground">Recommended for you: {rec.label}.</span>{" "}
            <span className="text-muted-foreground">{rec.reason}</span>
            {rec.scale !== scaleChoice && (
              <span className="block mt-1 font-semibold text-primary">Tip: switch your starting scale to {rec.label} to match your funding.</span>
            )}
          </div>
        )}
      </div>

      {showAnalysis ? (
        <div className="space-y-6">
          {/* 1. COST BREAKDOWN — where the money will go */}
          <div className="rounded-xl border border-border bg-white overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <SectionTitle
                icon={<BarChart3 className="h-4 w-4" />}
                title="Where the money will go"
                subtitle="Estimated setup cost breakdown for this business — edit any line and everything recalculates."
              />
            </div>
            <div className="divide-y divide-border/60 text-sm">
              {breakdown.components.map((c) => {
                if (c.amount <= 0 && editing !== c.id) return null;
                const isEditing = editing === c.id;
                const overridden = costOverrides[c.id] !== undefined;
                return (
                  <div key={c.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground flex flex-wrap items-center gap-2">
                          {c.label}
                          <PriorityBadge priority={c.priority} />
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{c.labelHi}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">₹</span>
                            <input
                              type="number"
                              min={0}
                              autoFocus
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null); }}
                              className="w-28 rounded-lg border border-border px-2.5 py-1.5 text-sm text-right focus:border-primary focus:outline-none"
                            />
                            <button onClick={saveEdit} className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors" aria-label="Save">
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setEditing(null)} className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors" aria-label="Cancel">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <div>
                              <p className="font-bold">{formatIndianCurrency(c.amount)}</p>
                              <SourceTag source={overridden ? "YOUR ADJUSTMENT" : c.source} />
                            </div>
                            <button onClick={() => startEdit(c.id, c.amount)}
                              className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors">
                              <Edit3 className="h-3 w-3" /> Edit
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="px-4 py-3 bg-[#F4F8EF] flex items-center justify-between gap-3">
                <p className="text-sm font-bold">Total estimated setup</p>
                <p className="text-lg font-extrabold text-foreground">{formatIndianCurrency(totalRequired)}</p>
              </div>
            </div>
            <div className="border-t border-border/60 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">Your edits adjust the total, the funding gap and every downstream calculation.</p>
              {hasOverrides && (
                <button onClick={onResetCostOverrides} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
                  <RotateCcw className="h-3 w-3" /> Reset to estimates
                </button>
              )}
            </div>
          </div>

          {/* 2. HOW YOUR CAPITAL IS ALLOCATED */}
          <div className="rounded-xl border border-border bg-white p-4">
            <SectionTitle
              icon={<Wallet className="h-4 w-4" />}
              title={`How your ${formatIndianCurrency(value)} can be used`}
              subtitle="Filled in priority order — essential costs first, then working capital, then optional extras."
            />
            <div className="mt-3 divide-y divide-border/60 text-sm">
              {allocation.rows.filter((r) => r.allocated > 0).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {r.label}
                    <PriorityBadge priority={r.priority} />
                  </span>
                  <span className="text-right font-semibold">
                    {formatIndianCurrency(r.allocated)}
                    <span className="block text-[10px] text-muted-foreground">{Math.round(r.pctOfCapital * 100)}% of your capital</span>
                  </span>
                </div>
              ))}
              {allocation.remaining > 0 && (
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-muted-foreground">Kept unspent (buffer)</span>
                  <span className="text-right font-semibold text-emerald-600">{formatIndianCurrency(allocation.remaining)}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 py-2.5">
                <span className="font-bold">Your contribution</span>
                <span className="font-extrabold">{formatIndianCurrency(value)}</span>
              </div>
            </div>
          </div>

          {/* 3. REAL FUNDING GAP */}
          <FundingGapCard totalRequired={totalRequired} value={value} otherFunding={otherFunding} fundingGap={fundingGap} remainingCapital={remainingCapital} />

          {/* 4. CAPITAL FIT */}
          <div className={cn("rounded-xl border p-4",
            fit.level === "sufficient" ? "border-emerald-200 bg-emerald-50/60" :
            fit.level === "partial" ? "border-amber-200 bg-amber-50/60" :
            "border-red-200 bg-red-50/60",
          )}>
            <p className="flex items-center gap-2 text-sm font-bold">
              <ShieldCheck className={cn("h-4 w-4",
                fit.level === "sufficient" ? "text-emerald-600" :
                fit.level === "partial" ? "text-amber-600" : "text-red-600",
              )} />
              Capital fit: {fit.icon} {fit.label} — covers {fit.coveragePct}% of the setup
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">{fit.explanation}</p>
          </div>

          {/* 5. MUST-SPEND vs CAN-OPTIMIZE vs DEFER */}
          <div className="rounded-xl border border-border bg-white p-4">
            <SectionTitle
              icon={<ListChecks className="h-4 w-4" />}
              title="Must spend, can optimize, defer"
              subtitle="What truly needs to be in place on day one, vs what can wait until the business grows."
            />
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <PriorityGroup title="MUST HAVE" tone="emerald" note="Required to start" items={essentialComps.map((c) => c.label)} />
              <PriorityGroup title="CAN OPTIMIZE" tone="amber" note="Strongly recommended — trim if needed" items={importantComps.map((c) => c.label)} />
              <PriorityGroup title="DEFER UNTIL GROWTH" tone="zinc" note="Add later when revenue supports it" items={optionalComps.map((c) => c.label)} />
            </div>
          </div>

          {/* 6. WHAT IF YOU HAVE MORE MONEY */}
          {surplus > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="text-sm font-bold text-emerald-800">
                You have {formatIndianCurrency(surplus)} more than the minimum start ({formatIndianCurrency(tiers.minimum)})
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                You don't have to spend it all. A sensible way to use the extra money:
              </p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {surplusUses.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-white px-3 py-2">
                    <span className="text-xs font-semibold">
                      {u.label}
                      <span className="block text-[10px] font-normal text-muted-foreground">{u.hint}</span>
                    </span>
                    <span className="font-bold text-emerald-700">{formatIndianCurrency(u.amount)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-emerald-700/70">Suggested split — you decide. Keeping an emergency buffer is always recommended.</p>
            </div>
          )}

          {/* 7. VISUAL CHARTS */}
          <div className="rounded-xl border border-border bg-white p-4">
            <SectionTitle
              icon={<BarChart3 className="h-4 w-4" />}
              title="Where your money goes"
              subtitle="Share of the estimated setup requirement by cost line."
            />
            <div className="mt-4 space-y-2.5">
              {visibleComponents.map((c) => (
                <div key={c.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-foreground">{c.label}</span>
                    <span className="font-semibold">{formatIndianCurrency(c.amount)} · {totalRequired > 0 ? Math.round((c.amount / totalRequired) * 100) : 0}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full transition-all", PRIORITY_BAR[c.priority])}
                      style={{ width: `${totalRequired > 0 ? Math.min(100, (c.amount / totalRequired) * 100) : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-border/60 pt-4">
              <p className="mb-2 text-xs font-bold">Your funding vs total required</p>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="w-24 flex-shrink-0 text-muted-foreground">Your funding</span>
                <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${totalRequired > 0 ? Math.min(100, (totalAvailable / totalRequired) * 100) : 0}%` }} />
                </div>
                <span className="w-24 flex-shrink-0 text-right font-semibold">{formatIndianCurrency(totalAvailable)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span className="w-24 flex-shrink-0 text-muted-foreground">Setup needs</span>
                <div className="flex h-3.5 flex-1 overflow-hidden rounded-full bg-muted">
                  {value > 0 && <div className="h-full bg-emerald-500" style={{ width: `${totalRequired > 0 ? (value / totalRequired) * 100 : 0}%` }} />}
                  {(otherFunding || 0) > 0 && <div className="h-full bg-sky-500" style={{ width: `${totalRequired > 0 ? ((otherFunding || 0) / totalRequired) * 100 : 0}%` }} />}
                  {fundingGap > 0 && <div className="h-full bg-red-500" style={{ width: `${totalRequired > 0 ? (fundingGap / totalRequired) * 100 : 0}%` }} />}
                </div>
                <span className="w-24 flex-shrink-0 text-right font-semibold">{formatIndianCurrency(totalRequired)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                {value > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Your capital {formatIndianCurrency(value)}
                  </span>
                )}
                {(otherFunding || 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-sky-500" /> Other funding {formatIndianCurrency(otherFunding)}
                  </span>
                )}
                {fundingGap > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Funding gap {formatIndianCurrency(fundingGap)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 8. HOW DID GRAMUDAAN ESTIMATE THIS? */}
          <EstimateDetails business={business} subCategory={subCategory} placeStatus={placeStatus} rentMonthly={rentMonthly} scaleChoice={scaleChoice} breakdown={breakdown} costOverrides={costOverrides} />
        </div>
      ) : (
        <div className="rounded-xl bg-muted/50 border border-border/60 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            💡 Don't worry about the exact amount. Enter your capital and we'll show exactly where it goes, how much funding is needed and which scale fits your situation.
          </p>
        </div>
      )}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: CostPriority }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide", PRIORITY_BADGE[priority])}>
      {priority}
    </span>
  );
}

function SourceTag({ source }: { source: string }) {
  const styles: Record<string, string> = {
    CALCULATED: "bg-emerald-50 text-emerald-700",
    ESTIMATED: "bg-amber-50 text-amber-700",
    USER_PROVIDED: "bg-sky-50 text-sky-700",
    "YOUR ADJUSTMENT": "bg-violet-50 text-violet-700",
  };
  const label =
    source === "YOUR ADJUSTMENT" ? "You set this" :
    source === "USER_PROVIDED" ? "You provided" :
    source === "CALCULATED" ? "Calculated" : "Estimated";
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", styles[source] ?? styles.ESTIMATED)}>
      {label}
    </span>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground leading-tight">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function FundingGapCard({ totalRequired, value, otherFunding, fundingGap, remainingCapital }: {
  totalRequired: number; value: number; otherFunding: number; fundingGap: number; remainingCapital: number;
}) {
  if (fundingGap <= 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <p className="text-sm font-bold text-emerald-800">✅ No funding gap</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Your funding ({formatIndianCurrency(value + Math.max(0, otherFunding))}) covers the estimated setup requirement ({formatIndianCurrency(totalRequired)}).
          {remainingCapital > 0 && <> You have <span className="font-bold text-emerald-700">{formatIndianCurrency(remainingCapital)}</span> left over — keep it as an emergency buffer or use it for working capital.</>}{" "}
          No loan is recommended under current assumptions.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <p className="text-sm font-bold text-amber-800">💰 Funding gap: {formatIndianCurrency(fundingGap)}</p>
      <div className="mt-2 divide-y divide-border/60 rounded-lg border border-amber-100 bg-white text-xs">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-muted-foreground">Total required investment</span>
          <span className="font-semibold">{formatIndianCurrency(totalRequired)}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-muted-foreground">Your capital</span>
          <span className="font-semibold">− {formatIndianCurrency(value)}</span>
        </div>
        {(otherFunding || 0) > 0 && (
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-muted-foreground">Other funding</span>
            <span className="font-semibold">− {formatIndianCurrency(otherFunding)}</span>
          </div>
        )}
        <div className="flex items-center justify-between bg-amber-50/60 px-3 py-2">
          <span className="font-bold">Funding gap</span>
          <span className="font-extrabold text-amber-800">{formatIndianCurrency(fundingGap)}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Possible funding need: Loan / Scheme / Partner / Other funding. We'll show loan options and EMI in the next steps.
      </p>
    </div>
  );
}

function PriorityGroup({ title, tone, note, items }: {
  title: string; tone: "emerald" | "amber" | "zinc"; note: string; items: string[];
}) {
  const tones: Record<string, string> = {
    emerald: "border-emerald-200 bg-emerald-50/60 text-emerald-700",
    amber: "border-amber-200 bg-amber-50/60 text-amber-700",
    zinc: "border-zinc-200 bg-zinc-50/60 text-zinc-600",
  };
  return (
    <div className={cn("rounded-lg border p-3", tones[tone])}>
      <p className="text-xs font-bold uppercase tracking-wide">{title}</p>
      <p className="mt-0.5 mb-2 text-[10px] text-muted-foreground">{note}</p>
      {items.length > 0 ? (
        <ul className="space-y-1 text-[11px] font-medium">
          {items.map((it) => <li key={it}>• {it}</li>)}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">Nothing here for this business</p>
      )}
    </div>
  );
}

function EstimateDetails({ business, subCategory, placeStatus, rentMonthly, scaleChoice, breakdown, costOverrides }: {
  business: BusinessCategory | null; subCategory: BusinessSubCategory | null;
  placeStatus: PlaceStatus; rentMonthly: number; scaleChoice: ScaleChoice;
  breakdown: CostBreakdown; costOverrides: Record<string, number>;
}) {
  return (
    <details className="rounded-xl border border-border bg-white px-4 py-3">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 text-sm font-semibold text-primary">
        <HelpCircle className="h-4 w-4" /> How did GramUdaan estimate this?
      </summary>
      <div className="mt-3 space-y-3 text-xs">
        <div>
          <p className="mb-1 font-bold text-foreground">This estimate is based on:</p>
          <ul className="list-none space-y-1 text-muted-foreground">
            <li>• Selected business: {business?.name}{subCategory ? ` — ${subCategory.name}` : ""}</li>
            <li>• Starting scale: {SCALE_OPTIONS.find((s) => s.value === scaleChoice)?.label}</li>
            <li>• Place arrangement: {PLACE_LABELS[placeStatus]}{placeStatus === "rent" && rentMonthly > 0 ? ` (₹${rentMonthly.toLocaleString("en-IN")}/month rent)` : ""}</li>
            <li>• Equipment, initial inventory and working-capital requirements for this business type</li>
            <li>• Your contribution{Object.keys(costOverrides).length > 0 ? " and your cost adjustments" : ""}</li>
          </ul>
        </div>
        <div>
          <p className="mb-1 font-bold text-foreground">How each figure was derived:</p>
          <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
            {breakdown.components.filter((c) => c.amount > 0).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="flex items-center gap-2 text-muted-foreground">
                  {c.label}
                  <SourceTag source={costOverrides[c.id] !== undefined ? "YOUR ADJUSTMENT" : c.source} />
                </span>
                <span className="font-semibold">{formatIndianCurrency(c.amount)}</span>
              </div>
            ))}
          </div>
        </div>
        {breakdown.notes.length > 0 && (
          <div>
            <p className="mb-1 font-bold text-foreground">Important notes:</p>
            <ul className="list-none space-y-1 text-muted-foreground">
              {breakdown.notes.map((n, i) => <li key={i}>• {n}</li>)}
            </ul>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground/80">
          These are preliminary estimates for decision support — not exact quotes. Actual costs depend on local prices, supplier quotations and your final choices. Verify with a local supplier or bank before committing.
        </p>
      </div>
    </details>
  );
}

/* ─── Step 5: Review ─── */
function ReviewStep({ location, radius, business, capital, subCategory, placeStatus, rentMonthly, scaleChoice, otherFunding, onEditLocation, onEditBusiness, onEditType, onEditPlace, onEditCapital, onEditScale }: {
  location: Location | null; radius: number; business: BusinessCategory | null;
  capital: number; subCategory: BusinessSubCategory | null; placeStatus: PlaceStatus; rentMonthly: number; scaleChoice: ScaleChoice; otherFunding: number;
  onEditLocation: () => void; onEditBusiness: () => void; onEditType: () => void; onEditPlace: () => void; onEditCapital: () => void; onEditScale: () => void;
}) {
  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold">Review Your Selection</h2>
        <p className="mt-2 text-sm text-muted-foreground">Double-check everything before we run the analysis</p>
      </div>
      <div className="space-y-3">
        <ReviewRow icon={<MapPin className="h-4 w-4" />} label="Location"
          value={location ? `${location.name}, ${location.district}, ${location.state}` : "Not selected"}
          sub={location ? `${radius} km analysis radius` : undefined} onEdit={onEditLocation} />
        <ReviewRow icon={<Store className="h-4 w-4" />} label="Business"
          value={business ? `${business.icon} ${business.name}` : "Not selected"}
          sub={business?.description} onEdit={onEditBusiness} />
        <ReviewRow icon={<SlidersHorizontal className="h-4 w-4" />} label="Business Type"
          value={subCategory ? `${subCategory.icon} ${subCategory.name}` : "Not selected"}
          sub={subCategory?.description} onEdit={onEditType} />
        <ReviewRow icon={<Building2 className="h-4 w-4" />} label="Place / Workspace"
          value={PLACE_LABELS[placeStatus]}
          sub={placeStatus === "rent" ? `Monthly rent: ${formatIndianCurrency(rentMonthly || 0)}` : undefined} onEdit={onEditPlace} />
        <ReviewRow icon={<TrendingUp className="h-4 w-4" />} label="Scale"
          value={SCALE_OPTIONS.find((s) => s.value === scaleChoice)?.label || "Recommended"}
          sub={SCALE_OPTIONS.find((s) => s.value === scaleChoice)?.hint} onEdit={onEditScale} />
        <ReviewRow icon={<IndianRupee className="h-4 w-4" />} label="Your Contribution"
          value={capital > 0 ? formatIndianCurrency(capital) : "Not entered"}
          sub={otherFunding > 0 ? `+ ${formatIndianCurrency(otherFunding)} other funding (family/partner/grant)` : "Amount you can contribute from savings"} onEdit={onEditCapital} />
      </div>
    </div>
  );
}

function ReviewRow({ icon, label, value, sub, onEdit }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-white p-4 transition-all hover:shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground mt-0.5 truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </div>
      <button onClick={onEdit} className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
        <Edit3 className="h-3 w-3" /> Edit
      </button>
    </div>
  );
}

/* ─── Professional Analysis Loading Experience ─── */
function AnalysisLoader({ businessName, locationName }: { businessName: string; locationName: string }) {
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [showComplete, setShowComplete] = useState(false);
  const [progress, setProgress] = useState(0);

  const steps = [
    `Understanding your location (${locationName})`,
    "Checking your business setup & place",
    "Estimating setup cost and capital use",
    "Calculating revenue, expenses and profit",
    "Projecting profit timeline & break-even",
    "Assessing risk, alternatives & recommendation",
  ];

  useEffect(() => {
    // Timeline fits inside handleAnalyze's ~3.2 s minimum display: all six
    // steps tick by ~2.1 s and the "Analysis Ready" card lands ~2.7 s so the
    // loader never overruns the navigation.
    const firstTick = 250;
    const stepDelay = 380;
    steps.forEach((_, i) => {
      setTimeout(() => {
        setCompletedSteps((prev) => [...prev, i]);
        setProgress(((i + 1) / steps.length) * 100);
      }, firstTick + i * stepDelay);
    });
    setTimeout(() => setShowComplete(true), firstTick + steps.length * stepDelay + 300);
  }, []);

  if (showComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center animate-scale-in">
          <div className="rounded-2xl border border-border bg-white p-10 shadow-xl">
            <div className="h-16 w-16 rounded-full bg-emerald-100 mx-auto mb-4 flex items-center justify-center" style={{ animation: "checkPop 0.5s ease-out" }}>
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-foreground font-serif-display">Analysis Ready</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Your {businessName} feasibility report is ready. Taking you to the dashboard...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-white p-8 shadow-xl animate-scale-in">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-foreground font-serif-display">Analyzing Your Business</h2>
            <p className="text-sm text-muted-foreground mt-1">
              We're evaluating your location, market demand, competition, risks and financial fit.
            </p>
          </div>
          <div className="space-y-3">
            {steps.map((stepText, i) => {
              const isComplete = completedSteps.includes(i);
              const isCurrent = !isComplete && completedSteps.length === i;
              return (
                <div key={i} className={cn("flex items-center gap-3 transition-all duration-300",
                  isComplete ? "opacity-100" : isCurrent ? "opacity-100" : "opacity-40",
                )}>
                  {isComplete ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100" style={{ animation: "checkPop 0.3s ease-out" }}>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                  ) : isCurrent ? (
                    <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  ) : (
                    <div className="h-6 w-6 rounded-full border-2 border-border" />
                  )}
                  <span className={cn("text-sm transition-colors",
                    isComplete || isCurrent ? "text-foreground font-medium" : "text-muted-foreground",
                  )}>{stepText}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-6 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-3">This usually takes a few seconds...</p>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return <OnboardingInner />;
}
