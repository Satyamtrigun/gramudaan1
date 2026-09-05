import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Location } from "@/data/locations";
import type { BusinessCategory } from "@/data/businesses";
import type { FeasibilityData } from "@/data/feasibility-types";
import type { DemoScenario } from "@/data/demos";
import type { PlaceStatus, ScaleChoice, BusinessSubCategory } from "@/data/businessConfig";
import { locations } from "@/data/locations";
import { businessCategories } from "@/data/businesses";
import { generateFeasibility } from "@/data/feasibility";

export interface FeasibilityOptions {
  subCategoryId?: string | null;
  placeStatus?: PlaceStatus;
  rentMonthly?: number;
  scaleChoice?: ScaleChoice;
  businessAnswers?: Record<string, string>;
}

interface OnboardingState {
  location: Location | null;
  radius: number;
  business: BusinessCategory | null;
  subCategory: BusinessSubCategory | null;
  placeStatus: PlaceStatus;
  rentMonthly: number;
  scaleChoice: ScaleChoice;
  businessAnswers: Record<string, string>;
  /** USER_CAPITAL — money the user can invest from their own pocket. */
  capital: number;
  /** TARGET_INVESTMENT — what the user plans/willing to invest (distinct from capital). */
  targetInvestment: number;
  /** Family / partner / grant / other legitimate funding (combined ₹). */
  otherFunding: number;
  feasibility: FeasibilityData | null;
  isAnalyzing: boolean;
}

interface OnboardingContextType extends OnboardingState {
  setLocation: (loc: Location | null) => void;
  setRadius: (r: number) => void;
  setBusiness: (biz: BusinessCategory | null) => void;
  setSubCategory: (s: BusinessSubCategory | null) => void;
  setPlaceStatus: (p: PlaceStatus) => void;
  setRentMonthly: (r: number) => void;
  setScaleChoice: (s: ScaleChoice) => void;
  setBusinessAnswer: (id: string, value: string) => void;
  setCapital: (c: number) => void;
  setTargetInvestment: (v: number) => void;
  setOtherFunding: (v: number) => void;
  setFeasibility: (f: FeasibilityData | null) => void;
  setIsAnalyzing: (a: boolean) => void;
  reset: () => void;
  loadDemo: (demo: DemoScenario) => void;
}

const defaultState: OnboardingState = {
  location: null,
  radius: 5,
  business: null,
  subCategory: null,
  placeStatus: "unsure",
  rentMonthly: 0,
  scaleChoice: "recommended",
  businessAnswers: {},
  capital: 0,
  targetInvestment: 0,
  otherFunding: 0,
  feasibility: null,
  isAnalyzing: false,
};

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(defaultState);

  const setLocation = (location: Location | null) =>
    setState((s) => ({ ...s, location }));
  const setRadius = (radius: number) =>
    setState((s) => ({ ...s, radius }));
  const setBusiness = (business: BusinessCategory | null) =>
    setState((s) => ({ ...s, business, subCategory: null }));
  const setSubCategory = (subCategory: BusinessSubCategory | null) =>
    setState((s) => ({ ...s, subCategory }));
  const setPlaceStatus = (placeStatus: PlaceStatus) =>
    setState((s) => ({ ...s, placeStatus }));
  const setRentMonthly = (rentMonthly: number) =>
    setState((s) => ({ ...s, rentMonthly }));
  const setScaleChoice = (scaleChoice: ScaleChoice) =>
    setState((s) => ({ ...s, scaleChoice }));
  const setBusinessAnswer = (id: string, value: string) =>
    setState((s) => ({ ...s, businessAnswers: { ...s.businessAnswers, [id]: value } }));
  const setCapital = (capital: number) =>
    setState((s) => ({ ...s, capital }));
  const setTargetInvestment = (targetInvestment: number) =>
    setState((s) => ({ ...s, targetInvestment }));
  const setOtherFunding = (otherFunding: number) =>
    setState((s) => ({ ...s, otherFunding }));
  const setFeasibility = (feasibility: FeasibilityData | null) =>
    setState((s) => ({ ...s, feasibility }));
  const setIsAnalyzing = (isAnalyzing: boolean) =>
    setState((s) => ({ ...s, isAnalyzing }));
  const reset = () => setState(defaultState);

  const loadDemo = useCallback((demo: DemoScenario) => {
    const loc = locations.find((l) => l.id === demo.locationId) || locations[0];
    const biz = businessCategories.find((b) => b.id === demo.businessId) || businessCategories[0];
    const feasibility = generateFeasibility(demo.businessId, demo.capital, demo.locationId);
    setState({
      ...defaultState,
      location: loc,
      business: biz,
      capital: demo.capital,
      feasibility,
    });
  }, []);

  return (
    <OnboardingContext.Provider
      value={{
        ...state,
        setLocation,
        setRadius,
        setBusiness,
        setSubCategory,
        setPlaceStatus,
        setRentMonthly,
        setScaleChoice,
        setBusinessAnswer,
        setCapital,
        setTargetInvestment,
        setOtherFunding,
        setFeasibility,
        setIsAnalyzing,
        reset,
        loadDemo,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

const defaultContextValue: OnboardingContextType = {
  ...defaultState,
  setLocation: () => {},
  setRadius: () => {},
  setBusiness: () => {},
  setSubCategory: () => {},
  setPlaceStatus: () => {},
  setRentMonthly: () => {},
  setScaleChoice: () => {},
  setBusinessAnswer: () => {},
  setCapital: () => {},
  setTargetInvestment: () => {},
  setOtherFunding: () => {},
  setFeasibility: () => {},
  setIsAnalyzing: () => {},
  reset: () => {},
  loadDemo: () => {},
};

export function useOnboarding() {
  return useContext(OnboardingContext) ?? defaultContextValue;
}
