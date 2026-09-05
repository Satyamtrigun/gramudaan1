/* ─── Government Scheme Knowledge Layer ───
 *
 * This module is the SINGLE source of truth for government scheme data used
 * across GramUdaan (dashboard section, report, AI advisor).
 *
 * Accuracy rules (hard requirements):
 *   • Only widely published, scheme-level facts are stored here.
 *   • Amounts/percentages that change or are lender-set are described
 *     qualitatively or marked "verify current terms".
 *   • No eligibility guarantees are ever produced by this data or the UI.
 *   • New schemes are added here without touching components.
 */

export type SchemeCategory = "loan" | "subsidy" | "guarantee";

export interface SchemeDocument {
  label: string;
  text: string;
}

export interface SchemeRule<T> {
  id: string;
  weight: number;
  /** evaluate the rule against a profile: "pass" | "partial" | "fail" | "na" */
  check: (p: SchemeProfileInput) => "pass" | "partial" | "fail" | "na";
  passReason: (p: SchemeProfileInput) => string;
  partialReason: (p: SchemeProfileInput) => string;
  failReason: (p: SchemeProfileInput) => string;
}

export interface GovernmentScheme {
  id: string;
  name: string;
  nameHi: string;
  category: SchemeCategory;
  /** used by the filter chips on the UI */
  filterTags: string[];
  shortDescription: string;
  about: string;
  scopeShort: string;
  supportStructure: SchemeDocument[];
  whoItSupports: string[];
  applicantCriteria: string[];
  /** deterministic matching rules — see engine/schemeMatching.ts */
  rules: SchemeRule<SchemeProfileInput>[];
  requiredDocuments: string[];
  applicationProcess: string[];
  officialSource: { name: string; url: string };
  note: string;
}

/** Input used by the deterministic matching rules. */
export interface SchemeProfileInput {
  businessId: string;
  businessName: string;
  businessCategory: string; // businesses.ts `category` (agriculture/retail/services/manufacturing/other)
  sector: string; // normalised sector tag computed by schemeMatching.ts
  state: string;
  district: string;
  contribution: number; // entrepreneur contribution (₹)
  projectCost: number; // total project cost (₹, compliant value when limit exceeded)
  fundingRequirement: number; // external funding required (₹)
}

export const SCHEME_DISCLAIMER =
  "GramUdaan provides an AI-assisted preliminary match only. Final eligibility, benefits and approval depend on the official scheme guidelines and the relevant authority/lender.";

export const SCHEME_VERIFY_NOTE =
  "Scheme information is provided for preliminary guidance. Please verify current terms with the official source before relying on it.";

export const SCHEME_FILTERS = [
  { id: "all", label: "All" },
  { id: "financing", label: "Financing" },
  { id: "subsidy", label: "Subsidy" },
  { id: "agriculture", label: "Agriculture / Allied" },
  { id: "msme", label: "MSME / New Enterprise" },
  { id: "rural", label: "Rural Enterprise" },
] as const;

/* ─── Shared rule fragments ─── */

const formatRuleRupees = (n: number): string =>
  n >= 10000000
    ? `₹${(n / 10000000).toFixed(n % 10000000 === 0 ? 0 : 1)} crore`
    : n >= 100000
      ? `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)} lakh`
      : n >= 1000
        ? `₹${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
        : `₹${n}`;

function broadScopeRule(
  sectors: string[],
  scopeShort: string,
): SchemeRule<SchemeProfileInput> {
  return {
    id: "business",
    weight: 40,
    check: (p) => (sectors.includes(p.sector) ? "pass" : "fail"),
    passReason: (p) =>
      `${p.businessName} fits the scheme's scope: ${scopeShort.toLowerCase()}.`,
    partialReason: () => "",
    failReason: (p) =>
      `Scheme scope is ${scopeShort.toLowerCase()}; ${p.businessName} may fall outside it — confirm with the implementing authority.`,
  };
}

