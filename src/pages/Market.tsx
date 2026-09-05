import { useMemo } from "react";
import { useOnboarding } from "@/lib/onboarding-context";
import { ModuleHeader, ModuleEmptyState } from "@/components/module-ui";
import {
  MarketReachSection,
  OpportunitySection,
  CompetitionSection,
} from "@/pages/Dashboard";
import HyperlocalIntelligence from "@/components/HyperlocalIntelligence";
import { MapPin, Filter, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const RADIUS_OPTIONS = [1, 2, 5, 10];

export default function Market() {
  const { feasibility: f, location, business, capital, radius, setRadius } = useOnboarding();

  // The competition map filters to businesses relevant to the selected
  // business category/sub-category. This module shows what that means.
  const filterNote = useMemo(() => {
    if (!f || !business) return null;
    const types = Array.from(new Set(f.competition.competitors.slice(0, 6).map((c) => c.type)));
    return types.length > 0 ? types.slice(0, 4).join(" · ") : null;
  }, [f, business]);

  if (!f || !business || !location) {
    return (
      <ModuleEmptyState
        title="Market & competition data needs your location"
        description="Choose your village/town and a business first — GramUdaan will estimate local demand, show nearby competitors filtered to your business type on the map, and explain your market opportunity."
      />
    );
  }

  return (
    <div className="space-y-5">
      <ModuleHeader
        icon={<MapPin className="h-5 w-5" />}
        title="Market & Competition"
        badge="estimated"
        subtitle={`What is happening around ${location.name}, ${location.district} for ${business.icon} ${business.name} — demand, nearby businesses, competition density and the map.`}
        actions={
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-white p-1">
            <Filter className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Radius</span>
            {RADIUS_OPTIONS.map((km) => (
              <button
                key={km}
                onClick={() => setRadius(km)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors",
                  radius === km ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {km} km
              </button>
            ))}
          </div>
        }
      />

      {filterNote && (
        <div className="flex items-start gap-2 rounded-xl border border-primary/10 bg-primary/[0.03] px-3.5 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            The map and competitor list below are <span className="font-semibold text-foreground">filtered to your business type</span> —
            {filterNote} — not every shop in the area.
          </span>
        </div>
      )}

      {/* Local market + opportunity */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <MarketReachSection f={f} />
        <OpportunitySection f={f} />
      </div>

      {/* Competition with map */}
      <CompetitionSection f={f} location={location} radius={radius} />

      {/* Hyperlocal market intelligence */}
      {location && business && capital > 0 ? (
        <HyperlocalIntelligence feasibility={f} location={location} business={business} capital={capital} radius={radius} />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-white p-5 text-center text-xs text-muted-foreground">
          Enter your capital during the assessment to unlock hyperlocal market intelligence for this location.
        </div>
      )}
    </div>
  );
}
