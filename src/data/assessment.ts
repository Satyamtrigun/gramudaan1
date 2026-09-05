export interface AssessmentData {
  locationId: string | null;
  locationName: string;
  radius: number;
  businessId: string | null;
  businessName: string;
  capital: number;
  timestamp: string;
}

export function formatIndianCurrency(amount: number): string {
  if (amount === 0) return "₹0";

  // Indian numbering: last 3 digits grouped, then groups of 2 (1,00,000 style)
  const negative = amount < 0;
  const digits = Math.round(Math.abs(amount)).toString();
  const prefix = negative ? "-₹" : "₹";

  if (digits.length <= 3) return prefix + digits;

  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  groups.unshift(rest);

  return prefix + groups.join(",") + "," + last3;
}

export function formatCompactCurrency(amount: number): string {
  if (amount >= 100000) {
    const lakhs = amount / 100000;
    return `₹${lakhs.toFixed(lakhs === Math.floor(lakhs) ? 0 : 1)}L`;
  }
  if (amount >= 1000) {
    const thousands = amount / 1000;
    return `₹${thousands.toFixed(thousands === Math.floor(thousands) ? 0 : 1)}K`;
  }
  return `₹${amount}`;
}

export function getVerdictColor(verdict: "good" | "caution" | "rethink"): string {
  switch (verdict) {
    case "good":
      return "text-emerald-600";
    case "caution":
      return "text-amber-600";
    case "rethink":
      return "text-red-600";
    default:
      return "text-muted-foreground";
  }
}

export function getVerdictBg(verdict: "good" | "caution" | "rethink"): string {
  switch (verdict) {
    case "good":
      return "bg-emerald-50 border-emerald-200";
    case "caution":
      return "bg-amber-50 border-amber-200";
    case "rethink":
      return "bg-red-50 border-red-200";
    default:
      return "bg-muted border-border";
  }
}

export function getVerdictIcon(verdict: "good" | "caution" | "rethink"): string {
  switch (verdict) {
    case "good":
      return "🟢";
    case "caution":
      return "🟡";
    case "rethink":
      return "🔴";
    default:
      return "⚪";
  }
}

export function getSeverityColor(severity: "high" | "medium" | "low"): string {
  switch (severity) {
    case "high":
      return "bg-red-100 text-red-700 border-red-200";
    case "medium":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "low":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function getConfidenceColor(level: "high" | "medium" | "low"): string {
  switch (level) {
    case "high":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "medium":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "low":
      return "bg-gray-50 text-gray-600 border-gray-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}
