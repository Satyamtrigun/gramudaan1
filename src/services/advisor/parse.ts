// ─── RuralBiz Advisor — Input Parser ───
// Extracts structured business information from natural Hindi / Hinglish / English
// input so the advisor can drive the REAL RuralBiz analysis engine.

import { businessCategories, type BusinessCategory } from "@/data/businesses";
import { locations, type Location } from "@/data/locations";

export type AdvisorLang = "hi" | "hinglish" | "en";

export type AdvisorIntent =
  | "greeting"
  | "thanks"
  | "smalltalk"
  | "analyze"
  | "recommend"
  | "compare"
  | "what_if"
  | "apply_scenario"
  | "update_state"
  | "score"
  | "market"
  | "competition"
  | "risk"
  | "pricing"
  | "loan"
  | "scheme"
  | "swot"
  | "next_steps"
  | "unknown";

export interface ParsedMessage {
  lang: AdvisorLang;
  intent: AdvisorIntent;
  /** Business categories explicitly mentioned (ordered: longest/most specific match first) */
  businesses: BusinessCategory[];
  /** Capital amount in rupees, if a concrete amount was stated */
  capital: number | null;
  /** Location mentioned by name/district, if it matches a known location */
  location: Location | null;
  /** True when a capital figure was asserted as fact (not hypothetical) */
  capitalAsserted: boolean;
  /** True when a location was asserted as fact (not hypothetical) */
  locationAsserted: boolean;
  /** Free-text location reference that did not match a known location */
  unknownPlace: string | null;
}

// ─── Language detection ───

const DEVANAGARI_RE = /[\u0900-\u097F]/;
const HINGLISH_HINTS = [
  "hai", "hain", "hai na", "kya", "kaun", "kaunsa", "kaisi", "kaisa", "mere", "mera", "meri",
  "paas", "rupaye", "rupeye", "rupay", "lakh", "hazaar", "hajar", "kar", "karna", "karta",
  "chahta", "chahti", "nahi", "gaon", "gaav", "gaam", "shuru", "batao", "bataye", "loon",
  "aapka", "aapke", "apna", "apne", "apni", "iska", "isme", "isame", "yahan", "wahan",
  "rahega", "rahegi", "hoga", "hogee", "karun", "karu", "kholna", "kholu", "lagaun",
  "toh", "zayada", "zyada", "kam", "achha", "accha", "bhi", "bahut", "thoda", "saare",
  "sabse", "baad", "pehle", "dena", "lena", "milta", "mil", "sakta", "sakti", "ho",
  "business", "dairy", "market", "scheme", "loan", "competition", "risk", "profit",
  "customer", "supplier", "investment", "capital", "kist", "emi", "gaon me", "yaha",
];

const HINGLISH_WORD_RE = new RegExp(`\\b(${HINGLISH_HINTS.join("|")})\\b`, "i");

function countDevanagari(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (DEVANAGARI_RE.test(ch)) n++;
  }
  return n;
}

export function detectLanguage(text: string): AdvisorLang {
  const devanagari = countDevanagari(text);
  if (devanagari > 0) {
    // More than a third of non-space chars in Devanagari → full Hindi
    const nonSpace = text.replace(/\s/g, "").length || 1;
    return devanagari / nonSpace > 0.3 ? "hi" : "hinglish";
  }
  const latin = text.replace(/\s+/g, " ");
  const wordCount = latin.split(" ").filter(Boolean).length || 1;
  const hits = (latin.match(HINGLISH_WORD_RE) || []).length;
  return hits >= Math.min(2, Math.ceil(wordCount * 0.25)) ? "hinglish" : "en";
}

// ─── Business extraction ───

interface BusinessAlias {
  id: string;
  aliases: string[];
}

