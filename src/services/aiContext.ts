import type { FeasibilityData } from "@/data/feasibility-types";
import type { Location } from "@/data/locations";
import type { BusinessCategory } from "@/data/businesses";
import { formatIndianCurrency } from "@/data/assessment";

// ─── System Prompt ───
export const SYSTEM_PROMPT = `You are GramUdaan — a friendly Hindi-speaking business advisor for rural and semi-urban entrepreneurs in India.

PERSONALITY:
- Friendly, respectful, patient, practical, encouraging, honest
- Like a knowledgeable business advisor sitting beside the entrepreneur
- Not corporate, not robotic, not overly technical

LANGUAGE:
- Default: Natural conversational Hindi or Hinglish
- Use familiar English business terms when they're clearer: Loan, EMI, Market, Competition, Profit, Investment, Risk, Supplier, Business
- Keep sentences short and simple
- Avoid overly formal Hindi (no "आपके द्वारा उपलब्ध कराई गई पूंजी")

RESPONSE FORMAT:
1. Give a clear answer
2. Explain why
3. Give a practical next step

RULES:
- ALWAYS use the user's current GramUdaan context (location, business, capital, analysis scores) when available
- Never pretend estimated data is verified — say "यह एक estimated figure है"
- Never guarantee profit, loan approval or business success
- Never hallucinate government scheme details, interest rates, or competitor counts
- If information is unavailable, say "मेरे पास अभी इस बारे में पर्याप्त data नहीं है"
- Keep responses under 3-4 sentences for voice, unless the user asks for detailed explanation
- For complex topics: "मैं इसे दो हिस्सों में समझाता हूँ..."
- Financial advice must include: "Actual eligibility lender, scheme और documentation पर depend करेगी"

GOVERNMENT SCHEMES:
- PMEGP: Credit-linked subsidy scheme for business setup financing
- MUDRA: Loans up to ₹10 lakh for small businesses
- Explain in simple Hindi, never invent eligibility rules

RURAL CONTEXT:
- Understand: local customers, weekly markets, nearby villages, transport costs
- Understand: wholesale suppliers, seasonal demand, self-help groups, microfinance
- Give practical advice like: "अगर weekly haat लगता है तो वहां customer testing कर सकते हैं"

GREETING:
When greeting for the first time, say:
"नमस्ते! मैं GramUdaan हूँ। मैं आपके business analysis को समझ चुका हूँ। आप मुझसे अपने business, market, competition या finance से जुड़ा कोई भी सवाल पूछ सकते हैं।"

Never start with "How can I help you?" — be specific to their context.`;

// ─── Context Builder ───
export interface AssistantContext {
  location: { name: string; district: string; state: string } | null;
  business: { name: string; category: string } | null;
  capital: number;
  analysis: {
    overallScore: number;
    verdict: string;
    marketScore?: number;
    opportunityScore?: number;
    competitionScore?: number;
    riskScore?: number;
    financialFitScore?: number;
  } | null;
  financial?: {
    projectCost: number;
    loanAmount: number;
    scheme: string;
    monthlyRepayment: string;
    affordability: string;
  };
  competition?: {
    total: number;
    density: string;
  };
  risks?: string[];
  currentPage?: string;
}

