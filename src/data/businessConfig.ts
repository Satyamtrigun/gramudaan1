/* ────────────────────────────────────────────────────────────────────────────
 * GramUdaan — Business Configuration Engine
 *
 * Data-driven sub-categories, place/workspace types, cost weights and
 * revenue models per business. A new business/sub-category is added here in
 * configuration — no frontend or engine rewrite required.
 *
 * All figures are ESTIMATES for decision support, never exact quotes.
 * ──────────────────────────────────────────────────────────────────────────── */

export type PlaceType = "shop" | "land" | "workspace" | "shed" | "none";

/** How the user will obtain the place the business needs. */
export type PlaceStatus =
  | "own"        // already has land/shop/workspace
  | "rent"       // will rent
  | "buy"        // will buy
  | "build"      // will build/construct
  | "not-needed" // business does not need a separate place
  | "unsure";    // not decided yet

export const PLACE_STATUS_OPTIONS: { value: PlaceStatus; label: string; labelHi: string; hint: string }[] = [
  { value: "own", label: "I already have it", labelHi: "मेरे पास पहले से है", hint: "Land/shop already owned — no purchase cost added" },
  { value: "rent", label: "I will rent", labelHi: "किराए पर लूँगा", hint: "Monthly rent is included in running costs" },
  { value: "buy", label: "I will buy", labelHi: "खरीदूँगा", hint: "Purchase cost is added to the setup requirement" },
  { value: "build", label: "I will build / construct", labelHi: "बनवाऊँगा", hint: "Construction cost is added (no land purchase)" },
  { value: "not-needed", label: "No separate place needed", labelHi: "अलग जगह की ज़रूरत नहीं", hint: "Business runs from home or existing space" },
  { value: "unsure", label: "Not sure yet", labelHi: "अभी पक्का नहीं", hint: "We'll estimate with a typical arrangement" },
];

/** Cost breakdown weights — fractions of the total setup requirement. */
export interface CostWeights {
  land: number;
  construction: number;
  equipment: number;
  inventory: number;
  workingCapital: number;
  licensing: number;
  other: number;
}

export interface BusinessQuestion {
  id: string;
  label: string;
  labelHi?: string;
  options?: { value: string; label: string; labelHi?: string }[];
  placeholder?: string;
}

export interface BusinessSubCategory {
  id: string;
  categoryId: string;      // matches BusinessCategory.category / business id family
  businessId: string;      // the parent business this belongs to
  name: string;
  nameHi: string;
  icon: string;
  description: string;
  descriptionHi: string;
  placeType: PlaceType;
  costWeights: CostWeights;
  /** Typical monthly revenue range (₹) at recommended scale. */
  monthlyRevenue: [number, number];
  /** Fixed monthly costs (₹) — rent, salaries, electricity base. */
  monthlyFixedCosts: number;
  /** Variable costs as a fraction of revenue (inventory, raw materials…). */
  variableCostRatio: number;
  /** Months to reach steady-state revenue (ramp-up period). */
  rampMonths: number;
  questions: BusinessQuestion[];
}

/* ─── helpers ─── */

const W = (
  land: number, construction: number, equipment: number,
  inventory: number, workingCapital: number,
  licensing = 0.02, other = 0.03,
): CostWeights => ({ land, construction, equipment, inventory, workingCapital, licensing, other });

function def(
  id: string,
  categoryId: string,
  businessId: string,
  name: string,
  nameHi: string,
  icon: string,
  description: string,
  descriptionHi: string,
  placeType: PlaceType,
  costWeights: CostWeights,
  monthlyRevenue: [number, number],
  monthlyFixedCosts: number,
  variableCostRatio: number,
  rampMonths: number,
  questions: BusinessQuestion[] = [],
): BusinessSubCategory {
  return { id, categoryId, businessId, name, nameHi, icon, description, descriptionHi, placeType, costWeights, monthlyRevenue, monthlyFixedCosts, variableCostRatio, rampMonths, questions };
}

/* ─── Scale multipliers (revenue/investment at each scale) ─── */
export const SCALE_FACTORS = {
  small: 0.6,
  recommended: 1.0,
  expanded: 1.6,
} as const;
export type ScaleChoice = keyof typeof SCALE_FACTORS;
export const SCALE_OPTIONS: { value: ScaleChoice; label: string; labelHi: string; hint: string }[] = [
  { value: "small", label: "Small Start", labelHi: "छोटी शुरुआत", hint: "Minimum setup — lowest risk, lower revenue" },
  { value: "recommended", label: "Recommended Scale", labelHi: "अनुशंसित पैमाना", hint: "Typical setup for this business type" },
  { value: "expanded", label: "Expanded Scale", labelHi: "बड़ा पैमाना", hint: "Larger capacity — more investment, more revenue" },
];