// Longest aliases must come first per business so "poultry feed" beats "poultry".
const BUSINESS_ALIASES: BusinessAlias[] = [
  {
    id: "dairy",
    aliases: [
      "dairy business", "dairy farm", "doodh business", "milk business",
      "पशुपालन", "डेयरी व्यवसाय", "गाय पालन", "दूध का धंधा", "दूध का कारोबार",
      "dairy", "doodh", "dudh", "milk", "डेयरी", "दूध", "गाय", "gau palan", "pashu palan",
    ],
  },
  {
    id: "poultry-feed",
    aliases: [
      "poultry feed", "poultryfeed", "murgi chara", "murgi khana",
      "पोल्ट्री फीड", "मुर्गी चारा", "मुर्गी का चारा", "चारा की दुकान", "चारा दुकान",
      "poultry fee", "charah", "chara",
    ],
  },
  {
    id: "poultry",
    aliases: [
      "poultry business", "poultry farm", "murgi palan", "egg business", "chicken farm",
      "मुर्गी पालन", "पोल्ट्री फार्म", "अंडा व्यवसाय", "मुर्गी पालन व्यवसाय",
      "poultry", "murgi", "murga", "murghi", "murghee", "broiler", "eggs", "chicken",
      "पोल्ट्री", "मुर्गी", "अंडे", "अंडा",
    ],
  },
  {
    id: "grocery",
    aliases: [
      "grocery store", "kirana store", "kirana dukaan", "general store", "provision store",
      "किराना दुकान", "किराना स्टोर", "जनरल स्टोर",
      "grocery", "kirana", "pansari", "किराना", "पंसारी",
    ],
  },
  {
    id: "mobile-repair",
    aliases: [
      "mobile repair", "phone repair", "mobile servicing",
      "मोबाइल रिपेयर", "मोबाइल मरम्मत", "फोन रिपेयर",
      "mobile", "mobail", "phone repair shop", "मोबाइल", "फोन",
    ],
  },
  {
    id: "clothing",
    aliases: [
      "clothing store", "garment shop", "cloth business", "tailoring shop",
      "कपड़े की दुकान", "वस्त्र व्यवसाय", "सिलाई का काम",
      "clothing", "clothes", "garment", "kapde", "kapada", "kapra", "kapda", "कपड़े", "वस्त्र", "सिलाई",
    ],
  },
  {
    id: "food-processing",
    aliases: [
      "food processing", "masala business", "pickle business", "snack business",
      "खाद्य प्रसंस्करण", "मसाला उद्योग", "अचार बनाना",
      "masala", "pickle", "achhar", "achar", "snacks", "namkeen", "bhujia", "food products",
      "मसाला", "अचार", "नमकीन",
    ],
  },
  {
    id: "agri-inputs",
    aliases: [
      "agriculture inputs", "agri inputs", "kheti ka saman", "khad beej",
      "कृषि इनपुट", "खाद बीज की दुकान", "उर्वरक",
      "kheti", "khad", "beej", "fertilizer", "fertiliser", "pesticide", "krishi", "खाद", "बीज", "उर्वरक",
    ],
  },
  {
    id: "retail",
    aliases: [
      "retail shop", "retail store", "dukan", "dookan",
      "रिटेल", "दुकान",
      "retail", "store", "shop",
    ],
  },
  {
    id: "services",
    aliases: [
      "service business", "salon", "tailoring", "repair shop", "tution", "tutoring",
      "सेवा व्यवसाय", "सैलून", "ट्यूशन",
      "services", "service", "सेवाएं", "सेवा",
    ],
  },
  {
    id: "manufacturing",
    aliases: [
      "manufacturing", "small factory", "production unit",
      "विनिर्माण", "छोटा उद्योग", "उद्योग",
      "factory", "udyog", "production", "निर्माण",
    ],
  },
  {
    id: "other",
    aliases: ["other business", "कोई और business", "अन्य व्यवसाय"],
  },
];

const ALIAS_INDEX: { alias: string; id: string }[] = [];
for (const entry of BUSINESS_ALIASES) {
  for (const alias of entry.aliases) {
    ALIAS_INDEX.push({ alias: alias.toLowerCase(), id: entry.id });
  }
}
// Longest alias first so specific phrases match before generic ones
ALIAS_INDEX.sort((a, b) => b.alias.length - a.alias.length);

