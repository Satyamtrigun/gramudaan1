import { useOnboarding } from "@/lib/onboarding-context";
import { ModuleHeader } from "@/components/module-ui";
import { formatIndianCurrency } from "@/data/assessment";
import { FileText, TrendingUp, IndianRupee, Compass, Scale, ArrowRight, Download } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

export default function Reports() {
  const { feasibility: f, business, location } = useOnboarding();
  const ready = Boolean(f && business && location);

  const tools = [
    {
      to: "/report",
      icon: <TrendingUp className="h-5 w-5" />,
      title: "Business Decision Report",
      desc: "The complete feasibility document — score, market, SWOT, risks, pricing, financial structure and action plan — readable and printable.",
      accent: "from-emerald-500 to-emerald-700",
      status: ready ? `Ready · ${f!.overallScore}/100 feasibility` : "Run an assessment to generate",
      cta: "Open report",
    },
    {
      to: "/application",
      icon: <IndianRupee className="h-5 w-5" />,
      title: "Loan Application Draft",
      desc: "An editable, downloadable application draft pre-filled from your financial structure and matched schemes — built for bank submission.",
      accent: "from-teal-500 to-emerald-600",
      status: ready ? `Based on ~${formatIndianCurrency(f!.financial.totalProjectCost)} project cost` : "Run an assessment to generate",
      cta: "Prepare draft",
    },
    {
      to: "/plan",
      icon: <Compass className="h-5 w-5" />,
      title: "Business Plan Journey",
      desc: "The guided 8-step advisory journey — from location and business choice to capital, funding, profitability, risk and a final action plan.",
      accent: "from-sky-500 to-blue-600",
      status: ready ? `For ${business!.icon} ${business!.name}` : "Start the journey",
      cta: "Open journey",
    },
    {
      to: "/compare",
      icon: <Scale className="h-5 w-5" />,
      title: "Compare Businesses",
      desc: "Put your idea next to alternative businesses and see investment, revenue, profit, risk and feasibility side by side.",
      accent: "from-amber-500 to-orange-600",
      status: ready ? `${location!.name} context available` : "Pick businesses to compare",
      cta: "Compare now",
    },
  ];

  return (
    <div className="space-y-5">
      <ModuleHeader
        icon={<FileText className="h-5 w-5" />}
        title="Reports & Documents"
        subtitle="Every GramUdaan document, generated live from the same business analysis — no separate data, no stale numbers."
      />

      {/* Tools grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tools.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
          >
            <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", t.accent)} />
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground transition-colors group-hover:bg-emerald-600/10 group-hover:text-emerald-700">
                {t.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">{t.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.desc}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1 text-[10px] font-bold text-foreground/70">
                <span className={cn("h-1.5 w-1.5 rounded-full", ready ? "bg-emerald-500" : "bg-amber-400")} />
                {t.status}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
                {t.cta} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Footer note */}
      <div className="flex items-start gap-2 rounded-2xl border border-border bg-white px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        <Download className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <span>
          The Decision Report is printable/shareable with bank officers and partners; the Loan Application Draft can be exported as PDF.
          Everything is regenerated from your current inputs whenever you edit the assessment.
        </span>
      </div>
    </div>
  );
}
