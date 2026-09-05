import { useMemo, useState } from "react";
import { useOnboarding } from "@/lib/onboarding-context";
import { formatIndianCurrency } from "@/data/assessment";
import { SCHEME_FILTERS } from "@/data/schemes";
import {
  matchSchemesForProfileSource,
  formatSchemeRupees,
  type SchemeMatch,
  type SchemeMatchResult,
} from "@/engine/schemeMatching";
import {
  Landmark,
  Star,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  Copy,
  Check,
  X,
  ShieldAlert,
  Info,
  BadgeCheck,
  ClipboardList,
  Building2,
  ArrowRight,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router";

/* ─── Level helpers ─── */

const LEVEL_META: Record<SchemeMatch["level"], { label: string; chip: string; dot: string }> = {
  high: { label: "HIGH MATCH", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  possible: { label: "POSSIBLE MATCH", chip: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  low: { label: "LOW MATCH", chip: "bg-muted text-muted-foreground border-border", dot: "bg-gray-400" },
};

function LevelChip({ level }: { level: SchemeMatch["level"] }) {
  const meta = LEVEL_META[level];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wide", meta.chip)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

/* ─── Match card ─── */

function MatchCard({ m, highlighted, onOpen }: { m: SchemeMatch; highlighted?: boolean; onOpen: (id: string) => void }) {
  const reasons = m.reasons.slice(0, 2);
  const open = () => onOpen(m.scheme.id);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${m.scheme.name} — ${LEVEL_META[m.level].label}. Open scheme details`}
      title="Open scheme details"
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className={cn(
        "group cursor-pointer rounded-2xl border p-4 sm:p-5 transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 flex flex-col gap-3",
        highlighted ? "border-primary/30 bg-primary/[0.03] ring-1 ring-primary/10" : "border-border bg-white hover:border-primary/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={cn("mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl", highlighted ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
            <Landmark className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground leading-tight">{m.scheme.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{m.scheme.shortDescription}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <LevelChip level={m.level} />
        <span className="text-[10px] font-medium text-muted-foreground">
          {m.percent}% of evaluated criteria
        </span>
        <span className="flex-1" />
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary group-hover:gap-1.5 transition-all">
          View details <ArrowRight className="h-3 w-3" />
        </span>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 h-6 overflow-hidden">
        <div className="flex-1 rounded-full bg-muted h-1.5 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full",
              m.level === "high" ? "bg-emerald-500" : m.level === "possible" ? "bg-amber-500" : "bg-gray-300",
            )}
            style={{ width: `${m.percent}%` }}
          />
        </div>
      </div>

      {m.level !== "low" && reasons.length > 0 && (
        <ul className="space-y-1">
          {reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
              <span className="text-emerald-600 font-bold mt-px">✓</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      )}

      {m.level === "possible" && m.gaps.length > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700 leading-snug">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
          <span>{m.gaps[0].text}</span>
        </p>
      )}

      {m.level === "low" && m.exclusions.length > 0 && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          <span className="font-semibold text-foreground/70">Why not ranked higher: </span>
          {m.exclusions[0].text}
        </p>
      )}
    </div>
  );
}

/* ─── Official source link (robust open + copy fallback) ─── */

function OfficialSourceLink({ url }: { url: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "blocked">("idle");

  const copyRaw = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(url).catch(() => {});
  };

  const handleOpen = () => {
    let opened = false;
    try {
      // Some embedded previews block new tabs; detect that and fall back to copy.
      const win = window.open(url, "_blank", "noopener,noreferrer");
      opened = !!win;
    } catch {
      opened = false;
    }
    if (!opened) {
      copyRaw();
      setStatus("blocked");
      window.setTimeout(() => setStatus((s) => (s === "blocked" ? "idle" : s)), 6000);
    }
  };

  const handleCopy = () => {
    copyRaw();
    setStatus("copied");
    window.setTimeout(() => setStatus((s) => (s === "copied" ? "idle" : s)), 2200);
  };

  return (
    <div className="mt-2.5 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-[10px] leading-snug text-muted-foreground break-all font-mono">{url}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Open official page
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted transition-colors"
        >
          {status === "copied" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
          {status === "copied" ? "Copied" : "Copy link"}
        </button>
      </div>
      {status === "blocked" && (
        <p className="mt-2 flex items-start gap-1.5 text-[10px] font-medium text-amber-700 leading-snug">
          <Info className="h-3 w-3 flex-shrink-0 mt-px" />
          This preview could not open the page automatically — the official link has been copied. Paste it in your browser.
        </p>
      )}
      {status === "copied" && (
        <p className="mt-2 flex items-start gap-1.5 text-[10px] font-medium text-emerald-700 leading-snug">
          <Check className="h-3 w-3 flex-shrink-0 mt-px" />
          Official link copied to clipboard.
        </p>
      )}
    </div>
  );
}

/* ─── Detail dialog ─── */

function DialogShell({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white border border-border shadow-2xl animate-slide-up">
        {children}
      </div>
    </div>
  );
}

function SchemeDetailDialog({
  m,
  profileText,
  onClose,
  onDraft,
}: {
  m: SchemeMatch;
  profileText: string;
  onClose: () => void;
  onDraft: (m: SchemeMatch) => void;
}) {
  const s = m.scheme;
  return (
    <DialogShell onClose={onClose} label={`${s.name} scheme details`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 sm:px-6 py-4 sticky top-0 bg-white rounded-t-2xl z-10">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Landmark className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-foreground leading-tight">{s.name}</h3>
            <p className="text-xs text-muted-foreground">Potentially relevant · {profileText}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close scheme details"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-5 sm:px-6 py-5 space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <LevelChip level={m.level} />
          <span className="text-[11px] text-muted-foreground">
            {m.percent}% of evaluated matching criteria
          </span>
        </div>

        {/* About */}
        <Block icon={<Info className="h-3.5 w-3.5" />} title="About">
          <p className="text-sm text-muted-foreground leading-relaxed">{s.about}</p>
        </Block>

        {/* Who it may support */}
        <Block icon={<Building2 className="h-3.5 w-3.5" />} title="Who it may support">
          <ul className="space-y-1">
            {s.whoItSupports.map((w, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm text-muted-foreground leading-snug">
                <span className="text-primary mt-0.5">•</span>{w}
              </li>
            ))}
          </ul>
        </Block>

        {/* Support structure */}
        <Block icon={<BadgeCheck className="h-3.5 w-3.5" />} title="Financing / support">
          <div className="space-y-2.5">
            {s.supportStructure.map((d, i) => (
              <div key={i} className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-foreground mb-0.5">{d.label}</p>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{d.text}</p>
              </div>
            ))}
          </div>
        </Block>

        {/* Your match */}
        <Block icon={<ClipboardList className="h-3.5 w-3.5" />} title="Why it matches your profile">
          {m.reasons.length > 0 ? (
            <ul className="space-y-1.5">
              {m.reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm text-muted-foreground leading-snug">
                  <span className="text-emerald-600 font-bold mt-px">✓</span>
                  <span><span className="font-semibold text-foreground/80">{r.label}: </span>{r.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No positive criteria could be confirmed from the available profile.</p>
          )}
          {m.gaps.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-1.5">To confirm / verify</p>
              <ul className="space-y-1">
                {m.gaps.map((g, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-amber-700 leading-snug">
                    <span className="font-bold mt-px">≈</span>
                    <span>{g.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Block>

        {/* What you may need */}
        <Block icon={<FileText className="h-3.5 w-3.5" />} title="What you may need">
          <ul className="space-y-1">
            {s.requiredDocuments.map((d, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm text-muted-foreground leading-snug">
                <span className="text-primary mt-0.5">•</span>{d}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">The exact checklist is set by the bank / implementing authority.</p>
        </Block>

        {/* Next steps */}
        <Block icon={<ArrowRight className="h-3.5 w-3.5" />} title="Next steps">
          <ol className="space-y-1.5">
            {s.applicationProcess.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground leading-snug">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        </Block>

        {/* Sources */}
        <div className="rounded-xl border border-border p-3.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-bold text-foreground/80">Source: </span>{s.officialSource.name}
          </p>
          <OfficialSourceLink url={s.officialSource.url} />
          <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-semibold">Note: </span>{s.note} GramUdaan's match is preliminary — it is not an approval or an eligibility certificate.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            onClick={() => onDraft(m)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Prepare Application Draft
          </button>
          <Link
            to="/report"
            onClick={onClose}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            <ClipboardList className="h-4 w-4" />
            Generate Business Plan
          </Link>
        </div>
      </div>
    </DialogShell>
  );
}

/* ─── Small block header ─── */

function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-foreground mb-2">
        <span className="text-primary">{icon}</span>
        {title}
      </h4>
      {children}
    </div>
  );
}

/* ─── Main section ─── */

export default function SchemesSection() {
  const { feasibility, location, business, capital } = useOnboarding();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showHow, setShowHow] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const result: SchemeMatchResult | null = useMemo(() => {
    if (!feasibility || !business || !location) return null;
    return matchSchemesForProfileSource({
      businessId: business.id,
      businessName: business.name,
      businessCategory: business.category,
      state: location.state,
      district: location.district,
      contribution: feasibility.financial.availableContribution || capital,
      projectCost: feasibility.financial.totalProjectCost,
      fundingRequirement: feasibility.financial.potentialLoan,
    });
  }, [feasibility, business, location, capital]);

  if (!result || !feasibility || !business || !location) return null;

  const fin = feasibility.financial;
  const visibleSchemes = filter === "all" ? result.matches : result.matches.filter((m) => m.scheme.filterTags.includes(filter));
  const relevantCount = result.matches.filter((m) => m.level !== "low").length;
  const top = result.topMatch;
  const showTopCard = filter === "all" && top !== null && top.level !== "low";
  const others = visibleSchemes.filter((m) => m !== top);

  const availableFilters = SCHEME_FILTERS.filter((f) =>
    f.id === "all" ? true : result.matches.some((m) => m.scheme.filterTags.includes(f.id)),
  );

  const profileText = `${location.name} · ${business.name} · ${formatIndianCurrency(capital || fin.availableContribution)} contribution`;

  return (
    <div className="rounded-2xl border border-border bg-white p-5 sm:p-6 transition-all hover:shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Government Schemes & Financing</h3>
            <p className="text-xs text-muted-foreground">Potentially relevant programs matched to your business profile</p>
          </div>
        </div>
        <span className="sm:ml-auto inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
          ≈ Match — verify with official source
        </span>
      </div>

      {/* Profile summary */}
      <div className="rounded-xl border border-primary/10 bg-primary/[0.04] p-4 mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-2">Schemes are ranked for your business</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="font-semibold text-foreground">📍</span> {location.name}, {location.district}</span>
          <span className="flex items-center gap-1"><span className="font-semibold text-foreground">🏪</span> {business.name}</span>
          <span className="flex items-center gap-1"><span className="font-semibold text-foreground">💰</span> {formatIndianCurrency(fin.availableContribution)} own capital</span>
          <span className="flex items-center gap-1"><span className="font-semibold text-foreground">📊</span> {formatIndianCurrency(fin.totalProjectCost)} project cost</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          {fin.potentialLoan > 0
            ? `Your estimated external financing need is ${formatIndianCurrency(fin.potentialLoan)}. Programs below are ranked against that need and your business type.`
            : `No external financing is required for this structure; programs below are ranked by business-type fit only.`}
        </p>
      </div>

      {/* Result count */}
      <p className="text-sm text-foreground mb-3">
        {relevantCount > 0 ? (
          <>Based on your profile, GramUdaan found <span className="font-bold text-primary">{relevantCount} potentially relevant {relevantCount === 1 ? "program" : "programs"}</span> to investigate.</>
        ) : (
          <>Based on the current profile, no scheme in GramUdaan's verified catalog shows a strong fit. The closest options are listed below — confirm any of them with the implementing authority.</>
        )}
      </p>

      {/* Filters */}
      {availableFilters.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {availableFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors",
                filter === f.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Top match */}
      {showTopCard && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="h-4 w-4 text-amber-500 fill-amber-400" />
            <p className="text-xs font-bold uppercase tracking-wider text-foreground">Recommended to explore first</p>
          </div>
          <MatchCard m={top!} highlighted onOpen={setActiveId} />
        </div>
      )}

      {/* Other matches */}
      {others.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            {showTopCard ? "Other programs to explore" : "Programs to explore"}
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {others.map((m) => (
              <MatchCard key={m.scheme.id} m={m} onOpen={setActiveId} />
            ))}
          </div>
        </div>
      )}

      {/* How matching worked */}
      <div className="mt-4 border-t border-border pt-3">
        <button
          onClick={() => setShowHow((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
          aria-expanded={showHow}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          How did GramUdaan match these schemes?
          {showHow ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {showHow && (
          <div className="mt-2 rounded-xl bg-muted/40 p-3.5 animate-fade-in">
            <p className="text-xs text-muted-foreground leading-relaxed">
              GramUdaan compared your profile against each scheme's published scope using fixed, transparent rules. It considered:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["Business type", "Location (state)", "Project cost", "Your contribution", "Financing need"].map((k) => (
                <span key={k} className="rounded-full bg-white border border-border px-2.5 py-0.5 text-[11px] font-medium text-foreground/80">{k}</span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
              Match % shows only the criteria GramUdaan could evaluate from the information you provided. Nothing here confirms eligibility — that is decided by the scheme's implementing authority.
            </p>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <ShieldAlert className="h-4 w-4 flex-shrink-0 text-amber-600 mt-0.5" />
        <div>
          <p className="text-[11px] font-bold text-amber-800">Preliminary AI-assisted match — not an eligibility confirmation</p>
          <p className="text-[11px] text-amber-700 leading-relaxed mt-0.5">{result.disclaimer} {result.verifyNote}</p>
        </div>
      </div>

      {/* Dialogs */}
      {activeId && top && (
        <SchemeDetailDialog
          key={activeId}
          m={result.matches.find((x) => x.scheme.id === activeId) ?? top}
          profileText={profileText}
          onClose={() => setActiveId(null)}
          onDraft={(m) => {
            setActiveId(null);
            navigate(`/application?scheme=${encodeURIComponent(m.scheme.id)}`);
          }}
        />
      )}
    </div>
  );
}
