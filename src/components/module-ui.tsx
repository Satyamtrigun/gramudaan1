import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowUpRight, Store } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared page furniture for GramUdaan app modules (rendered inside AppShell).
 * Keeps module pages visually consistent without duplicating layout code.
 */

export function ModuleHeader({
  icon,
  title,
  subtitle,
  badge,
  actions,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif-display text-lg font-bold text-foreground leading-tight sm:text-xl">
              {title}
            </h1>
            {badge && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Full-width empty state shown when no assessment has been run yet. */
export function ModuleEmptyState({
  title,
  description,
  icon,
  primaryLabel = "Start Assessment",
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  primaryLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white p-6 sm:p-10">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          {icon ?? <Store className="h-8 w-8 text-muted-foreground" />}
        </div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <Link
          to="/onboarding"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {primaryLabel}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

/** Compact metric block used in module stat rows. */
export function StatCard({
  label,
  value,
  tone = "neutral",
  sub,
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: "positive" | "warning" | "negative" | "neutral" | "brand";
  sub?: string;
  className?: string;
}) {
  const tones: Record<string, string> = {
    positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    negative: "border-red-200 bg-red-50 text-red-700",
    brand: "border-primary/15 bg-primary/5 text-primary",
    neutral: "border-border bg-white",
  };
  return (
    <div className={cn("rounded-2xl border p-4", tones[tone], className)}>
      <p className={cn("text-[10px] font-bold uppercase tracking-wider", tone === "neutral" ? "text-muted-foreground" : "opacity-80")}>
        {label}
      </p>
      <p className="mt-1 font-serif-display text-xl font-bold leading-tight">{value}</p>
      {sub && <p className={cn("mt-1 text-[11px] leading-snug", tone === "neutral" ? "text-muted-foreground" : "opacity-80")}>{sub}</p>}
    </div>
  );
}
