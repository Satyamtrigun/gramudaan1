/* ────────────────────────────────────────────────────────────────────────────
 * GramUdaan — Cost Model
 *
 * Business-specific, ownership-aware, transparent setup-cost breakdown.
 * Every component is labelled CALCULATED / ESTIMATED. The user's place
 * status (own/rent/buy/build/not-needed) directly changes what is included.
 * ──────────────────────────────────────────────────────────────────────────── */

import {
  getSubCategory,
  startupCostRange,
  type PlaceStatus,
  type ScaleChoice,
  SCALE_FACTORS,
} from "@/data/businessConfig";

export interface CostComponent {
  id: string;
  label: string;
  labelHi: string;
  amount: number;
  source: "CALCULATED" | "ESTIMATED" | "USER_PROVIDED";
}

export interface CostBreakdown {
  components: CostComponent[];
  total: number;
  landCost: number;
  constructionCost: number;
  equipmentCost: number;
  inventoryCost: number;
  workingCapitalCost: number;
  licensingCost: number;
  otherCost: number;
  /** Estimated monthly rent when the user will rent (₹/month). */
  monthlyRentEstimate: number;
  notes: string[];
}

export interface CostContext {
  subCategoryId?: string | null;
  placeStatus?: PlaceStatus;
  rentMonthly?: number;
  scaleChoice?: ScaleChoice;
}

type ComponentId = "land" | "construction" | "equipment" | "inventory" | "workingCapital" | "licensing" | "other";

const COMPONENT_META: { id: ComponentId; label: string; labelHi: string }[] = [
  { id: "land", label: "Land / Shop purchase", labelHi: "ज़मीन / दुकान खरीद" },
  { id: "construction", label: "Construction / Shed / Setup", labelHi: "निर्माण / शेड" },
  { id: "equipment", label: "Equipment & Machinery", labelHi: "उपकरण और मशीनरी" },
  { id: "inventory", label: "Initial Inventory / Stock", labelHi: "प्रारंभिक स्टॉक" },
  { id: "workingCapital", label: "Initial Working Capital", labelHi: "प्रारंभिक कार्यशील पूंजी" },
  { id: "licensing", label: "Licensing & Registration", labelHi: "लाइसेंस और पंजीकरण" },
  { id: "other", label: "Other startup costs", labelHi: "अन्य शुरुआती खर्च" },
];

/** Default monthly rent estimate by place type (₹) when renting. */
const RENT_BY_PLACE: Record<string, [number, number]> = {
  shop: [3000, 6000],
  workspace: [2000, 4000],
  shed: [1500, 3000],
  land: [1000, 2500],
  none: [0, 0],
};

/** Which component id maps to which cost field on CostBreakdown. */
type FieldKey = "landCost" | "constructionCost" | "equipmentCost" | "inventoryCost" | "workingCapitalCost" | "licensingCost" | "otherCost";
const FIELD_BY_COMPONENT: Record<string, FieldKey> = {
  land: "landCost",
  construction: "constructionCost",
  equipment: "equipmentCost",
  inventory: "inventoryCost",
  workingCapital: "workingCapitalCost",
  licensing: "licensingCost",
  other: "otherCost",
};

export function buildCostBreakdown(businessId: string, ctx: CostContext = {}): CostBreakdown {
  const { min, max } = startupCostRange(businessId);
  const typical = Math.round((min + max) / 2);
  const scaleFactor = SCALE_FACTORS[ctx.scaleChoice ?? "recommended"] ?? 1;
  const baseTotal = Math.round(typical * scaleFactor);

  const sub = getSubCategory(ctx.subCategoryId ?? null);
  const weights = sub
    ? sub.costWeights
    : { land: 0.15, construction: 0.15, equipment: 0.15, inventory: 0.25, workingCapital: 0.25, licensing: 0.02, other: 0.03 };

  const placeType = sub?.placeType ?? "shop";
  const placeStatus: PlaceStatus = ctx.placeStatus ?? "unsure";
  const isLandType = placeType === "land" || placeType === "shed";

  // Raw amounts from weights
  const amounts: Record<ComponentId, number> = {
    land: Math.round(baseTotal * weights.land),
    construction: Math.round(baseTotal * weights.construction),
    equipment: Math.round(baseTotal * weights.equipment),
    inventory: Math.round(baseTotal * weights.inventory),
    workingCapital: Math.round(baseTotal * weights.workingCapital),
    licensing: Math.round(baseTotal * weights.licensing),
    other: Math.round(baseTotal * weights.other),
  };

  const notes: string[] = [];

  // Ownership-aware adjustments
  if (placeStatus === "own") {
    // User already owns the place — remove the purchase cost.
    if (amounts.land > 0) {
      notes.push("You already own the required place — land/shop purchase cost is not added.");
      amounts.land = 0;
    }
    if (!isLandType && amounts.construction > 0) {
      // Ready-made shop in hand — no fit-out/construction required.
      notes.push("You already have the shop/workspace — setup/fit-out cost is reduced.");
      amounts.construction = Math.round(amounts.construction * 0.4);
    }
  } else if (placeStatus === "rent") {
    notes.push("You will rent the place — purchase cost is not added; a monthly rent estimate is included in running costs.");
    amounts.land = 0;
  } else if (placeStatus === "buy") {
    notes.push("You will buy the place — purchase cost is included; no construction cost assumed.");
    amounts.construction = 0;
  } else if (placeStatus === "build") {
    notes.push("You have land and will construct — land purchase cost is not added; construction cost is included.");
    amounts.land = 0;
  } else if (placeStatus === "not-needed") {
    notes.push("This business runs without a separate place — no land/shop or construction cost.");
    amounts.land = 0;
    amounts.construction = 0;
  } else {
    notes.push("Place status not decided — a typical arrangement is assumed. Update it in your profile to refine costs.");
  }

  // Monthly rent estimate (used by the operating model when renting)
  const [rentLow, rentHigh] = RENT_BY_PLACE[placeType] ?? RENT_BY_PLACE.shop;
  const rentGuess = rentHigh > 0 ? Math.round((rentLow + rentHigh) / 2) : 0;
  const monthlyRentEstimate = ctx.rentMonthly && ctx.rentMonthly > 0 ? ctx.rentMonthly : rentGuess;

  const components: CostComponent[] = COMPONENT_META.map((m) => ({
    id: m.id,
    label: m.label,
    labelHi: m.labelHi,
    amount: amounts[m.id] ?? 0,
    source: m.id === "licensing" || m.id === "other" ? "ESTIMATED" : "CALCULATED",
  }));

  const total = components.reduce((sum, c) => sum + c.amount, 0);

  const costs = {} as Record<FieldKey, number>;
  for (const c of components) {
    costs[FIELD_BY_COMPONENT[c.id]] = c.amount;
  }

  return {
    components,
    total,
    ...costs,
    monthlyRentEstimate,
    notes,
  };
}

/** Land/shop acquisition portion (₹) — what the user must arrange for the place itself. */
export function acquisitionCost(businessId: string, ctx: CostContext = {}): number {
  const b = buildCostBreakdown(businessId, ctx);
  return b.landCost + b.constructionCost;
}