function fundingRule(max?: number, min?: number): SchemeRule<SchemeProfileInput> {
  return {
    id: "funding",
    weight: 30,
    check: (p) => {
      if (max === undefined && min === undefined) return "na";
      if (min !== undefined && p.fundingRequirement < min) return "partial";
      if (max !== undefined && p.fundingRequirement > max) return "partial";
      return "pass";
    },
    passReason: (p) =>
      max !== undefined || min !== undefined
        ? `Your estimated financing need (${formatRuleRupees(p.fundingRequirement)}) fits this scheme's typical financing size.`
        : "",
    partialReason: (p) =>
      max !== undefined && p.fundingRequirement > max
        ? `Your estimated financing need (${formatRuleRupees(p.fundingRequirement)}) is above this scheme's typical range (${formatRuleRupees(max)}); the balance would need another source.`
        : min !== undefined && p.fundingRequirement < min
          ? `Your financing need (${formatRuleRupees(p.fundingRequirement)}) is smaller than the scheme's typical range — the scheme may still apply, but confirm with the lender.`
          : "",
    failReason: () => "",
  };
}

function projectScaleRule(max?: number): SchemeRule<SchemeProfileInput> {
  return {
    id: "project-scale",
    weight: 15,
    check: (p) => {
      if (max === undefined) return "na";
      return p.projectCost <= max ? "pass" : "partial";
    },
    passReason: (p) =>
      `Project size (${formatRuleRupees(p.projectCost)}) is within the scheme's admissible cost.`,
    partialReason: (p) =>
      `Project cost (${formatRuleRupees(p.projectCost)}) is above this scheme's ceiling (${formatRuleRupees(max!)}); restructuring the project may be needed.`,
    failReason: () => "",
  };
}

function locationRule(): SchemeRule<SchemeProfileInput> {
  return {
    id: "location",
    weight: 5,
    check: () => "pass",
    passReason: (p) =>
      p.state === "Uttar Pradesh"
        ? "National scheme — applicable in Uttar Pradesh (verify any state-specific guidelines)."
        : `Scheme applies to ${p.state} (verify state-specific guidelines).`,
    partialReason: () => "",
    failReason: () => "",
  };
}

function newUnitRule(note: string): SchemeRule<SchemeProfileInput> {
  return {
    id: "new-unit",
    weight: 10,
    check: () => "partial",
    passReason: () => "",
    partialReason: () => note,
    failReason: () => "",
  };
}

function guaranteedSectorScopeRule(
  sectors: string[],
  scopeShort: string,
): SchemeRule<SchemeProfileInput> {
  return broadScopeRule(sectors, scopeShort);
}

/* ─── Scheme catalog ─── */

const ALL_SECTORS = ["livestock", "retail", "services", "manufacturing", "food-processing", "trading"];

