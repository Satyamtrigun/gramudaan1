/* ─── Financial Engine Types ─── */

export interface LoanScheme {
  id: string;
  name: string;
  nameHi: string;
  maxFunding: number;
  interestRate: number;
  tenureYears: number;
  moratoriumMonths: number;
  minProjectCost: number;
  maxProjectCost: number;
}

export interface ProjectCostBreakdown {
  entrepreneurContribution: number;
  rawProjectCost: number;
  schemeMaxFunding: number;
  agencyFunding: number;
  totalProjectCost: number;
  isLimitExceeded: boolean;
  compliantProjectCost?: number;
  compliantAgencyFunding?: number;
  compliantEntrepreneurContribution?: number;
}

export interface SchemeAssignment {
  scheme: LoanScheme;
  projectCost: ProjectCostBreakdown;
}

export interface RepaymentEntry {
  quarter: number;
  label: string;
  principal: number;
  interest: number;
  payment: number;
  remainingBalance: number;
}

export interface RepaymentSchedule {
  entries: RepaymentEntry[];
  totalPayment: number;
  totalInterest: number;
  effectiveRate: number;
}

export interface AffordabilityResult {
  expectedMonthlyRevenue: number;
  operatingCosts: number;
  monthlyCashFlow: number;
  monthlyRepayment: number;
  surplusOrDeficit: number;
  rating: "comfortable" | "tight" | "risky";
  ratingLabel: string;
  ratingIcon: string;
  assumptions: string[];
}

/* ─── Market Analysis Types ─── */

export interface MarketReachData {
  population: number;
  households: number;
  estimatedConsumers: number;
  nearbyVillages: number;
  customerGroups: { name: string; relevance: "high" | "medium" | "low" }[];
  distributionChannels: string[];
  summary: string;
  confidence: "high" | "medium" | "low";
}

export interface OpportunityData {
  existingBusinesses: { name: string; count: number }[];
  totalExistingUnits: number;
  densityPerThousand: number;
  underservedCategory: string;
  underservedDetail: string;
  alternatives: string[];
  opportunityScore: number;
  summary: string;
  highCompetitionWarning?: string;
}

export interface SWOTData {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface RiskData {
  id: string;
  name: string;
  nameHi: string;
  category: string;
  severity: "high" | "medium" | "low";
  impact: string;
  explanation: string;
  mitigation: string;
}

export interface CompetitorData {
  totalBusinesses: number;
  density: "high" | "medium" | "low";
  densityLabel: string;
  competitors: { name: string; type: string; distance: string }[];
  summary: string;
}

export interface PricingData {
  unit: string;
  regionalPrice: number;
  competitorRangeLow: number;
  competitorRangeHigh: number;
  recommendedPrice: number;
  purchasingPower: "low" | "medium" | "high";
  demandIndicator: "low" | "medium" | "high";
  explanation: string;
}

/* ─── Sub-scores ─── */

export interface SubScores {
  marketScore: number;
  opportunityScore: number;
  competitionScore: number;
  riskScore: number;
  financialFitScore: number;
}
