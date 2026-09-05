import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Zap, ShieldAlert } from "lucide-react";

interface SWOTGridProps {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  className?: string;
}

interface QuadrantProps {
  title: string;
  icon: React.ReactNode;
  items: string[];
  color: string;
  borderColor: string;
}

function Quadrant({ title, icon, items, color, borderColor }: QuadrantProps) {
  return (
    <div className={cn("rounded-xl border p-4 sm:p-5", borderColor)}>
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", color)}>
          {icon}
        </div>
        <h4 className="text-sm font-bold text-foreground">{title}</h4>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground">
            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current opacity-40" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SWOTGrid({
  strengths,
  weaknesses,
  opportunities,
  threats,
  className,
}: SWOTGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4",
        className,
      )}
    >
      <Quadrant
        title="Strengths"
        icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
        items={strengths}
        color="bg-emerald-50"
        borderColor="border-emerald-200/60"
      />
      <Quadrant
        title="Weaknesses"
        icon={<TrendingDown className="h-4 w-4 text-red-500" />}
        items={weaknesses}
        color="bg-red-50"
        borderColor="border-red-200/60"
      />
      <Quadrant
        title="Opportunities"
        icon={<Zap className="h-4 w-4 text-blue-600" />}
        items={opportunities}
        color="bg-blue-50"
        borderColor="border-blue-200/60"
      />
      <Quadrant
        title="Threats"
        icon={<ShieldAlert className="h-4 w-4 text-amber-600" />}
        items={threats}
        color="bg-amber-50"
        borderColor="border-amber-200/60"
      />
    </div>
  );
}
