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

export type CostPriority = "essential" | "important" | "optional";

export interface CostComponent {
  id: string;
  label: string;
  labelHi: string;
  amount: number;
  source: "CALCULATED" | "ESTIMATED" | "USER_PROVIDED";
  /** Where this cost sits in the spending priority — drives capital allocation. */
  priority: CostPriority;
}

export interface InvestmentTiers {
  /** Small start — essential + important costs only, at small scale. */
  minimum: number;
  /** Typical setup — all components at recommended scale. */
  recommended: number;
  /** Larger capacity — all components at expanded scale. */
  expanded: number;
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
  /** User-edited component amounts (₹), keyed by component id. Override the estimate. */
  overrides?: Partial<Record<string, number>>;
  /** Internal: drop optional components (used for the minimum-start tier). */
  dropOptional?: boolean;
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

/* ─── Spending priority by component (business-aware) ───
 * Default order for a typical rural micro-business:
 *   1. Infrastructure / place  2. Essential equipment  3. Initial stock
 *   4. Licensing  5. Minimum working capital  6. Marketing / expansion.
 * Business families can fine-tune it (e.g. dairy: animals+feed before
 * machinery; clothing: display/marketing matter more early on).
 */

const DEFAULT_PRIORITY: Record<ComponentId, CostPriority> = {
  land: "essential",
  construction: "essential",
  equipment: "essential",
  inventory: "essential",
  workingCapital: "important",
  licensing: "essential",
  other: "optional",
};

const PRIORITY_OVERRIDES: Record<string, Partial<Record<ComponentId, CostPriority>>> = {
  // Animals + feed (inventory) and shed come before machinery.
  dairy: { equipment: "important" },
  poultry: { equipment: "important" },
  "poultry-feed": { equipment: "important" },
  // Display/furniture (equipment) is secondary to stock in a clothing shop;
  // marketing matters early for garments.
  clothing: { equipment: "important", other: "important" },
  // Services sell skills — stock is optional, marketing matters.
  services: { inventory: "optional", other: "important" },
  "mobile-repair": { inventory: "important" },
  // Stock-focused retail: everything else supports the inventory.
  grocery: {},
  "agri-inputs": {},
  // Manufacturing is machinery-heavy; raw material bought as needed.
  "food-processing": { inventory: "important" },
  manufacturing: { inventory: "important", other: "important" },
  other: {},
};

function componentPriority(businessId: string, id: ComponentId): CostPriority {
  const bizOverrides = PRIORITY_OVERRIDES[businessId] ?? {};
  return bizOverrides[id] ?? DEFAULT_PRIORITY[id];
}

export function buildInvestmentTiers(businessId: string, ctx: CostContext = {}): InvestmentTiers {
  // Tiers are reference points for planning — user edits never move them.
  const base = { ...ctx, overrides: undefined };
  return {
    minimum: buildCostBreakdown(businessId, { ...base, scaleChoice: "small", dropOptional: true }).total,
    recommended: buildCostBreakdown(businessId, { ...base, scaleChoice: "recommended" }).total,
    expanded: buildCostBreakdown(businessId, { ...base, scaleChoice: "expanded" }).total,
  };
}

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

  // Minimum-start tier: drop the optional components (marketing, extras).
  if (ctx.dropOptional) {
    for (const m of COMPONENT_META) {
      if (componentPriority(businessId, m.id) === "optional") amounts[m.id] = 0;
    }
  }

  // User edits win over the model — the source of truth still recomputes
  // everything downstream from these numbers (plan, dashboard, report).
  let adjustedAny = false;
  if (ctx.overrides) {
    for (const m of COMPONENT_META) {
      const v = ctx.overrides[m.id];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
        amounts[m.id] = Math.round(v);
        adjustedAny = true;
      }
    }
  }
  if (adjustedAny) {
    notes.push("You adjusted individual cost estimates — the total now reflects your own numbers.");
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
    priority: componentPriority(businessId, m.id),
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