import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOnboarding } from "@/lib/onboarding-context";
import { formatIndianCurrency } from "@/data/assessment";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { matchSchemesForProfileSource, type SchemeMatch } from "@/engine/schemeMatching";
import {
  createDraft, regenerateText, recalcFinancial, validateDraft, consistencyDiffs, missingSections,
  renderDraftText, loadCurrentDraft, saveCurrentDraft, snapshotVersion, listVersions,
  schemeById, documentChecklist,
  type LoanDraft, type DraftVersion,
} from "@/lib/loanDraft";
import { downloadLoanPdf } from "@/lib/loanPdf";
import { Link, useSearchParams } from "react-router";
import {
  FileText, Download, Copy, Check, Save, AlertTriangle, ShieldAlert, Landmark,
  Eye, Pencil, RotateCcw, History, ChevronRight, Home, ExternalLink, Sparkles, ArrowUpRight, UserRound, Store, Calculator,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Small building blocks ─── */

function Field({ label, hint, badge, children }: { label: string; hint?: string; badge?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
        {badge && (
          <span className="rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-bold text-primary normal-case tracking-normal">{badge}</span>
        )}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[10px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
        <span className="text-primary">{icon}</span>
        {title}
      </h3>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

const money = (n: number) => formatIndianCurrency(Math.round(n || 0));

/* ─── Page ─── */

export default function Application() {
  const { feasibility, location, business, capital } = useOnboarding();
  const [params] = useSearchParams();
  const scheme = schemeById(params.get("scheme"));

  // Draft state (preserved across edits + analysis refreshes when identical)
  const [draft, setDraft] = useState<LoanDraft | null>(() => {
    const stored = loadCurrentDraft();
    const key = business && location ? `${business.id}|${location.id}|${capital || 0}` : "";
    if (stored && stored.anchors.analysisKey === key && stored.schemeId === (scheme?.id ?? null)) return stored;
    return null;
  });
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [versions, setVersions] = useState<DraftVersion[]>(() => listVersions());
  const [showVersions, setShowVersions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "none">("none");
  const [notice, setNotice] = useState<string | null>(null);
  const draftRef = useRef<LoanDraft | null>(draft);
  draftRef.current = draft;

  const anchoredScheme = scheme ?? schemeById(draft?.schemeId ?? null);
  const schemeMatch = useMemo<SchemeMatch | null>(() => {
    if (!feasibility || !business || !location) return null;
    if (!anchoredScheme) return null;
    const result = matchSchemesForProfileSource({
      businessId: business.id,
      businessName: business.name,
      businessCategory: business.category,
      state: location.state,
      district: location.district,
      contribution: feasibility.financial.availableContribution || capital,
      projectCost: feasibility.financial.totalProjectCost,
      fundingRequirement: feasibility.financial.potentialLoan,
    });
    return result.matches.find((m) => m.scheme.id === anchoredScheme.id) ?? null;
  }, [feasibility, business, location, capital, anchoredScheme]);

  // (Re)build draft when the underlying analysis identity changes.
  useEffect(() => {
    if (!feasibility || !business || !location) return;
    const cur = draftRef.current;
    if (cur && cur.anchors.analysisKey === `${business.id}|${location.id}|${capital || 0}` && cur.schemeId === (scheme?.id ?? cur.schemeId)) return;
    const fresh = createDraft({ feasibility, business, location, capital, scheme });
    if (fresh) setDraft(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feasibility, business?.id, location?.id, capital, scheme?.id]);

  // Persist latest draft as the user edits.
  useEffect(() => {
    if (draft) saveCurrentDraft(draft);
  }, [draft]);

  const update = useCallback((patch: (d: LoanDraft) => LoanDraft) => {
    setDraft((d) => (d ? patch(d) : d));
  }, []);

  if (!feasibility || !business || !location) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar variant="app" />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md animate-fade-in">
            <div className="h-16 w-16 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">No Analysis Found</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Run a business assessment first — the loan application is pre-filled from your financial analysis.
            </p>
            <Link to="/onboarding" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
              Start Assessment <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!draft) return null;

  const issues = validateDraft(draft);
  const blocking = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const diffs = consistencyDiffs(draft, draft.anchors);
  const missing = missingSections(draft);
  const errorsByField = new Map(issues.map((i) => [i.field, i] as const));

  const syncWithAnalysis = () => {
    const fresh = createDraft({ feasibility, business, location, capital, scheme: schemeById(draft.schemeId) });
    if (!fresh) return;
    // Preserve applicant details and any user-typed text edits.
    setDraft({
      ...fresh,
      meta: { ...fresh.meta, createdAt: draft.meta.createdAt, draftNo: draft.meta.draftNo },
      applicant: draft.applicant,
      project: { ...fresh.project, purpose: draft.project.purpose, equipment: draft.project.equipment, workingCapital: draft.project.workingCapital },
      market: { ...fresh.market, targetCustomers: draft.market.targetCustomers, opportunity: draft.market.opportunity, competition: draft.market.competition, pricing: draft.market.pricing },
    });
    setNotice("Financial details synced with your latest analysis. Your edits were preserved.");
  };

  const handleRegenerateText = () => {
    update((d) => regenerateText(d, feasibility));
    setNotice("AI-grounded sections regenerated from your current analysis.");
  };

  const handleSaveVersion = () => {
    setVersions(snapshotVersion(draft));
    setNotice(`Draft #${draft.meta.draftNo + 1} saved.`);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(renderDraftText(draft));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice("Clipboard unavailable — select the preview text manually.");
    }
  };

  const handleDownloadPdf = () => {
    if (blocking.length > 0) {
      setMode("edit");
      setNotice("Fix the highlighted financial issues before generating the PDF.");
      return;
    }
    setBusy("pdf");
    // Let the spinner paint once; jsPDF work is synchronous.
    setTimeout(() => {
      try {
        downloadLoanPdf(draft);
        setVersions(snapshotVersion(draft));
        setNotice("PDF downloaded. A draft version was saved.");
      } catch {
        setNotice("We couldn't generate the PDF right now. Your information is safe — please try again.");
      } finally {
        setBusy("none");
      }
    }, 120);
  };

  const setFin = (field: keyof LoanDraft["financial"], v: number) =>
    update((d) => recalcFinancial({ ...d, financial: { ...d.financial, [field]: v } }));
  const setApp = (field: keyof LoanDraft["applicant"], v: string) =>
    update((d) => ({ ...d, applicant: { ...d.applicant, [field]: v } }));
  const setBiz = (field: keyof LoanDraft["business"], v: string) =>
    update((d) => ({ ...d, business: { ...d.business, [field]: v } }));
  const setProj = (field: keyof LoanDraft["project"], v: string) =>
    update((d) => ({ ...d, project: { ...d.project, [field]: v } }));
  const setMkt = (field: keyof LoanDraft["market"], v: string) =>
    update((d) => ({ ...d, market: { ...d.market, [field]: v } }));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar variant="app" />
      <main className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-6 sm:py-8 flex-1">
        {/* Breadcrumb + header */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
          <Link to="/" className="hover:text-foreground transition-colors"><Home className="h-3.5 w-3.5" /></Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">Loan Application</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground font-serif-display">Loan Application Draft</h1>
              <p className="text-xs text-muted-foreground">AI-generated from your GramUdaan analysis — review before submission</p>
            </div>
          </div>
          <div className="sm:ml-auto flex items-center gap-2 flex-wrap">
            <div className="flex rounded-full border border-border bg-white p-0.5 text-xs font-semibold">
              <button onClick={() => setMode("edit")} className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors", mode === "edit" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button onClick={() => setMode("preview")} className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors", mode === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Eye className="h-3.5 w-3.5" /> Preview
              </button>
            </div>
            <div className="relative">
              <button onClick={() => setShowVersions((v) => !v)} className="flex items-center gap-1.5 rounded-full border border-border bg-white px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors">
                <History className="h-3.5 w-3.5" /> Draft #{draft.meta.draftNo}
              </button>
              {showVersions && (
                <div className="absolute right-0 top-full z-20 mt-1.5 w-72 rounded-xl border border-border bg-white p-1.5 shadow-lg">
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Saved drafts</p>
                  {versions.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">No saved drafts yet — click "Save draft".</p>}
                  {versions.map((v) => (
                    <button key={v.savedAt} onClick={() => { setDraft(v.draft); setShowVersions(false); setNotice(`Restored draft #${v.draftNo} (${new Date(v.savedAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}).`); }}
                      className="w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors">
                      <span className="font-semibold text-foreground">Draft #{v.draftNo}</span>
                      <span className="ml-2 text-muted-foreground">{new Date(v.savedAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notice */}
        {notice && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-xs text-primary">
            <Check className="h-4 w-4 mt-px flex-shrink-0" />
            <span>{notice}</span>
            <button className="ml-auto" onClick={() => setNotice(null)} aria-label="Dismiss"><span className="text-primary/70 hover:text-primary">✕</span></button>
          </div>
        )}

        {/* Scheme banner */}
        {anchoredScheme && (
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-primary/15 bg-primary/[0.04] px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white border border-primary/15 text-primary">
                <Landmark className="h-4.5 w-4.5 h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Potential financing option explored: {anchoredScheme.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  Selected from GramUdaan's preliminary scheme matching{schemeMatch ? ` — ${schemeMatch.level.toUpperCase()} match` : ""}. Not an approval or eligibility certificate.
                </p>
              </div>
            </div>
            <Link to="/dashboard" className="sm:ml-auto inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-white px-3.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted transition-colors">
              View matched schemes <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        {/* Consistency banner */}
        {diffs.length > 0 && (
          <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-xs font-bold text-amber-800">
              <AlertTriangle className="h-4 w-4" /> Some application details differ from your latest financial analysis
            </p>
            <ul className="mt-2 space-y-1">
              {diffs.map((d, i) => (
                <li key={i} className="text-[11px] text-amber-700">
                  <span className="font-semibold">{d.label}:</span> draft {d.draftValue} · analysis {d.analysisValue}
                </li>
              ))}
            </ul>
            <button onClick={syncWithAnalysis} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700 transition-colors">
              <RotateCcw className="h-3 w-3" /> Sync with Financial Analysis
            </button>
          </div>
        )}

        {/* Validation banner */}
        {(blocking.length > 0 || warnings.length > 0) && (
          <div className={cn("mb-4 rounded-2xl border p-4", blocking.length > 0 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50")}>
            <p className="flex items-center gap-2 text-xs font-bold text-foreground">
              <AlertTriangle className={cn("h-4 w-4", blocking.length > 0 ? "text-red-600" : "text-amber-600")} />
              {blocking.length > 0 ? "Please review before generating the PDF:" : "A few optional details are missing:"}
            </p>
            <ul className="mt-2 space-y-1">
              {[...blocking, ...warnings].map((i, idx) => (
                <li key={idx} className="text-[11px] text-muted-foreground">
                  <span className="font-semibold">{i.label}:</span> {i.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Missing info strip */}
        {missing.length > 0 && (
          <div className="mb-5 rounded-2xl border border-border bg-white p-4">
            <p className="text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-primary" /> Some information is missing — fill it in below</p>
            <div className="flex flex-wrap gap-1.5">
              {missing.map((m) => (
                <span key={m} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{m}</span>
              ))}
            </div>
          </div>
        )}

        {mode === "edit" ? (
          <div className="space-y-4">
            {/* A. Applicant */}
            <Card title="A. Applicant Details" icon={<UserRound className="h-4 w-4" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className={errorsByField.has("applicant.name") ? "" : ""}>
                  <Field label="Full name">
                    <Input value={draft.applicant.name} onChange={(e) => setApp("name", e.target.value)} placeholder="e.g. Ram Singh" className={errorsByField.has("applicant.name") ? "border-red-300" : ""} />
                  </Field>
                </div>
                <Field label="Mobile number" badge="recommended">
                  <Input value={draft.applicant.mobile} onChange={(e) => setApp("mobile", e.target.value)} inputMode="tel" placeholder="10-digit mobile" className={errorsByField.has("applicant.mobile") ? "border-amber-300" : ""} />
                </Field>
                <Field label="Email">
                  <Input value={draft.applicant.email} onChange={(e) => setApp("email", e.target.value)} type="email" placeholder="optional" />
                </Field>
                <Field label="Address">
                  <Input value={draft.applicant.address} onChange={(e) => setApp("address", e.target.value)} placeholder="Village / town, house or shop address" />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3.5 pt-1">
                <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">District</p>
                  <p className="text-sm font-semibold text-foreground truncate">{draft.anchors.district}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">State</p>
                  <p className="text-sm font-semibold text-foreground truncate">{draft.anchors.state}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">PIN code</p>
                  <p className="text-sm font-semibold text-foreground">{draft.anchors.pincode}</p>
                </div>
              </div>
            </Card>

            {/* B. Business */}
            <Card title="B. Business Details" icon={<Store className="h-4 w-4" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Field label="Proposed business">
                  <Input value={draft.business.name} onChange={(e) => setBiz("name", e.target.value)} />
                </Field>
                <Field label="Business category">
                  <Input value={draft.business.category} disabled className="opacity-70" />
                </Field>
                <Field label="Business stage">
                  <Input value={draft.business.stage} onChange={(e) => setBiz("stage", e.target.value)} placeholder="New enterprise / existing business" />
                </Field>
                <Field label="Relevant experience">
                  <Input value={draft.business.experience} onChange={(e) => setBiz("experience", e.target.value)} placeholder="e.g. 2 years in dairy farming" />
                </Field>
              </div>
              <Field label="Business description" badge="from analysis">
                <Textarea value={draft.business.description} onChange={(e) => setBiz("description", e.target.value)} className="min-h-16" />
              </Field>
              <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Analysis location</p>
                <p className="text-sm font-semibold text-foreground">{draft.business.locationLabel}</p>
              </div>
            </Card>

            {/* C. Project */}
            <Card title="C. Project Details" icon={<Calculator className="h-4 w-4" />}>
              <Field label="Purpose of loan" badge="AI draft">
                <Textarea value={draft.project.purpose} onChange={(e) => setProj("purpose", e.target.value)} className="min-h-16" />
              </Field>
              <Field label="Project description" badge="AI draft">
                <Textarea value={draft.project.description} onChange={(e) => setProj("description", e.target.value)} className="min-h-12" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Field label="Equipment / assets required" hint="Optional — add items if you know them">
                  <Input value={draft.project.equipment} onChange={(e) => setProj("equipment", e.target.value)} placeholder="e.g. milking machine, storage, feed" />
                </Field>
                <Field label="Working-capital requirement" hint="Optional — add if known">
                  <Input value={draft.project.workingCapital} onChange={(e) => setProj("workingCapital", e.target.value)} placeholder="e.g. 3 months of feed + operations" />
                </Field>
              </div>
            </Card>

            {/* D. Financial */}
            <Card title="D. Financial Details" icon={<FileText className="h-4 w-4" />}>
              <div className="rounded-xl border border-primary/15 bg-primary/[0.04] px-3.5 py-2.5 mb-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Calculated automatically from your financial analysis</p>
                <p className="text-[11px] text-muted-foreground">
                  Funding requirement = Project cost − Own contribution. Values refresh as you type; they start from the exact numbers in your Financial Overview.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <Field label="Own contribution">
                  <Input type="number" min={0} value={draft.financial.ownContribution || ""} onChange={(e) => setFin("ownContribution", Number(e.target.value))} className={errorsByField.has("financial.ownContribution") ? "border-red-300" : ""} />
                </Field>
                <Field label="Project cost">
                  <Input type="number" min={0} value={draft.financial.projectCost || ""} onChange={(e) => setFin("projectCost", Number(e.target.value))} className={errorsByField.has("financial.projectCost") ? "border-red-300" : ""} />
                </Field>
                <Field label="Funding requirement" badge="calculated">
                  <div className="flex h-9 items-center rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-bold text-primary">{money(draft.financial.fundingRequirement)}</div>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                <Field label="Proposed loan amount">
                  <Input type="number" min={0} value={draft.financial.proposedLoan || ""} onChange={(e) => setFin("proposedLoan", Number(e.target.value))} className={errorsByField.has("financial.proposedLoan") ? "border-red-300" : ""} />
                </Field>
                <Field label="Other funding sources">
                  <Input value={draft.financial.otherSources} onChange={(e) => update((d) => ({ ...d, financial: { ...d.financial, otherSources: e.target.value } }))} placeholder="e.g. family support (optional)" />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1 border-t border-border/60 mt-1 pt-3.5">
                <Field label="Expected monthly revenue" badge="estimate">
                  <Input type="number" min={0} value={draft.financial.monthlyRevenue || ""} onChange={(e) => setFin("monthlyRevenue", Number(e.target.value))} />
                </Field>
                <Field label="Estimated monthly expenses" badge="estimate">
                  <Input type="number" min={0} value={draft.financial.monthlyExpenses || ""} onChange={(e) => setFin("monthlyExpenses", Number(e.target.value))} />
                </Field>
                <Field label="Estimated monthly surplus" badge="estimate">
                  <Input type="number" min={0} value={draft.financial.monthlyProfit || ""} onChange={(e) => setFin("monthlyProfit", Number(e.target.value))} />
                </Field>
              </div>
            </Card>

            {/* E. Market */}
            <Card title="E. Market / Business Justification" icon={<Sparkles className="h-4 w-4" />}>
              <Field label="Target customers" badge="from analysis">
                <Textarea value={draft.market.targetCustomers} onChange={(e) => setMkt("targetCustomers", e.target.value)} className="min-h-12" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Field label="Local opportunity" badge="from analysis">
                  <Textarea value={draft.market.opportunity} onChange={(e) => setMkt("opportunity", e.target.value)} className="min-h-16" />
                </Field>
                <Field label="Competition" badge="from analysis">
                  <Textarea value={draft.market.competition} onChange={(e) => setMkt("competition", e.target.value)} className="min-h-16" />
                </Field>
              </div>
              <Field label="Pricing rationale" badge="from analysis">
                <Textarea value={draft.market.pricing} onChange={(e) => setMkt("pricing", e.target.value)} className="min-h-12" />
              </Field>
              <Field label="Business justification" badge="AI draft">
                <Textarea value={draft.market.justification} onChange={(e) => setMkt("justification", e.target.value)} className="min-h-24" />
              </Field>
              <button onClick={handleRegenerateText} className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors">
                <RotateCcw className="h-3.5 w-3.5" /> Regenerate AI-grounded sections
              </button>
            </Card>

            {/* Documents + scheme note */}
            <Card title="F. Documents Checklist" icon={<FileText className="h-4 w-4" />}>
              <ul className="space-y-1.5">
                {[...documentChecklist(draft.anchors, draft.schemeId), ...draft.extraDocuments.filter(Boolean)].map((doc, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground leading-snug">
                    <span className="text-emerald-600 font-bold mt-px">✓</span>
                    <span>{doc}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-muted-foreground">Final document requirements are determined by the concerned bank/authority.</p>
              <Field label="Additional documents" hint="One per line">
                <Textarea value={draft.extraDocuments.join("\n")} onChange={(e) => update((d) => ({ ...d, extraDocuments: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) }))} placeholder={"e.g. Electricity bill\nLand record copy"} className="min-h-14" />
              </Field>
            </Card>

            {/* Business plan integration */}
            <Card title="G. Business Plan" icon={<ExternalLink className="h-4 w-4" />}>
              <label className="flex items-start gap-2.5 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={draft.includeBusinessPlan} onChange={(e) => update((d) => ({ ...d, includeBusinessPlan: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                <span>
                  Include a note that your GramUdaan Business Plan (decision report) can be attached where the institution accepts supporting documents.
                </span>
              </label>
              <Link to="/report" className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors w-fit">
                Open Business Plan <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Card>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button onClick={() => setMode("preview")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors">
                <Eye className="h-4 w-4" /> Preview Application
              </button>
              <button onClick={handleSaveVersion} className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                <Save className="h-4 w-4" /> Save draft
              </button>
              <button onClick={handleDownloadPdf} disabled={busy === "pdf"} className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-bold text-background hover:opacity-90 transition-opacity disabled:opacity-50">
                <Download className="h-4 w-4" /> Generate PDF
              </button>
            </div>
          </div>
        ) : (
          /* ─── Preview ─── */
          <div>
            <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm">
              {/* Doc header */}
              <div className="bg-[#174f38] px-5 sm:px-8 py-5 text-white">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/70">GramUdaan</p>
                <h2 className="mt-1 text-lg sm:text-xl font-bold font-serif-display">Loan Application Draft</h2>
                <p className="text-xs text-white/75 mt-0.5">AI-generated draft for preparation purposes — not an official bank or government form</p>
              </div>
              <div className="px-5 sm:px-8 py-6 space-y-5 text-[13px]">
                <DocLine label="Application date" value={new Date(draft.meta.updatedAt || Date.now()).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} />
                <div className="border-t border-dashed border-border pt-4">
                  <DocHeading n="1">Applicant Details</DocHeading>
                  <DocLine label="Full name" value={draft.applicant.name || "Not provided"} />
                  <DocLine label="Mobile number" value={draft.applicant.mobile || "Not provided"} />
                  <DocLine label="Email" value={draft.applicant.email || "Not provided"} />
                  <DocLine label="Address" value={draft.applicant.address || "Not provided"} />
                  <DocLine label="District / State / PIN" value={`${draft.anchors.district}, ${draft.anchors.state} — ${draft.anchors.pincode}`} />
                </div>
                <div className="border-t border-dashed border-border pt-4">
                  <DocHeading n="2">Business Details</DocHeading>
                  <DocLine label="Proposed business" value={`${draft.business.name} (${draft.business.category})`} />
                  <DocLine label="Business description" value={draft.business.description || "Not provided"} />
                  <DocLine label="Location" value={draft.business.locationLabel} />
                  <DocLine label="Stage" value={draft.business.stage || "Not provided"} />
                  <DocLine label="Experience" value={draft.business.experience || "Not provided"} />
                </div>
                <div className="border-t border-dashed border-border pt-4">
                  <DocHeading n="3">Project Summary</DocHeading>
                  <p className="text-muted-foreground leading-relaxed mb-2">{draft.project.purpose}</p>
                  <DocLine label="Project description" value={draft.project.description} />
                  <DocLine label="Equipment / assets" value={draft.project.equipment || "Not provided"} />
                  <DocLine label="Working capital" value={draft.project.workingCapital || "Not provided"} />
                </div>
                <div className="border-t border-dashed border-border pt-4">
                  <DocHeading n="4">Financial Requirement</DocHeading>
                  <div className="overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-border/60">
                        <DocRow k="Applicant's own contribution" v={money(draft.financial.ownContribution)} />
                        <DocRow k="Estimated total project cost" v={money(draft.financial.projectCost)} />
                        <DocRow k="Funding requirement (calculated)" v={money(draft.financial.fundingRequirement)} strong />
                        <DocRow k="Proposed loan amount" v={money(draft.financial.proposedLoan)} />
                        <DocRow k="Other funding sources" v={draft.financial.otherSources || "None stated"} />
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">Funding requirement is calculated as Project cost − Own contribution.</p>
                  <DocHeading n="5">Business Projections (GramUdaan estimate)</DocHeading>
                  <div className="overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-border/60">
                        <DocRow k="Expected monthly revenue" v={money(draft.financial.monthlyRevenue)} />
                        <DocRow k="Estimated monthly expenses" v={money(draft.financial.monthlyExpenses)} />
                        <DocRow k="Estimated monthly surplus" v={money(draft.financial.monthlyProfit)} />
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">GramUdaan estimates — actual figures depend on market conditions and business execution.</p>
                </div>
                <div className="border-t border-dashed border-border pt-4">
                  <DocHeading n="6">Market Overview</DocHeading>
                  <DocLine label="Target customers" value={draft.market.targetCustomers} />
                  <DocLine label="Local opportunity" value={draft.market.opportunity} />
                  <DocLine label="Competition" value={draft.market.competition} />
                  <DocLine label="Pricing rationale" value={draft.market.pricing} />
                </div>
                <div className="border-t border-dashed border-border pt-4">
                  <DocHeading n="7">Business Justification</DocHeading>
                  <p className="text-muted-foreground leading-relaxed">{draft.market.justification}</p>
                </div>
                <div className="border-t border-dashed border-border pt-4">
                  <DocHeading n="8">Scheme / Financing Context</DocHeading>
                  {anchoredScheme ? (
                    <>
                      <DocLine label="Potential financing option explored" value={`${anchoredScheme.name}${schemeMatch ? ` (preliminary ${schemeMatch.level.toUpperCase()} match)` : ""}`} />
                      {anchoredScheme.supportStructure.map((s, i) => <DocLine key={i} label={s.label} value={s.text} />)}
                      <p className="mt-1.5 text-[11px] text-muted-foreground">Preliminary match — final eligibility, benefits and loan terms must be confirmed by the concerned bank/financial institution or implementing authority.</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground leading-relaxed">No specific scheme was selected — review "Government Schemes & Financing" on your dashboard for potentially relevant options.</p>
                  )}
                  {draft.includeBusinessPlan && (
                    <p className="mt-2 text-[11px] text-muted-foreground">• A GramUdaan Business Plan (business decision report) is available and may be attached where the institution accepts supporting documents.</p>
                  )}
                </div>
                <div className="border-t border-dashed border-border pt-4">
                  <DocHeading n="9">Documents Checklist</DocHeading>
                  <ul className="space-y-1.5">
                    {[...documentChecklist(draft.anchors, draft.schemeId), ...draft.extraDocuments.filter(Boolean)].map((doc, i) => (
                      <li key={i} className="flex items-start gap-2 text-muted-foreground leading-snug"><span className="text-emerald-600 font-bold mt-px">✓</span>{doc}</li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">Final document requirements are determined by the concerned bank/authority.</p>
                </div>
                <div className="border-t border-dashed border-border pt-4">
                  <DocHeading n="10">Declaration</DocHeading>
                  <p className="text-muted-foreground leading-relaxed mb-6">I confirm that the information provided in this application draft is true to the best of my knowledge, and I understand that the final application will be processed by the concerned bank/financial institution or implementing authority.</p>
                  <div className="grid grid-cols-2 gap-6 pt-2 border-t border-border/60">
                    <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-4">Applicant signature</p><div className="border-b border-foreground/40" /></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-4">Date</p><div className="border-b border-foreground/40" /></div>
                  </div>
                </div>
                {/* Disclaimer */}
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                  <ShieldAlert className="h-4 w-4 flex-shrink-0 text-amber-600 mt-0.5" />
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Prepared with GramUdaan. This document is an AI-generated application draft for preparation purposes. Final application format, eligibility, documentation, loan amount, interest rate and approval are determined by the concerned bank/financial institution or implementing authority. This is not an official application form and does not confirm eligibility, subsidy or loan approval.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
              <button onClick={() => setMode("edit")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                <Pencil className="h-4 w-4" /> Edit Application
              </button>
              <button onClick={handleCopy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy draft"}
              </button>
              <button onClick={handleDownloadPdf} disabled={busy === "pdf"} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                {busy === "pdf" ? (
                  <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" /> Generating PDF…</>
                ) : (
                  <><Download className="h-4 w-4" /> Generate PDF</>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

/* ─── Tiny doc helpers for preview ─── */

function DocHeading({ n, children }: { n: number | string; children: React.ReactNode }) {
  return <h4 className="mb-2 mt-3 text-xs font-bold uppercase tracking-wider text-[#174f38] first:mt-0">{n}. {children}</h4>;
}

function DocLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="leading-relaxed">
      <span className="font-semibold text-foreground">{label}: </span>
      <span className="text-muted-foreground">{value}</span>
    </p>
  );
}

function DocRow({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <tr className={cn(strong && "bg-primary/5")}>
      <td className={cn("px-3 py-2 text-muted-foreground", strong && "font-bold text-foreground")}>{k}</td>
      <td className={cn("px-3 py-2 text-right font-semibold text-foreground", strong && "text-primary")}>{v}</td>
    </tr>
  );
}