export function buildContext(params: {
  location: Location | null;
  business: BusinessCategory | null;
  capital: number;
  feasibility: FeasibilityData | null;
  currentPage?: string;
}): string {
  const { location, business, capital, feasibility, currentPage } = params;

  if (!feasibility) {
    return `\nCURRENT CONTEXT: No analysis available yet. The user has not completed an assessment. Guide them to start an assessment first.`;
  }

  const context: string[] = [];

  context.push(`\nCURRENT RURALBIZ CONTEXT:`);

  if (location) {
    context.push(`Location: ${location.name}, ${location.district}, ${location.state}`);
  }

  if (business) {
    context.push(`Business: ${business.name} (${business.category})`);
  }

  context.push(`Capital Contribution: ${formatIndianCurrency(capital)}`);

  context.push(`\nANALYSIS RESULTS:`);
  context.push(`Overall Score: ${feasibility.overallScore}/100`);
  context.push(`Verdict: ${feasibility.verdictLabel}`);
  context.push(`Market Score: ${feasibility.subScores.marketScore}/100`);
  context.push(`Opportunity Score: ${feasibility.subScores.opportunityScore}/100`);
  context.push(`Competition Score: ${feasibility.subScores.competitionScore}/100`);
  context.push(`Risk Score: ${feasibility.subScores.riskScore}/100`);
  context.push(`Financial Fit: ${feasibility.subScores.financialFitScore}/100`);

  if (feasibility.financial) {
    context.push(`\nFINANCIAL DATA:`);
    context.push(`Total Project Cost: ${formatIndianCurrency(feasibility.financial.totalProjectCost)}`);
    context.push(`Agency Funding: ${formatIndianCurrency(feasibility.financial.potentialLoan)}`);
    context.push(`Scheme: ${feasibility.financial.recommendedScheme}`);
    if (feasibility.financial.affordability) {
      context.push(`Monthly Revenue (est): ${formatIndianCurrency(feasibility.financial.affordability.expectedRevenue)}`);
      context.push(`Monthly Costs: ${formatIndianCurrency(feasibility.financial.affordability.operatingCosts)}`);
      context.push(`Monthly Repayment: ${formatIndianCurrency(feasibility.financial.affordability.monthlyRepayment)}`);
      context.push(`Affordability: ${feasibility.financial.affordability.ratingLabel}`);
    }
  }

  if (feasibility.competition) {
    context.push(`\nCOMPETITION:`);
    context.push(`${feasibility.competition.totalBusinesses} competitors, density: ${feasibility.competition.density}`);
  }

  if (feasibility.risks?.length) {
    context.push(`\nKEY RISKS:`);
    feasibility.risks.slice(0, 4).forEach((r) => {
      context.push(`- ${r.name} (${r.severity}): ${r.explanation}`);
    });
  }

  if (feasibility.pricing) {
    context.push(`\nPRICING: Regional ${feasibility.pricing.regionalPrice}, Recommended ${feasibility.pricing.recommendedPrice}, Unit: ${feasibility.pricing.unit}`);
  }

  context.push(`\nDECISION: ${feasibility.decision.summary}`);
  context.push(`WHY: ${feasibility.decision.whyPoints.join("; ")}`);
  context.push(`WATCH OUT: ${feasibility.decision.watchOuts.join("; ")}`);

  if (currentPage) {
    context.push(`\nUser is currently viewing: ${currentPage} section. Prioritize questions about this topic.`);
  }

  context.push(`\nRemember: Always use this context when answering. Refer to specific numbers and scores. Never make up data.`);

  return context.join("\n");
}

// ─── Page-specific quick prompts ───
export interface QuickPrompt {
  text: string;
  hindi: string;
}

export const GENERAL_PROMPTS: QuickPrompt[] = [
  { text: "Which business is best for me?", hindi: "मेरे लिए कौन सा business अच्छा है?" },
  { text: "Explain my risks", hindi: "मेरा risk समझाओ" },
  { text: "What's my EMI?", hindi: "मेरी EMI बताओ" },
  { text: "How much competition?", hindi: "Competition कितना है?" },
  { text: "Government schemes?", hindi: "मुझे government scheme बताओ" },
  { text: "Should I start this business?", hindi: "क्या मुझे यह business शुरू करना चाहिए?" },
];

export const FINANCIAL_PROMPTS: QuickPrompt[] = [
  { text: "Explain my EMI", hindi: "मेरी EMI समझाओ" },
  { text: "How much loan should I take?", hindi: "Loan कितना लेना चाहिए?" },
  { text: "How is my cash flow?", hindi: "Cash flow कैसा है?" },
  { text: "Can I repay this loan?", hindi: "क्या मैं loan repay कर पाऊँगा?" },
];

export const COMPETITION_PROMPTS: QuickPrompt[] = [
  { text: "Is competition too high?", hindi: "Competition ज्यादा है?" },
  { text: "How can I stand out?", hindi: "मैं अलग कैसे दिखूं?" },
  { text: "Who are my competitors?", hindi: "मेरे competitors कौन हैं?" },
];

export const DECISION_PROMPTS: QuickPrompt[] = [
  { text: "Why did you say Good to Go?", hindi: "आपने Good to Go क्यों कहा?" },
  { text: "What's the biggest risk?", hindi: "सबसे बड़ा risk क्या है?" },
  { text: "What should I do first?", hindi: "अब मुझे क्या करना चाहिए?" },
];

export function getQuickPrompts(page?: string): QuickPrompt[] {
  if (!page) return GENERAL_PROMPTS;
  if (page.includes("financial")) return FINANCIAL_PROMPTS;
  if (page.includes("competition")) return COMPETITION_PROMPTS;
  if (page.includes("decision")) return DECISION_PROMPTS;
  return GENERAL_PROMPTS;
}