function businessById(id: string): BusinessCategory | null {
  return businessCategories.find((b) => b.id === id) || null;
}

export function extractBusinesses(text: string): BusinessCategory[] {
  const lower = ` ${text.toLowerCase()} `;
  const found: string[] = [];
  for (const { alias, id } of ALIAS_INDEX) {
    if (found.includes(id)) continue;
    // One-word aliases need word boundaries; phrases only need a safe boundary check
    if (alias.includes(" ")) {
      if (lower.includes(` ${alias} `) || lower.includes(alias)) {
        // For phrase matches, verify boundary via index and following char
        const idx = lower.indexOf(alias);
        const before = lower[idx - 1] || " ";
        const after = lower[idx + alias.length] || " ";
        if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
          found.push(id);
        }
      }
    } else {
      const re = new RegExp(`(?<![a-z0-9])${alias}(?![a-z0-9])`, "i");
      if (re.test(lower)) found.push(id);
    }
  }
  // Avoid matching "services" inside unrelated phrases like "DIC services" — acceptable.
  return found.map(businessById).filter((b): b is BusinessCategory => b !== null);
}

// ─── Capital extraction ───

const NUM_WORD_MAP: Record<string, number> = {
  // romanized
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chh: 6, che: 6, chhe: 6,
  saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, terah: 13, chaudah: 14,
  pandrah: 15, solah: 16, satrah: 17, atharah: 18, unnis: 19, bees: 20, pachas: 50,
  pachaas: 50, sau: 100, hazaar: 1000, hazar: 1000, hajar: 1000, thousand: 1000,
  lakh: 100000, lac: 100000, "lak": 100000, crore: 10000000, cr: 10000000,
  // devanagari
  एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
  ग्यारह: 11, बारह: 12, तेरह: 13, चौदह: 14, पंद्रह: 15, सोलह: 16, सत्रह: 17,
  अठारह: 18, उन्नीस: 19, बीस: 20, पचास: 50, सौ: 100, हजार: 1000, हज़ार: 1000,
  लाख: 100000, करोड़: 10000000,
};

const UNIT_WORDS = ["lakh", "lac", "hazaar", "hazar", "hajar", "thousand", "crore", "cr", "hundred", "sau",
  "लाख", "हजार", "हज़ार", "करोड़", "सौ"];

function parseNumberToken(token: string): number | null {
  const cleaned = token.replace(/[₹,]/g, "").trim().toLowerCase();
  if (!cleaned) return null;
  if (NUM_WORD_MAP[cleaned] !== undefined) return NUM_WORD_MAP[cleaned];
  if (/^[0-9]+(\.[0-9]+)?$/.test(cleaned)) return parseFloat(cleaned);
  return null;
}

