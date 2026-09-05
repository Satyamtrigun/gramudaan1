import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
// leaflet.css is imported once in src/main.tsx (app shell) so the map styles
// are always present; keep no duplicate copy here.
import type { DistrictFeature } from "@/services/geo/boundaries";
import type { LngLat } from "@/services/geo/geoUtils";

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
  sublabel?: string;
}

interface IndiaMapProps {
  point?: MapPoint | null;
  radiusKm?: number;
  district?: DistrictFeature | null;
  neighbors?: DistrictFeature[];
  /** Estimated competitor dots rendered inside the analysis radius. */
  competitors?: MapPoint[];
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
}

const INDIA_CENTER: [number, number] = [22.6, 79.4];
const INDIA_ZOOM = 5;

const SELECTED_FILL = "#1a3a2a";
const NEIGHBOR_FILL = "#3f7d4e";

const PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
  <path d="M17 1C8.2 1 1 8.1 1 16.9 1 28.9 17 43 17 43s16-14.1 16-26.1C33 8.1 25.8 1 17 1z" fill="#1a3a2a" stroke="#ffffff" stroke-width="2"/>
  <circle cx="17" cy="16.5" r="6" fill="#ffffff"/>
  <circle cx="17" cy="16.5" r="3.2" fill="#2e7d4f"/>
</svg>`;

const DOT_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
  <circle cx="9" cy="9" r="6" fill="#d97706" stroke="#ffffff" stroke-width="2"/>
</svg>`;

function boundsOfDistrict(polygons: LngLat[][][]): L.LatLngBounds | null {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const poly of polygons) {
    for (const ring of poly) {
      for (const [lng, lat] of ring) {
        if (lat < south) south = lat;
        if (lat > north) north = lat;
        if (lng < west) west = lng;
        if (lng > east) east = lng;
      }
    }
  }
  if (!Number.isFinite(south)) return null;
  return L.latLngBounds([south, west], [north, east]);
}