/* ─── Catalog ─── */

export const BUSINESS_SUB_CATEGORIES: BusinessSubCategory[] = [
  /* ── Dairy ── */
  def("dairy-farming", "agriculture", "dairy", "Dairy Farming (Own Animals)", "डेयरी फार्मिंग", "🐄",
    "Own cattle — milk production and sale to local buyers or dairy", "खुद की गाय/भैंस से दूध उत्पादन और बिक्री",
    "land", W(0.25, 0.25, 0.15, 0.1, 0.2), [30000, 50000], 6000, 0.6, 4,
    [
      { id: "animals", label: "How many animals do you plan to start with?", labelHi: "कितने जानवरों से शुरू करेंगे?", options: [{ value: "2", label: "2" }, { value: "5", label: "5" }, { value: "10", label: "10+" }] },
      { id: "shed", label: "Do you have a shed for the animals?", labelHi: "क्या जानवरों के लिए शेड है?", options: [{ value: "yes", label: "Yes", labelHi: "हाँ" }, { value: "no", label: "No, I will arrange", labelHi: "नहीं, इंतज़ाम करूँगा" }] },
    ]),
  def("dairy-products", "agriculture", "dairy", "Dairy Products (Paneer / Curd / Ghee)", "डेयरी उत्पाद", "🧀",
    "Value-added milk products for local shops and households", "पनीर, दही, घी जैसे उत्पाद बनाकर बेचना",
    "workspace", W(0.08, 0.18, 0.28, 0.15, 0.26), [25000, 45000], 7000, 0.62, 3,
    [
      { id: "product", label: "Which product will be your main item?", labelHi: "मुख्य उत्पाद क्या होगा?", options: [{ value: "paneer", label: "Paneer" }, { value: "curd", label: "Curd / Dahi" }, { value: "ghee", label: "Ghee" }, { value: "mixed", label: "Multiple products" }] },
    ]),
  def("milk-collection", "agriculture", "dairy", "Milk Collection & Supply", "दूध संग्रह", "🥛",
    "Collect milk from nearby farmers and supply to dairy/processing units", "आस-पास के किसानों से दूध इकट्ठा कर आपूर्ति",
    "shop", W(0.05, 0.12, 0.18, 0.1, 0.48), [40000, 70000], 8000, 0.75, 3, []),

  /* ── Poultry ── */
  def("broiler", "agriculture", "poultry", "Broiler (Chicken Meat) Farming", "ब्रॉयलर मुर्गी पालन", "🍗",
    "Raising broiler chickens for meat sale to local markets", "मांस के लिए ब्रॉयलर मुर्गी पालन",
    "land", W(0.18, 0.3, 0.15, 0.1, 0.22), [40000, 70000], 9000, 0.7, 3,
    [
      { id: "birds", label: "How many birds do you plan to raise per batch?", labelHi: "प्रति बैच कितनी मुर्गियाँ?", options: [{ value: "200", label: "200" }, { value: "500", label: "500" }, { value: "1000", label: "1000+" }] },
    ]),
  def("layer", "agriculture", "poultry", "Layer (Egg) Farming", "लेयर अंडा उत्पादन", "🥚",
    "Laying hens for regular egg production and sale", "अंडे के लिए लेयर मुर्गी पालन",
    "land", W(0.18, 0.3, 0.15, 0.1, 0.22), [35000, 65000], 9000, 0.68, 4,
    [
      { id: "birds", label: "How many laying hens will you start with?", labelHi: "कितनी मुर्गियों से शुरुआत?", options: [{ value: "200", label: "200" }, { value: "500", label: "500" }, { value: "1000", label: "1000+" }] },
    ]),

  /* ── Poultry Feed ── */
  def("feed-retail", "retail", "poultry-feed", "Feed Retail Store", "चारा दुकान", "🌾",
    "Retail poultry and cattle feed, supplements and inputs", "मुर्गी/पशु चारा और सप्लीमेंट की दुकान",
    "shop", W(0.1, 0.08, 0.08, 0.4, 0.29), [30000, 50000], 6000, 0.82, 2, []),
  def("feed-mfg", "retail", "poultry-feed", "Feed Mixing / Manufacturing", "चारा निर्माण", "🏭",
    "Small-scale feed mixing and supply to local farms", "छोटे पैमाने पर चारा मिक्सिंग",
    "workspace", W(0.1, 0.2, 0.32, 0.15, 0.18), [45000, 80000], 10000, 0.75, 4, []),

  /* ── Grocery ── */
  def("kirana", "retail", "grocery", "Kirana Store", "किराना दुकान", "🏪",
    "Daily essentials, staples, FMCG and household items", "दैनिक आवश्यक वस्तुओं की दुकान",
    "shop", W(0.14, 0.1, 0.1, 0.34, 0.27), [45000, 75000], 5000, 0.76, 2,
    [
      { id: "shopSize", label: "Approximate shop size?", labelHi: "दुकान का आकार?", options: [{ value: "small", label: "Small (~100 sq ft)", labelHi: "छोटी" }, { value: "medium", label: "Medium (~200 sq ft)", labelHi: "मध्यम" }, { value: "large", label: "Large (300+ sq ft)", labelHi: "बड़ी" }] },
    ]),
  def("mini-supermarket", "retail", "grocery", "Mini Supermarket", "मिनी सुपरमार्केट", "🛒",
    "Wider range of groceries, packaged goods and household items", "व्यापक किराना और पैकेज्ड सामान",
    "shop", W(0.16, 0.12, 0.14, 0.3, 0.23), [55000, 95000], 9000, 0.76, 3, []),
  def("ration-shop", "retail", "grocery", "Ration / PDS Shop", "राशन दुकान", "🛍️",
    "Subsidized ration distribution with general grocery sales", "राशन वितरण और किराना",
    "shop", W(0.1, 0.08, 0.08, 0.38, 0.31), [45000, 75000], 6000, 0.78, 2, []),

  /* ── Clothing ── */
  def("garments", "retail", "clothing", "Ready-made Garments", "रेडीमेड कपड़े", "👕",
    "Selling ready-made clothes for men, women and children", "तैयार कपड़ों की दुकान",
    "shop", W(0.12, 0.1, 0.12, 0.36, 0.25), [25000, 45000], 6000, 0.7, 2, []),
  def("tailoring-shop", "retail", "clothing", "Tailoring + Cloth Sales", "सिलाई और कपड़ा", "🧵",
    "Fabric sales with in-house tailoring services", "कपड़ा बिक्री और सिलाई सेवा",
    "shop", W(0.1, 0.08, 0.3, 0.25, 0.22), [20000, 35000], 4000, 0.45, 3, []),
  def("fabric-store", "retail", "clothing", "Fabric / Textile Store", "कपड़ा दुकान", "🧶",
    "Selling dress material, sarees, and unstitched fabric", "साड़ी, सूट और कपड़े",
    "shop", W(0.12, 0.08, 0.08, 0.42, 0.25), [25000, 40000], 6000, 0.72, 2, []),

  /* ── Mobile Repair ── */
  def("repair-shop", "services", "mobile-repair", "Mobile Repair Shop", "मोबाइल रिपेयर शॉप", "📱",
    "Phone and tablet repair services", "फोन मरम्मत सेवा",
    "shop", W(0.1, 0.1, 0.32, 0.18, 0.25), [20000, 40000], 5000, 0.3, 2,
    [
      { id: "repairs", label: "How many repairs do you expect per day?", labelHi: "प्रतिदिन कितनी मरम्मत?", options: [{ value: "2", label: "2–3" }, { value: "5", label: "5–6" }, { value: "10", label: "10+" }] },
    ]),
  def("accessories", "services", "mobile-repair", "Accessories + Recharge", "एक्सेसरीज़ और रिचार्ज", "🔌",
    "Chargers, covers, screen guards, recharges and small repairs", "मोबाइल एक्सेसरीज़ और रिचार्ज",
    "shop", W(0.1, 0.08, 0.1, 0.4, 0.27), [25000, 45000], 5000, 0.55, 2, []),
  def("repair-resale", "services", "mobile-repair", "Repair + Refurbished Resale", "रिपेयर और रिसेल", "🔄",
    "Repair services with sale of refurbished phones", "मरम्मत और पुराने फोन की बिक्री",
    "shop", W(0.1, 0.08, 0.22, 0.28, 0.27), [30000, 55000], 6000, 0.5, 3, []),

  /* ── Food Processing ── */
  def("spices", "manufacturing", "food-processing", "Spices & Masala", "मसाले", "🌶️",
    "Grinding, packing and selling spices and masala", "मसाला पीसना और पैकिंग",
    "workspace", W(0.08, 0.18, 0.3, 0.16, 0.23), [30000, 55000], 8000, 0.6, 3, []),
  def("pickles", "manufacturing", "food-processing", "Pickles & Preserves", "अचार", "🫙",
    "Making pickles, jams and preserves for local sale", "अचार और परिरक्षित खाद्य पदार्थ",
    "workspace", W(0.06, 0.16, 0.26, 0.2, 0.27), [25000, 45000], 7000, 0.55, 3, []),
  def("snacks", "manufacturing", "food-processing", "Snacks & Namkeen", "नमकीन और स्नैक्स", "🍿",
    "Namkeen, snacks and packaged food production", "नमकीन और स्नैक्स बनाना",
    "workspace", W(0.08, 0.18, 0.3, 0.16, 0.23), [30000, 55000], 8000, 0.6, 3, []),
  def("bakery", "manufacturing", "food-processing", "Bakery Items", "बेकरी", "🥖",
    "Bread, biscuits, cakes and bakery products", "ब्रेड, बिस्कुट, केक",
    "workspace", W(0.08, 0.18, 0.32, 0.14, 0.23), [30000, 50000], 9000, 0.55, 3, []),

  /* ── Agriculture Inputs ── */
  def("seed-fertilizer", "retail", "agri-inputs", "Seed & Fertilizer Store", "बीज और खाद दुकान", "🌱",
    "Seeds, fertilizers, and crop inputs for local farmers", "बीज, उर्वरक और कृषि इनपुट",
    "shop", W(0.1, 0.08, 0.08, 0.42, 0.27), [40000, 80000], 8000, 0.75, 2, []),
  def("pesticide-store", "retail", "agri-inputs", "Pesticide Store", "कीटनाशक दुकान", "🧪",
    "Pesticides and plant-protection products (licensed)", "कीटनाशक और फसल सुरक्षा उत्पाद",
    "shop", W(0.1, 0.08, 0.08, 0.42, 0.27), [30000, 55000], 7000, 0.7, 2, []),
  def("farm-equipment", "retail", "agri-inputs", "Farm Equipment & Tools", "कृषि उपकरण", "🚜",
    "Small farm tools, pumps, sprayers and equipment", "कृषि उपकरण और औज़ार",
    "shop", W(0.1, 0.08, 0.18, 0.34, 0.25), [35000, 60000], 8000, 0.72, 2, []),

  /* ── Generic Retail ── */
  def("general-store", "retail", "retail", "General Store", "जनरल स्टोर", "🏬",
    "Mixed daily-need and variety store", "दैनिक उपयोग की वस्तुओं का स्टोर",
    "shop", W(0.14, 0.1, 0.1, 0.34, 0.27), [35000, 60000], 5000, 0.74, 2, []),
  def("hardware", "retail", "retail", "Hardware Store", "हार्डवेयर दुकान", "🔩",
    "Tools, fittings, paints and hardware items", "औज़ार, फिटिंग और पेंट",
    "shop", W(0.1, 0.08, 0.1, 0.4, 0.27), [30000, 60000], 8000, 0.72, 2, []),
  def("electronics", "retail", "retail", "Electronics & Appliances", "इलेक्ट्रॉनिक्स", "📺",
    "Small electronics, fans, lights and appliances", "इलेक्ट्रॉनिक सामान",
    "shop", W(0.1, 0.08, 0.1, 0.38, 0.29), [35000, 65000], 9000, 0.72, 3, []),
  def("stationery", "retail", "retail", "Stationery & Books", "स्टेशनरी", "📚",
    "School supplies, stationery and books", "स्टेशनरी और किताबें",
    "shop", W(0.12, 0.08, 0.08, 0.4, 0.27), [15000, 30000], 5000, 0.65, 2, []),

  /* ── Generic Services ── */
  def("tailoring-svc", "services", "services", "Tailoring", "सिलाई सेवा", "🪡",
    "Custom tailoring and stitching services", "कस्टम सिलाई सेवा",
    "shop", W(0.1, 0.08, 0.34, 0.16, 0.27), [18000, 32000], 4000, 0.3, 3, []),
  def("salon", "services", "services", "Salon / Beauty Parlour", "सैलून", "💇",
    "Hair and beauty services", "हेयर और ब्यूटी सेवाएं",
    "shop", W(0.1, 0.1, 0.3, 0.18, 0.27), [15000, 30000], 5000, 0.25, 3, []),
  def("digital-center", "services", "services", "Digital Service Center", "डिजिटल सेवा केंद्र", "🖥️",
    "CSC-style services — forms, printing, payments, internet", "डिजिटल सेवाएं — फॉर्म, प्रिंट, पेमेंट",
    "shop", W(0.08, 0.1, 0.42, 0.08, 0.27), [15000, 30000], 5000, 0.25, 2, []),
  def("repair-svc", "services", "services", "Repair Services", "मरम्मत सेवा", "🛠️",
    "General repair — electrical, pumps, appliances", "बिजली, पंप, उपकरण मरम्मत",
    "shop", W(0.08, 0.08, 0.32, 0.16, 0.31), [20000, 35000], 5000, 0.3, 3, []),

  /* ── Manufacturing ── */
  def("food-processing-mfg", "manufacturing", "manufacturing", "Small Food Processing", "खाद्य प्रसंस्करण", "🥫",
    "Small-scale processing of local produce", "स्थानीय उपज का प्रसंस्करण",
    "workspace", W(0.08, 0.2, 0.34, 0.12, 0.21), [35000, 70000], 9000, 0.6, 4, []),
  def("wood-furniture", "manufacturing", "manufacturing", "Wood / Furniture", "लकड़ी का फर्नीचर", "🪑",
    "Furniture making and repair with carpentry tools", "फर्नीचर बनाना और मरम्मत",
    "workspace", W(0.1, 0.2, 0.38, 0.06, 0.21), [25000, 50000], 7000, 0.55, 4, []),
  def("agro-processing", "manufacturing", "manufacturing", "Agro Processing", "कृषि प्रसंस्करण", "🌾",
    "Flour, oil, rice or pulse processing units", "आटा, तेल, चावल प्रसंस्करण",
    "workspace", W(0.1, 0.22, 0.34, 0.1, 0.19), [35000, 70000], 9000, 0.6, 4, []),

  /* ── Other / own idea ── */
  def("my-idea", "other", "other", "My Own Business Idea", "मेरा अपना विचार", "💡",
    "A unique business not in the list — we'll use a general small-business model", "सूची में नहीं है — सामान्य मॉडल इस्तेमाल होगा",
    "none", W(0.08, 0.12, 0.15, 0.25, 0.35), [20000, 40000], 6000, 0.6, 3, []),
];