export function extractCapital(text: string): number | null {
  // Strip digit-grouping commas (2,00,000 → 200000) before tokenizing,
  // but leave commas inside normal prose untouched.
  const cleaned = text.replace(/(\d),(\d)/g, "$1$2");
  // Tokenize words, keeping attached number+unit pairs like "2lakh", "2L", "200000"
  const tokens = cleaned.replace(/[₹]/g, " ₹ ").split(/\s+/).filter(Boolean);

  const amounts: number[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].toLowerCase();

    // Pattern: digit+unit attached — 2lakh, 6l, 200k, 3cr
    const attached = token.match(/^([0-9]+(?:\.[0-9]+)?)\s*(lakh|lac|cr|k|l|hazaar|hazar|hajar|thousand|crore)$/);
    if (attached) {
      const num = parseFloat(attached[1]);
      const unit = attached[2];
      if (unit === "lakh" || unit === "lac" || unit === "l") amounts.push(num * 100000);
      else if (unit === "cr" || unit === "crore") amounts.push(num * 10000000);
      else if (unit === "k") amounts.push(num * 1000);
      else amounts.push(num * 1000); // hazar/hajar/thousand
      continue;
    }

    const numTok = parseNumberToken(tokens[i]);
    if (numTok === null) continue;

    // Digit or number-word followed by a unit word: "2 lakh", "do lakh", "₹6 लाख"
    const next = tokens[i + 1]?.toLowerCase() || "";
    const unitWord = UNIT_WORDS.find((u) => {
      const unit = u.toLowerCase();
      return next === unit || (unit.length >= 3 && next.endsWith(unit));
    });
    if (unitWord) {
      const mult = unitWord === "lakh" || unitWord === "लाख" ? 100000
        : unitWord === "crore" || unitWord === "करोड़" ? 10000000
          : unitWord === "hundred" || unitWord === "sau" || unitWord === "सौ" ? 100
            : 1000;
      amounts.push(numTok * mult);
      i++; // consume unit token
      continue;
    }

    // Plain digit token standing alone (>= 1000 → rupees amount): 200000, 50000
    const plain = token.match(/^[0-9]+(?:\.[0-9]+)?$/);
    if (plain && numTok >= 1000) {
      amounts.push(numTok);
    }
    // bare number-word with no unit ("do", "teen") — too ambiguous; ignore
  }

  if (amounts.length === 0) return null;
  // A user describing available capital usually gives the largest figure.
  return Math.max(...amounts);
}

// ─── Location extraction ───

