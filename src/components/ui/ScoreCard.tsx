import { cn } from "@/lib/utils";

interface SubScores {
  marketScore: number;
  opportunityScore: number;
  competitionScore: number;
  riskScore: number;
  financialFitScore: number;
}

interface ScoreCardProps {
  score: number;
  verdict: "good" | "caution" | "rethink";
  verdictLabel: string;
  businessName: string;
  locationName: string;
  subScores?: SubScores;
  className?: string;
}

const subScoreLabels: Record<keyof SubScores, string> = {
  marketScore: "Market",
  opportunityScore: "Opportunity",
  competitionScore: "Competition",
  riskScore: "Risk",
  financialFitScore: "Financial Fit",
};

export function ScoreCard({
  score,
  verdict,
  verdictLabel,
  businessName,
  locationName,
  subScores,
  className,
}: ScoreCardProps) {
  const verdictColors = {
    good: "text-emerald-600",
    caution: "text-amber-600",
    rethink: "text-red-600",
  };

  const verdictBg = {
    good: "bg-emerald-50",
    caution: "bg-amber-50",
    rethink: "bg-red-50",
  };

  const verdictIcon = {
    good: "🟢",
    caution: "🟡",
    rethink: "🔴",
  };

  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  const getScoreColor = (s: number) => {
    if (s >= 70) return "text-emerald-600";
    if (s >= 50) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-white p-6 sm:p-8 shadow-sm",
        className,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
        Business Feasibility
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
        {/* Score circle */}
        <div className="relative flex-shrink-0">
          <svg width="130" height="130" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="currentColor"
              className="text-muted/60"
              strokeWidth="8"
            />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="currentColor"
              className={
                verdict === "good"
                  ? "text-emerald-500"
                  : verdict === "caution"
                    ? "text-amber-500"
                    : "text-red-500"
              }
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 60 60)"
              style={{ transition: "stroke-dashoffset 1s ease-out" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-foreground">{score}</span>
            <span className="text-xs text-muted-foreground font-medium">/ 100</span>
          </div>
        </div>

        <div className="text-center sm:text-left">
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold",
              verdictBg[verdict],
              verdictColors[verdict],
            )}
          >
            <span>{verdictIcon[verdict]}</span>
            {verdictLabel}
          </div>
          <h3 className="mt-3 text-xl font-bold text-foreground">{businessName}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{locationName}</p>
        </div>
      </div>

      {/* Sub-scores */}
      {subScores && (
        <div className="mt-6 grid grid-cols-5 gap-2 sm:gap-3">
          {Object.entries(subScores).map(([key, value]) => (
            <div key={key} className="text-center">
              <div className="relative mx-auto w-12 h-12 sm:w-14 sm:h-14">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="currentColor"
                    className="text-muted/40"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="currentColor"
                    className={getScoreColor(value)}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${(value / 100) * 94.25} 94.25`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={cn("text-xs font-bold", getScoreColor(value))}>
                    {value}
                  </span>
                </div>
              </div>
              <p className="text-[10px] font-medium text-muted-foreground mt-1.5">
                {subScoreLabels[key as keyof SubScores]}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
