import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { ProgressStepper } from "@/components/ui/ProgressStepper";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { useOnboarding } from "@/lib/onboarding-context";
import { generateFeasibility } from "@/data/feasibility";
import { calculateProjectCost, calculateLoan, startupCostRange } from "@/engine/financial";
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

  const handleAnalyze = useCallback(async () => {
    if (!business || !location || analyzeBusyRef.current) return;
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
  }, [business, location, capital, radius, subCategory, placeStatus, rentMonthly, scaleChoice, navigate, setFeasibility, setIsAnalyzing]);

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
              businesses={filteredBusinesses} selected={business} onSelect={setBusiness}
              location={location}
            />
          )}
          {step === 2 && (
            <SubCategoryStep
              business={business}
              selected={subCategory}
              onSelect={setSubCategory}
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
              onChange={(v) => { setCapital(v); setCapitalError(""); }} error={capitalError}
            />
          )}
          {step === 5 && (
            <ReviewStep location={location} radius={radius} business={business} capital={capital}
              subCategory={subCategory} placeStatus={placeStatus} rentMonthly={rentMonthly} scaleChoice={scaleChoice}
              onEditLocation={() => transitionTo(0, "Going to location...")}
              onEditBusiness={() => transitionTo(1, "Going to business...")}
              onEditType={() => transitionTo(2, "Going to business type...")}
              onEditPlace={() => transitionTo(3, "Going to place...")}
              onEditCapital={() => transitionTo(4, "Going to capital...")}
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
          {step < 3 ? (
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

/* ─── Step 4: Capital with dynamic financing preview ─── */
function CapitalStep({ value, business, subCategory, placeStatus, rentMonthly, scaleChoice, onChange, error }: {
  value: number; business: BusinessCategory | null;
  subCategory: BusinessSubCategory | null; placeStatus: PlaceStatus;
  rentMonthly: number; scaleChoice: ScaleChoice;
  onChange: (v: number) => void; error: string;
}) {
  const showPreview = value > 0;

  // Business-context aware estimate from the shared financial engine — no
  // universal multiplier. Same model the feasibility dashboard later uses.
  const estimate = useMemo(() => {
    if (!showPreview) return null;
    const bid = business?.id ?? "other";
    const range = startupCostRange(bid);
    const options = { subCategoryId: subCategory?.id ?? null, placeStatus, rentMonthly, scaleChoice };
    const pc = calculateProjectCost(value, bid, options);
    const projectCost = pc.totalProjectCost;
    const fundingGap = Math.max(0, projectCost - value);
    const loan = calculateLoan(value, bid, options);
    return {
      range,
      projectCost,
      fundingGap,
      financing: loan ? loan.loanAmount : 0,
      noFinancingNeeded: fundingGap <= 0,
      options,
    };
  }, [value, business, subCategory, placeStatus, rentMonthly, scaleChoice, showPreview]);

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
          <IndianRupee className="h-6 w-6" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold">How much can you contribute?</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          This is the amount you can invest from your own savings. We'll use it to estimate financing options and financial feasibility.
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

      {showPreview && estimate && (
        <div className="rounded-xl bg-[#F4F8EF] border border-border/60 p-4 animate-fade-in space-y-3">
          <p className="text-sm text-muted-foreground">
            💡 {business ? (
              <>
                For <span className="font-semibold text-foreground">{business.icon} {business.name}</span>
                {subCategory ? <> — <span className="font-semibold text-foreground">{subCategory.name}</span></> : null}, with a <span className="font-semibold text-foreground">{PLACE_LABELS[placeStatus]}</span> arrangement, the estimated setup requirement is{" "}
                <span className="font-semibold text-foreground">{formatIndianCurrency(estimate.projectCost)}</span> at the <span className="font-semibold text-foreground">{SCALE_OPTIONS.find((s) => s.value === scaleChoice)?.label}</span>.
              </>
            ) : (
              "Based on a typical small-business setup:"
            )}
          </p>

          <div className="rounded-lg border border-border/60 bg-white divide-y divide-border/60 overflow-hidden text-sm">
            <PreviewRow label="Estimated setup requirement" value={formatIndianCurrency(estimate.projectCost)} note="business type + place + scale" />
            <PreviewRow label="Your contribution" value={formatIndianCurrency(value)} />
            {estimate.noFinancingNeeded ? (
              <PreviewRow label="External financing needed" value="None estimated" note="your contribution covers this setup" highlight />
            ) : (
              <PreviewRow
                label="Estimated funding requirement"
                value={formatIndianCurrency(estimate.fundingGap)}
                note={`potential financing up to ${formatIndianCurrency(estimate.financing)}, subject to scheme terms`}
                highlight
              />
            )}
          </div>

          <details className="rounded-lg border border-border/60 bg-white/70 px-3 py-2 text-xs">
            <summary className="cursor-pointer select-none font-semibold text-primary">
              How did GramUdaan estimate this?
            </summary>
            <ul className="mt-2 space-y-1 text-muted-foreground list-none">
              <li>• The selected business type ({business?.name}{subCategory ? ` — ${subCategory.name}` : ""}) and its typical setup requirements</li>
              <li>• Your place arrangement: {PLACE_LABELS[placeStatus]}{placeStatus === "rent" && rentMonthly > 0 ? ` (₹${rentMonthly.toLocaleString("en-IN")}/month rent)` : ""} — owned place means no purchase cost</li>
              <li>• The chosen scale: {SCALE_OPTIONS.find((s) => s.value === scaleChoice)?.label}</li>
              <li>• Your available contribution against that setup</li>
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground/80">
              These are preliminary estimates for decision support. Actual costs and financing depend on local prices, business scale, lender requirements and applicable schemes.
            </p>
          </details>
        </div>
      )}

      {!showPreview && (
        <div className="rounded-xl bg-muted/50 border border-border/60 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            💡 Don't worry about the exact amount. You can always adjust this later. We'll show you loan options based on your contribution.
          </p>
        </div>
      )}
    </div>
  );
}

function PreviewRow({ label, value, note, highlight }: {
  label: string; value: string; note?: string; highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className={cn("font-bold", highlight ? "text-primary" : "text-foreground")}>{value}</span>
        {note && <span className="block text-[10px] text-muted-foreground">{note}</span>}
      </span>
    </div>
  );
}

/* ─── Step 5: Review ─── */
function ReviewStep({ location, radius, business, capital, subCategory, placeStatus, rentMonthly, scaleChoice, onEditLocation, onEditBusiness, onEditType, onEditPlace, onEditCapital }: {
  location: Location | null; radius: number; business: BusinessCategory | null;
  capital: number; subCategory: BusinessSubCategory | null; placeStatus: PlaceStatus; rentMonthly: number; scaleChoice: ScaleChoice;
  onEditLocation: () => void; onEditBusiness: () => void; onEditType: () => void; onEditPlace: () => void; onEditCapital: () => void;
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
          sub={placeStatus === "rent" && subCategory ? `Monthly rent: ${formatIndianCurrency(rentMonthly || 0)}` : undefined} onEdit={onEditPlace} />
        <ReviewRow icon={<TrendingUp className="h-4 w-4" />} label="Scale"
          value={SCALE_OPTIONS.find((s) => s.value === scaleChoice)?.label || "Recommended"}
          sub={SCALE_OPTIONS.find((s) => s.value === scaleChoice)?.hint} onEdit={onEditType} />
        <ReviewRow icon={<IndianRupee className="h-4 w-4" />} label="Your Contribution"
          value={capital > 0 ? formatIndianCurrency(capital) : "Not entered"}
          sub="Amount you can contribute from savings" onEdit={onEditCapital} />
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