export default function IndiaMap({
  point,
  radiusKm,
  district,
  neighbors = [],
  competitors = [],
  onMapClick,
  className = "",
}: IndiaMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const districtLayerRef = useRef<L.LayerGroup | null>(null);
  const dotsLayerRef = useRef<L.LayerGroup | null>(null);
  const [tileError, setTileError] = useState(false);
  // Keep the latest click handler accessible from the once-created map.
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  // ── Init map once ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: INDIA_CENTER,
      zoom: INDIA_ZOOM,
      zoomControl: false,
      attributionControl: true,
      minZoom: 4,
      maxZoom: 18,
      worldCopyJump: false,
    });
    map.zoomControl = L.control.zoom({ position: "topleft" }).addTo(map);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    map.on("tileerror", () => setTileError(true));
    map.on("click", (e: L.LeafletMouseEvent) => {
      onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;

    // Production hardening: if the container was hidden or mid-layout when the
    // map was created (lazy chunk loads, fonts/images shifting layout, mobile
    // rotation), Leaflet keeps the stale/zero size forever unless invalidated.
    // Dev previews mask this because iframe/window resize events repair the
    // map; production deployments never fire one.
    let raf = 0;
    const invalidate = () => {
      if (!mapRef.current) return;
      mapRef.current.invalidateSize();
    };
    // First pass after mount (one frame), then again after fonts/layout settle.
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => invalidate());
    });
    const settleTimer = window.setTimeout(() => invalidate(), 300);

    // Re-invalidate whenever the container itself changes size (e.g. sidebar
    // toggles, mobile keyboard, responsive class changes).
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => invalidate());
      observer.observe(el);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settleTimer);
      observer?.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      districtLayerRef.current = null;
      dotsLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Marker + radius circle sync ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }

    if (!point) return;

    const latlng: [number, number] = [point.lat, point.lng];
    const icon = L.divIcon({
      className: "",
      html: PIN_SVG,
      iconSize: [34, 44],
      iconAnchor: [17, 42],
      popupAnchor: [0, -38],
    });
    const marker = L.marker(latlng, { icon, keyboard: true }).addTo(map);
    if (point.label) {
      marker.bindTooltip(point.label, { direction: "top", offset: [0, -40], opacity: 0.95 });
      marker.bindPopup(`<strong>${point.label}</strong>${point.sublabel ? `<br/><span style="color:#556">${point.sublabel}</span>` : ""}`);
    }
    markerRef.current = marker;

    if (radiusKm && radiusKm > 0) {
      const circle = L.circle(latlng, {
        radius: radiusKm * 1000,
        color: SELECTED_FILL,
        weight: 1.6,
        dashArray: "6 5",
        fillColor: SELECTED_FILL,
        fillOpacity: 0.06,
      }).addTo(map);
      circleRef.current = circle;
    }
  }, [point?.lat, point?.lng, point?.label, radiusKm]);

  // ── Competitor dots sync (kept above district fills) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (dotsLayerRef.current) {
      dotsLayerRef.current.remove();
      dotsLayerRef.current = null;
    }
    if (!point || competitors.length === 0) return;

    const group = L.layerGroup().addTo(map);
    for (const c of competitors) {
      const icon = L.divIcon({
        className: "",
        html: DOT_SVG,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -10],
      });
      const marker = L.marker([c.lat, c.lng], { icon, keyboard: false });
      if (c.label) {
        marker.bindTooltip(
          `<strong>${c.label}</strong>${c.sublabel ? `<br/><span style="color:#7c4a03;font-size:11px">${c.sublabel}</span>` : ""}`,
          { direction: "top", offset: [0, -9], opacity: 0.95 },
        );
      }
      marker.addTo(group);
    }
    dotsLayerRef.current = group;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitors, point?.lat, point?.lng]);

  // ── District + neighbour polygon sync ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (districtLayerRef.current) {
      districtLayerRef.current.remove();
      districtLayerRef.current = null;
    }
    if (!district) return;

    const group = L.layerGroup().addTo(map);
    const toPolygon = (poly: LngLat[][]): L.LatLngExpression[][] =>
      poly.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number]));

    // Selected district — deeper green emphasis
    for (const poly of district.polygons) {
      const layer = L.polygon(toPolygon(poly), {
        color: "#0c2418",
        weight: 2.4,
        fillColor: SELECTED_FILL,
        fillOpacity: 0.24,
        interactive: false,
      }).addTo(group);
      layer.bindTooltip(district.name, { sticky: true, opacity: 0.9 });
    }

    // Neighbouring districts — subtle treatment
    for (const n of neighbors) {
      for (const poly of n.polygons) {
        const layer = L.polygon(toPolygon(poly), {
          color: NEIGHBOR_FILL,
          weight: 1.3,
          fillColor: NEIGHBOR_FILL,
          fillOpacity: 0.1,
          interactive: false,
        }).addTo(group);
        layer.bindTooltip(n.name, { sticky: true, opacity: 0.9 });
      }
    }

    districtLayerRef.current = group;
  }, [district?.key, district?.polygons, neighbors]);

  // ── Fit view when the selection changes (not on radius-only changes) ──
  const fitKey = `${point?.lat ?? ""}|${point?.lng ?? ""}|${district?.key ?? ""}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (district) {
      const b = boundsOfDistrict(district.polygons);
      if (b) map.fitBounds(b, { padding: [28, 28], maxZoom: 11 });
      else if (district.polygons[0]?.[0]?.[0]) {
        const [lng, lat] = district.polygons[0][0][0];
        map.setView([lat, lng], 9);
      }
    } else if (point) {
      const zoom = radiusKm && radiusKm >= 10 ? 10 : 11;
      map.setView([point.lat, point.lng], zoom, { animate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  const resetToIndia = () => {
    mapRef.current?.flyTo(INDIA_CENTER, INDIA_ZOOM, { duration: 0.7 });
  };

  const fitSelection = () => {
    const map = mapRef.current;
    if (!map) return;
    if (district) {
      const b = boundsOfDistrict(district.polygons);
      if (b) map.flyToBounds(b, { padding: [28, 28], maxZoom: 11, duration: 0.7 });
      return;
    }
    if (point) map.flyTo([point.lat, point.lng], radiusKm && radiusKm >= 10 ? 10 : 12, { duration: 0.7 });
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border bg-[#e8ede4] ${className}`}>
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* floating controls */}
      <div className="absolute right-2.5 top-2.5 z-[500] flex flex-col gap-1.5">
        <button
          type="button"
          onClick={fitSelection}
          title="Fit selected location"
          className="rounded-lg border border-border/70 bg-white/95 px-2.5 py-2 text-[11px] font-semibold text-[#1a3a2a] shadow-sm hover:bg-white transition-colors backdrop-blur"
        >
          ◎ Fit
        </button>
        <button
          type="button"
          onClick={resetToIndia}
          title="Reset map to India"
          className="rounded-lg border border-border/70 bg-white/95 px-2.5 py-2 text-[11px] font-semibold text-[#1a3a2a] shadow-sm hover:bg-white transition-colors backdrop-blur"
        >
          India
        </button>
      </div>

      {/* legend */}
      {(district || point) && (
        <div className="absolute bottom-9 left-2.5 z-[500] flex flex-wrap items-center gap-2.5 rounded-lg border border-border/60 bg-white/90 px-2.5 py-1.5 text-[10px] font-medium text-[#3d5545] shadow-sm backdrop-blur">
          {point && (
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SELECTED_FILL }} /> Selected location
            </span>
          )}
          {district && (
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-[2px] border" style={{ borderColor: SELECTED_FILL, background: `${SELECTED_FILL}33` }} /> Selected district
            </span>
          )}
          {competitors.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full border" style={{ background: "#d97706", borderColor: "#fff" }} /> Estimated competitor
            </span>
          )}
          {neighbors.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-[2px] border" style={{ borderColor: NEIGHBOR_FILL, background: `${NEIGHBOR_FILL}22` }} /> Nearby districts
            </span>
          )}
          {radiusKm ? <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-[#2d5a3d]" /> {radiusKm} km analysis</span> : null}
        </div>
      )}

      {/* map attribution + tile error note */}
      {tileError && (
        <div className="absolute left-2.5 top-2.5 z-[500] rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-1.5 text-[11px] font-medium text-amber-800 shadow-sm">
          Map tiles could not load — check your internet connection.
        </div>
      )}
    </div>
  );
}