function normalizePlace(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function extractLocation(text: string): { location: Location | null; unknownPlace: string | null } {
  const normalized = ` ${normalizePlace(text)} `;

  // Longest location names first
  const sorted = [...locations].sort((a, b) => b.name.length - a.name.length);

  for (const loc of sorted) {
    const name = normalizePlace(loc.name);
    const district = normalizePlace(loc.district);
    const nameRe = new RegExp(`(?<![a-z])${name}(?![a-z])`, "i");
    if (nameRe.test(normalized)) return { location: loc, unknownPlace: null };
    if (name.length > 2) {
      const districtRe = new RegExp(`(?<![a-z])${district}(?![a-z])`, "i");
      if (districtRe.test(normalized)) return { location: loc, unknownPlace: null };
    }
  }

  // Unknown place-name capture: "gaon me" / "मेरे गांव X" style
  const STOPWORDS = new Set([
    "me", "main", "men", "mein", "m", "my", "ka", "ki", "ke", "ko", "se", "to", "toh", "ho",
    "hai", "hain", "apne", "apna", "apni", "mere", "mera", "meri", "mujhe", "muje", "mujh",
    "hum", "humara", "start", "shuru", "karna", "kholna", "karne", "kholne", "mein", "bhi",
    "aur", "wala", "wali", "sabse", "zyada", "kam", "achha", "thoda", "nahi", "hai", "rahega",
  ]);
  const villageHint = normalized.match(/(?:gaon|gaav|gaam|gau|village|town|shehar|shahar|गांव|गाँव|शहर|कस्बा)\s+([a-z]{3,30})/i);
  if (villageHint) {
    const place = villageHint[1];
    if (!STOPWORDS.has(place)) {
      return { location: null, unknownPlace: place };
    }
  }
  return { location: null, unknownPlace: null };
}

// ─── Intent detection ───

export interface IntentInput {
  text: string;
  lang: AdvisorLang;
  businesses: BusinessCategory[];
  capital: number | null;
  capitalAsserted: boolean;
  location: Location | null;
  locationAsserted: boolean;
  hasCurrentLocation: boolean;
  hasCurrentBusiness: boolean;
  hasCurrentCapital: boolean;
}

const CONDITIONAL_RE = /\b(agar|अगर|what if|instead|ki jagah|की जगह|कि जगह|yadi|यदि)\b|agar\s+main|what if/i;
const APPLY_RE = /\b(apply|lagao|लागू|set my|update my|badal do|बदल दो|save this)\b|apply karo|yehi analysis|ya scenario/i;

function intentContains(text: string, words: string[]): boolean {
  const lower = ` ${text.toLowerCase()} `;
  return words.some((w) => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z])${escaped}(?![a-z])`).test(lower) || lower.includes(w);
  });
}

export function detectIntent(input: IntentInput): AdvisorIntent {
  const text = input.text;
  const lower = text.toLowerCase();
  const cond = CONDITIONAL_RE.test(text);

  // Greetings / thanks / small talk
  if (/^\s*(hi|hii+|hello|hey|namaste|namaskar|नमस्ते|नमस्कार|pranam|प्रणाम)\b/i.test(text.trim()) && text.trim().split(/\s+/).length <= 3) {
    return "greeting";
  }
  if (intentContains(text, ["dhanyawad", "dhanyavad", "shukriya", "thank", "thanks", "धन्यवाद", "शुक्रिया", "बहुत अच्छा", "great", "helpful"])) {
    return "thanks";
  }
  if (intentContains(text, ["alvida", "bye", "goodbye", "phir milenge", "अलविदा", "फिर मिलेंगे"])) {
    return "smalltalk";
  }

  // Explicit apply-scenario request ("Apply: Poultry Feed, ₹3 lakh")
  if (APPLY_RE.test(text) && (input.businesses.length > 0 || input.capital !== null || input.location)) {
    return "apply_scenario";
  }

  // Compare two or more businesses
  if (input.businesses.length >= 2) {
    if (intentContains(text, ["compare", "mukabla", "tulna", "तुलना", "मुकाबला", "compare karo", "ya", "or", "vs", "better", "behtar", "बेहतर", "kaunsa"]) || cond) {
      return "compare";
    }
  }

  // Hypothetical / conditional → what-if
  if (cond || intentContains(text, ["agar", "kya hoga", "ho jaye", "badal", "change karu", "bada du", "kam karu", "zyada karu"])) {
    if (input.capital !== null || input.businesses.length > 0 || input.location) {
      return "what_if";
    }
  }

  // Scheme questions (government schemes, eligibility)
  if (intentContains(text, ["scheme", "sarkari", "yojana", "mudra", "pmegp", "subsidy", "स्कीम", "सरकारी", "योजना", "मुद्रा", "eligible", "pattra"]) ||
      /(scheme|yojana).*(mil|mila|mil sakta|applicable|relevant|lagu)/i.test(text)) {
    return "scheme";
  }

  // Loan / EMI / finance questions
  if (intentContains(text, ["loan", "emi", "kist", "kisht", "repay", "repayment", "finance", "financing", "funding", "कर्ज", "कर्ज़", "लोन", "ईएमआई", "किस्त", "क़र्ज़"]) ||
      /kitna (loan|paisa|rupaye) (lena|lagega|laga)/i.test(lower) ||
      /kitna (loan|paisa|rupaye)/i.test(lower) ||
      /how much (loan|money|emi)/i.test(lower) ||
      /project cost/i.test(lower)) {
    return "loan";
  }

  // Pricing questions
  if (intentContains(text, ["price", "pricing", "dam", "kiimat", "kimat", "bhav", "rate", "दाम", "कीमत", "भाव", "रेट", "कितने में", "kitne me", "kya rate", "bechna"]) ||
      /kitne (me|men) bech/i.test(lower) || /kya (price|dam) (rakh|rakhu|laga|lagau)/i.test(lower)) {
    return "pricing";
  }

  // Score / verdict explanation
  if (intentContains(text, ["score", "verdict", "feasibility kitna", "स्कोर", "resolt", "result"]) ||
      /score (itna|kam|zyada|kyu|kyun|low|high)/i.test(lower) ||
      /kyu(n)? (itna|ye)|why (is|are).*(score|low|kam)/i.test(lower) ||
      /kitna (score|feasibility|result)/i.test(lower)) {
    return "score";
  }

  // SWOT
  if (intentContains(text, ["swot", "strength", "weakness", "threat", "mazbooti", "kamzori", "स्ट्रेंथ", "कमजोरी", "मजबूती"])) {
    return "swot";
  }

  // Risks
  if (intentContains(text, ["risk", "khatra", "khatra", "jokhim", "joKhim", "dikkat", "problem kya", "danger", "खतरा", "जोखिम", "दिक्कत"]) ||
      /sabse bada (risk|khatra)/i.test(lower)) {
    return "risk";
  }

  // Competition
  if (intentContains(text, ["competition", "competitor", "pratispardha", "प्रतिस्पर्धा", "प्रतिद्वंद्वी", "aur kitne", "kitne aur", "doosre log"])) {
    return "competition";
  }

  // Market reach / customers / demand
  if (intentContains(text, ["market", "customer", "demand", "population", "household", "reach", "मार्केट", "ग्राहक", "मांग", "लोग", "kharid", "kitna bada"])) {
    return "market";
  }

  // Next steps / action plan
  if (intentContains(text, ["next step", "aage kya", "pehle kya", "ab kya", "first step", "action plan", "आगे क्या", "अब क्या", "सबसे पहले"]) ||
      /\bnext\b/i.test(lower)) {
    return "next_steps";
  }

  // Business recommendation ("kaunsa business karun", "suggest karo")
  if (intentContains(text, ["suggest", "recommend", "best business", "sahi rahega", "achha rahega", "accha rahega", "kaun sa business", "kaunsa business", "kya business", "business karun", "business karu", "business kholu", "business shuru karu", "कौन सा बिजनेस", "क्या करूं", "क्या करूँ", "समझ नहीं आ रहा", "pata nahi"]) ||
      /(suggest|recommend|batao) (mujhe|karo|kijiye|kare)/i.test(lower)) {
    return "recommend";
  }

  // Feasibility of a stated business ("dairy kaisi rahegi?", "should I start poultry?")
  if (input.businesses.length > 0 || input.capital !== null || input.location) {
    if (intentContains(text, ["kaisi", "kaisa", "rahega", "rahegi", "should i", "shuru kar", "kholna", "start", "worth", "karna chahiye", "कैसा", "कैसी", "करना चाहिए", "शुरू"])) {
      return "analyze";
    }
  }

  // Stated update to current state ("ab mere paas 3 lakh hain")
  if (input.capitalAsserted || input.locationAsserted || input.businesses.length > 0) {
    if (intentContains(text, ["ab", "now", "update", "change", "badal", "naya", "abhi", "actually", "asli"])) {
      return "update_state";
    }
    return "analyze";
  }

  return "unknown";
}

// ─── Main parse entry ───

export function parseMessage(
  message: string,
  hasCurrentLocation: boolean,
): ParsedMessage {
  const lang = detectLanguage(message);
  const businesses = extractBusinesses(message);
  const capital = extractCapital(message);
  const { location, unknownPlace } = extractLocation(message);

  // Where does the user's own message place the amount/location?
  const COND_PATTERN = /\b(agar|अगर|yadi|यदि|what if)\b.*$/is;
  const conditionalTail = COND_PATTERN.test(message);

  const capitalAsserted = capital !== null && !conditionalTail &&
    !/what if|agar|अगर|lagaun to|lagaun toh|karun to|karun toh/i.test(message);

  const locationAsserted = location !== null && !conditionalTail;

  const hasCurrentBusiness = businesses.length > 0;

  const input: IntentInput = {
    text: message,
    lang,
    businesses,
    capital,
    capitalAsserted,
    location,
    locationAsserted,
    hasCurrentLocation,
    hasCurrentBusiness,
    hasCurrentCapital: capital !== null,
  };

  const intent = detectIntent(input);

  return {
    lang,
    intent,
    businesses,
    capital,
    location,
    capitalAsserted,
    locationAsserted,
    unknownPlace,
  };
}