export const governmentSchemes: GovernmentScheme[] = [
  {
    id: "pm-mudra",
    name: "Pradhan Mantri MUDRA Yojana",
    nameHi: "प्रधानमंत्री मुद्रा योजना",
    category: "loan",
    filterTags: ["financing", "msme", "rural"],
    shortDescription: "Collateral-free micro-enterprise loans up to ₹10 lakh.",
    about:
      "PMMY provides institutional credit of up to ₹10 lakh to income-generating micro-enterprises in non-farm and allied-agri sectors (manufacturing, processing, trading and services). The scheme is delivered through banks, RRBs, small finance banks and MFIs, and is intended to help small entrepreneurs who generally lack collateral and formal credit history.",
    scopeShort:
      "micro-enterprises in manufacturing, processing, trading, services and allied-agri activities",
    supportStructure: [
      {
        label: "Loan categories",
        text: "Shishu — up to ₹50,000; Kishore — ₹50,001 to ₹5,00,000; Tarun — ₹5,00,001 to ₹10,00,000.",
      },
      {
        label: "Collateral",
        text: "Loans under the scheme are designed to be collateral-free; banks assess each case on its merit.",
      },
      {
        label: "Interest rate",
        text: "Set by the lending institution — it varies by bank, loan category and credit profile.",
      },
      {
        label: "Use of funds",
        text: "Working capital and/or term-loan needs of the micro-enterprise, as per bank norms.",
      },
    ],
    whoItSupports: [
      "Individuals starting or running a micro-enterprise (non-farm or allied-agri)",
      "Traders, shopkeepers, service providers, food processors, small manufacturers",
      "Existing micro-businesses seeking expansion credit",
    ],
    applicantCriteria: [
      "Indian citizen with a viable income-generating micro-enterprise plan",
      "Credit need up to ₹10 lakh for the enterprise",
      "No adverse credit history; bank viability appraisal applies",
    ],
    rules: [
      broadScopeRule(ALL_SECTORS, "micro-enterprises across manufacturing, trading, services and allied-agri activities"),
      fundingRule(1000000),
      locationRule(),
    ],
    requiredDocuments: [
      "Identity proof (Aadhaar, voter ID or similar)",
      "PAN card",
      "Brief business/project plan with cost estimate",
      "Bank account details",
      "Photographs and any documents requested by the bank",
    ],
    applicationProcess: [
      "Approach any commercial bank, Regional Rural Bank, small finance bank or MFI",
      "Submit the project plan and KYC documents",
      "Bank appraises viability and sanctions the loan",
      "Disbursal on completion of formalities",
    ],
    officialSource: {
      name: "MUDRA — Official Portal (mudra.org.in)",
      url: "https://www.mudra.org.in/offerings",
    },
    note: "Loan amount, interest and tenure are decided by the lending institution, not by GramUdaan or MUDRA alone.",
  },

  {
    id: "pmegp",
    name: "Prime Minister's Employment Generation Programme",
    nameHi: "प्रधानमंत्री रोजगार सृजन कार्यक्रम",
    category: "subsidy",
    filterTags: ["subsidy", "msme", "rural", "agriculture"],
    shortDescription:
      "Margin-money subsidy for setting up NEW micro-enterprises (manufacturing/service).",
    about:
      "PMEGP (implemented by KVIC, KVIB and District Industries Centres) helps first-generation entrepreneurs establish NEW micro-enterprises. Eligible projects receive a margin-money subsidy on the capital cost, with the balance financed by a bank loan. The programme is meant for new units — not expansion of existing businesses.",
    scopeShort:
      "NEW micro-enterprises in manufacturing (project cost up to ₹25 lakh) and services (up to ₹10 lakh)",
    supportStructure: [
      {
        label: "Project cost ceiling",
        text: "Manufacturing projects up to ₹25,00,000; service projects up to ₹10,00,000 (verify the current ceiling for your activity).",
      },
      {
        label: "Your contribution",
        text: "Normally 10% of project cost for the general category and 5% for special categories (SC/ST/OBC/minorities/women, ex-servicemen, persons with disability, NER — verify current list).",
      },
      {
        label: "Margin-money subsidy",
        text: "General category: 25% of project cost in rural areas and 15% in urban areas; special categories: 35% rural and 25% urban (rates are periodically reviewed — verify current rates).",
      },
      {
        label: "Balance funding",
        text: "The remaining cost is financed as a bank loan by the implementing bank.",
      },
    ],
    whoItSupports: [
      "First-generation entrepreneurs aged 18+ setting up a new unit",
      "Manufacturing, service and allied-agri projects (dairy, poultry, food processing, agri-inputs, repair services etc.)",
      "Pure trading units are generally outside scope — verify with the DIC",
    ],
    applicantCriteria: [
      "New enterprise (fresh project) — not for expanding an existing unit",
      "Applicant should not have availed similar central subsidy schemes earlier",
      "Minimum VIII standard pass for projects above ₹10 lakh (manufacturing) / ₹5 lakh (services) — verify current norm",
    ],
    rules: [
      {
        id: "business",
        weight: 40,
        check: (p) => {
          const ids = new Set(["dairy", "poultry", "poultry-feed", "food-processing", "agri-inputs", "mobile-repair", "services", "manufacturing", "clothing"]);
          return ids.has(p.businessId) ? "pass" : "fail";
        },
        passReason: (p) =>
          `${p.businessName} looks like the kind of new manufacturing/service/allied-agri unit PMEGP supports.`,
        partialReason: () => "",
        failReason: (p) =>
          `PMEGP targets new manufacturing/service/allied-agri units; a pure-trading business (such as ${p.businessName}) is usually outside scope — confirm with the District Industries Centre.`,
      },
      {
        id: "business-stage",
        weight: 10,
        check: () => "partial",
        partialReason: () =>
          "PMEGP is for NEW (first-time) enterprises — GramUdaan assumes you are starting fresh; confirm your unit is not an existing or expanded business.",
        passReason: () => "",
        failReason: () => "",
      },
      fundingRule(undefined),
      projectScaleRule(2500000),
      locationRule(),
    ],
    requiredDocuments: [
      "Aadhaar and PAN",
      "Educational qualification certificate (where required)",
      "Project report with cost details",
      "Quotations / cost estimates for plant, machinery or equipment",
      "Bank account and passport photographs",
      "Any caste/category certificate where applicable",
    ],
    applicationProcess: [
      "Apply online through the KVIC PMEGP portal or through the bank / DIC / KVIB",
      "Project report is appraised by the implementing bank",
      "Margin-money subsidy is released to the bank after project implementation",
      "Approval and disbursal follow bank and KVIC formalities",
    ],
    officialSource: {
      name: "PMEGP — Official MSME Portal",
      url: "https://pmegp.msme.gov.in/Home/HomePage",
    },
    note: "Applications are submitted through the KVIC/KVIB portal (kviconline.gov.in). Subsidy percentages and ceilings are periodically revised — always confirm the current guidelines with KVIC or the District Industries Centre.",
  },

  {
    id: "deds",
    name: "Dairy Entrepreneurship Development Scheme",
    nameHi: "डेयरी उद्यमिता विकास योजना",
    category: "subsidy",
    filterTags: ["subsidy", "agriculture", "rural"],
    shortDescription:
      "Back-ended capital subsidy for setting up small dairy units.",
    about:
      "DEDS (implemented through banks in association with NABARD and the Department of Animal Husbandry & Dairying) provides capital subsidy for small dairy units — purchase of milch animals, sheds and related dairy infrastructure for self-employment in the dairy sector.",
    scopeShort: "small dairy units (2–10 milch animals and related dairy activity)",
    supportStructure: [
      {
        label: "Capital subsidy",
        text: "Subsidy is a percentage of the project cost (historically 25%, with a higher rate for SC/ST farmers) subject to per-unit ceilings — ceilings have been revised over time; verify the current rate and ceiling.",
      },
      {
        label: "Covered components",
        text: "Milch-animal purchase and related dairy infrastructure such as sheds, milking machines and small equipment, as per current guidelines.",
      },
      {
        label: "Delivery",
        text: "Subsidy is back-ended — the unit is financed by a bank loan and the subsidy is credited after satisfactory implementation.",
      },
    ],
    whoItSupports: [
      "Dairy farmers and entrepreneurs setting up new small dairy units",
      "Existing dairy farmers expanding within scheme limits (check current rules)",
    ],
    applicantCriteria: [
      "Plan for a small dairy unit (typically ~2–10 milch animals)",
      "Land, water, cattle shed and management capability as per scheme norms",
      "Category certificates (SC/ST) where a higher subsidy rate is claimed",
    ],
    rules: [
      {
        id: "business",
        weight: 45,
        check: (p) => (p.businessId === "dairy" ? "pass" : "fail"),
        passReason: (p) =>
          "DEDS is specifically a dairy-sector scheme and your selected business is dairy.",
        partialReason: () => "",
        failReason: (p) =>
          `DEDS is aimed at dairy units; your selected business (${p.businessName}) does not match this scheme.`,
      },
      fundingRule(undefined),
      projectScaleRule(undefined),
      {
        id: "dairy-size",
        weight: 10,
        check: () => "partial",
        partialReason: () =>
          "The scheme is sized for small units (roughly 2–10 milch animals); subsidy ceilings depend on the unit plan you submit to the bank.",
        passReason: () => "",
        failReason: () => "",
      },
      locationRule(),
    ],
    requiredDocuments: [
      "Identity and address proof (Aadhaar, PAN)",
      "Project proposal with unit size and cost details",
      "Proof of land / cattle-shed arrangement",
      "Quotations for animals/equipment as requested by the bank",
      "Category certificate where applicable",
    ],
    applicationProcess: [
      "Approach a commercial or cooperative bank with a dairy project proposal",
      "Bank appraises and sanctions the loan for the unit",
      "Unit is established; subsidy is claimed by the bank and credited back-ended",
    ],
    officialSource: {
      name: "NABARD — DEDS Scheme Page",
      url: "https://www.nabard.org/content1.aspx?id=591&catid=23&mid=23",
    },
    note: "Subsidy rates and ceilings for DEDS have changed across scheme versions — the bank/NABARD is the authority for current terms.",
  },

  {
    id: "cgtmse",
    name: "Credit Guarantee Scheme for Micro & Small Enterprises (CGTMSE)",
    nameHi: "क्रेडिट गारंटी योजना (सीजीटीएमएसई)",
    category: "guarantee",
    filterTags: ["financing", "msme"],
    shortDescription:
      "Collateral-free credit guarantee for MSME loans — helps banks lend without collateral.",
    about:
      "CGTMSE provides a guarantee cover to banks and lending institutions for collateral-free credit extended to micro and small enterprises. The guarantee makes it easier for a small business without property collateral to obtain institutional finance — it supports (not replaces) a bank loan.",
    scopeShort:
      "collateral-free institutional credit to micro and small enterprises",
    supportStructure: [
      {
        label: "What it covers",
        text: "A guarantee to the lending institution for collateral-free loans to micro and small enterprises (loan limits have been raised over time — verify the current cover ceiling).",
      },
      {
        label: "How it helps you",
        text: "Where a bank is reluctant to lend without property collateral, the guarantee can enable the loan; you still apply to and repay the bank.",
      },
      {
        label: "Coverage",
        text: "Broadly applicable to new and existing micro/small enterprises in manufacturing and services — verify current eligibility with your bank.",
      },
    ],
    whoItSupports: [
      "Micro and small enterprises (new or existing) borrowing without collateral",
      "Businesses whose financing need goes beyond typical micro-loan sizes",
    ],
    applicantCriteria: [
      "Micro/small enterprise as defined under MSME norms",
      "Loan extended by a CGTMSE-covered lending institution",
      "No collateral security offered by the borrower",
    ],
    rules: [
      guaranteedSectorScopeRule(ALL_SECTORS, "collateral-free institutional credit for micro and small enterprises"),
      fundingRule(undefined, 1000000),
      locationRule(),
    ],
    requiredDocuments: [
      "Business registration / enterprise details",
      "Project plan and financials as requested by the bank",
      "Standard KYC documents",
    ],
    applicationProcess: [
      "Apply for a bank loan as usual (no separate CGTMSE application by the borrower)",
      "Bank assesses the loan and registers the guarantee cover with CGTMSE",
      "Repayment terms are with the bank",
    ],
    officialSource: {
      name: "CGTMSE — Official Portal",
      url: "https://www.cgtmse.in",
    },
    note: "CGTMSE is a guarantee scheme, not a direct loan — borrowing always happens through a bank or eligible lender.",
  },
];

export function getSchemeById(id: string): GovernmentScheme | undefined {
  return governmentSchemes.find((s) => s.id === id);
}