/* ─── Lookups ─── */

export function getSubCategoriesForBusiness(businessId: string): BusinessSubCategory[] {
  return BUSINESS_SUB_CATEGORIES.filter((s) => s.businessId === businessId);
}

export function getSubCategory(id: string | null): BusinessSubCategory | null {
  if (!id) return null;
  return BUSINESS_SUB_CATEGORIES.find((s) => s.id === id) ?? null;
}

export function getDefaultSubCategory(businessId: string): BusinessSubCategory | null {
  return getSubCategoriesForBusiness(businessId)[0] ?? null;
}

/** Always returns a usable sub-category (falls back to the generic one). */
export function resolveSubCategory(businessId: string, subCategoryId: string | null | undefined): BusinessSubCategory {
  return (
    getSubCategory(subCategoryId ?? null) ??
    getDefaultSubCategory(businessId) ??
    getSubCategory("my-idea") ??
    BUSINESS_SUB_CATEGORIES[0]
  );
}

/* ─── Startup cost ranges (₹) per business — canonical estimates ─── */

export interface BusinessStartupRange {
  min: number;
  max: number;
}

export const BUSINESS_STARTUP_RANGES: Record<string, BusinessStartupRange> = {
  dairy: { min: 100000, max: 500000 },
  grocery: { min: 50000, max: 300000 },
  poultry: { min: 150000, max: 800000 },
  "poultry-feed": { min: 75000, max: 400000 },
  clothing: { min: 80000, max: 500000 },
  "mobile-repair": { min: 30000, max: 200000 },
  "food-processing": { min: 100000, max: 600000 },
  "agri-inputs": { min: 100000, max: 500000 },
  retail: { min: 50000, max: 300000 },
  services: { min: 20000, max: 200000 },
  manufacturing: { min: 200000, max: 1000000 },
  other: { min: 50000, max: 500000 },
};

/** Typical project size band (₹) for a business id, with a safe default. */
export function startupCostRange(businessId: string): BusinessStartupRange {
  return BUSINESS_STARTUP_RANGES[businessId] ?? BUSINESS_STARTUP_RANGES.other;
}

export function getSubCategoryGroupName(businessId: string): string {
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