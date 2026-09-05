// ─── Real India district boundaries (GADM-derived, MIT) ───
// Source: https://github.com/geohacker/india — administrative district
// polygons for India (594 districts, GADM). Fetched once from the raw CDN at
// runtime and cached (Cache API + in-memory). Geometries are simplified on
// first load with Ramer–Douglas–Peucker so drawing and adjacency math stay
// fast. Nothing here is hand-drawn — every polygon comes from the dataset.
//
// Directory pincodes use modern district names (e.g. "PRAYAGRAJ") while this
// layer keeps older census-era names ("Allahabad"), so lookups first consult a
// rename map and then fall back to true point-in-polygon containment.

import { normName, pointInPolygons, polygonsSeparationMeters, simplifyRing, bboxOfPolygons, type LngLat } from "./geoUtils";

export const DISTRICT_BOUNDARY_URL =
  "https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson";

const CACHE_NAME = "ruralbiz-bounds-v1";
const SIMPLIFY_TOLERANCE_DEG = 0.004; // ≈ 440 m — fine at district zoom

export interface DistrictFeature {
  /** Stable unique key. */
  key: string;
  name: string;
  state: string;
  polygons: LngLat[][][];
  bbox: [number, number, number, number];
}

/** Well-known modern district renames relative to the census-era GADM names. */
const DISTRICT_RENAME: Record<string, string> = {
  prayagraj: "allahabad",
  ayodhya: "faizabad",
  barabanki: "bara banki",
  amroha: "jyotiba phule nagar",
  jyotibaphulenagar: "jyotiba phule nagar",
  raebareli: "rae bareli",
  "sant ravidas nagar": "sant ravi das nagar",
  bhadohi: "sant ravi das nagar",
  badaun: "badaun",
  budaun: "badaun",
  kheri: "lakhimpur kheri",
  "lakhimpur kheri": "lakhimpur kheri",
  "kanpur nagar": "kanpur",
  "gautam buddha nagar": "gautam buddha nagar",
  "siddharth nagar": "siddharth nagar",
  "faizabad": "faizabad",
  // Karnataka renames
  "bengaluru urban": "bangalore urban",
  "bengaluru rural": "bangalore rural",
  mysuru: "mysore",
  "chikkamagaluru": "chikmagalur",
  tumakuru: "tumkur",
  ballari: "bellary",
  "chamarajanagara": "chamarajanagar",
  shivamogga: "shimoga",
  kalaburagi: "gulbarga",
  belagavi: "belgaum",
  hubballi: "dharwad",
  vijayapura: "bijapur",
  bagalkote: "bagalkot",
  ramanagara: "ramanagara",
  yadgir: "yadgir",
  // Others
  "sas nagar (mohali)": "rupnagar",
  "guru gram": "gurgaon",
  gurugram: "gurgaon",
  thoothukudi: "tuticorin",
  virudhunagar: "virudhunagar",
  "north and middle andaman": "andaman islands",
  "south andaman": "andaman islands",
  "nicobar": "nicobar",
};

const STATE_RENAME: Record<string, string> = {
  "andaman and nicobar islands": "andaman and nicobar",
  "dadra and nagar haveli and daman and diu": "dadra and nagar haveli",
  "nct of delhi": "delhi",
  delhi: "delhi",
  "odisha": "odisha",
  "uttarakhand": "uttarakhand",
  "telangana": "telangana",
};

export function normalizeDistrict(name: string): string {
  const key = normName(name);
  return DISTRICT_RENAME[key] ?? key;
}

export function normalizeState(name: string): string {
  const key = normName(name);
  return STATE_RENAME[key] ?? key;
}

/* ─── Load & process ─── */

interface RawFeature {
  properties: { NAME_1?: string; NAME_2?: string };
  geometry?: {
    type: string;
    coordinates?: unknown;
  };
}

function isPointArr(c: unknown): c is number[] {
  return Array.isArray(c) && c.length >= 2 && typeof c[0] === "number";
}

/** true when `c` looks like a ring — an array of [lng, lat] points. */
function isRing(c: unknown): c is number[][] {
  return Array.isArray(c) && c.length > 0 && isPointArr(c[0]);
}

/** Build a simplified polygon ([outer, ...holes]) from GeoJSON ring arrays. */
function polygonFromRings(rings: number[][][]): LngLat[][] | null {
  const out: LngLat[][] = [];
  for (const ring of rings) {
    const pts = ring
      .filter((pt) => Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
      .map((pt) => [pt[0], pt[1]] as LngLat);
    if (pts.length < 4) continue;
    const simplified = simplifyRing(pts, SIMPLIFY_TOLERANCE_DEG);
    if (simplified.length >= 4) out.push(simplified);
  }
  return out.length ? out : null;
}

/** Parse any GeoJSON geometry coordinate tree into simplified polygons. */
function collectPolygons(coords: unknown): LngLat[][][] {
  if (!Array.isArray(coords) || coords.length === 0) return [];
  // Polygon: coords is a list of rings directly.
  if (isRing(coords[0])) {
    const poly = polygonFromRings(coords as number[][][]);
    return poly ? [poly] : [];
  }
  // MultiPolygon (or nested): iterate children.
  const polys: LngLat[][][] = [];
  for (const child of coords as unknown[]) {
    if (Array.isArray(child) && child.length && isRing(child[0])) {
      const poly = polygonFromRings(child as number[][][]);
      if (poly) polys.push(poly);
    }
  }
  return polys;
}

function toFeature(f: RawFeature, idx: number): DistrictFeature | null {
  const state = String(f.properties.NAME_1 ?? "").trim();
  const name = String(f.properties.NAME_2 ?? "").trim();
  if (!state || !name) return null;
  const polys = collectPolygons(f.geometry?.coordinates);
  if (!polys.length) return null;
  const bbox = bboxOfPolygons(polys);
  return {
    key: `${idx}`,
    name,
    state,
    polygons: polys,
    bbox,
  };
}

let loadPromise: Promise<DistrictFeature[]> | null = null;

async function fetchTextWithProgress(url: string, onProgress?: (pct: number) => void): Promise<string> {
  // Cache API first (persists across reloads)
  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url);
    if (cached) return cached.text();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Boundary download failed (HTTP ${res.status})`);
    const total = Number(res.headers.get("content-length") ?? 0);
    if (!total || !res.body) {
      const text = await res.text();
      await cache.put(url, new Response(text));
      return text;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        onProgress?.(Math.round((received / total) * 100));
      }
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const text = new TextDecoder().decode(bytes);
    try {
      await cache.put(url, new Response(text));
    } catch {
      /* cache best-effort */
    }
    onProgress?.(100);
    return text;
  } catch (err) {
    // Cache API may be unavailable (insecure context) — fall back to plain fetch.
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Boundary download failed (HTTP ${res.status})`);
    return res.text();
  }
}

/**
 * Loads real district boundary polygons for all of India. First load
 * downloads ~35 MB (raw GitHub CDN) and caches it; subsequent loads parse the
 * cached text. Returns [] never — throws a friendly Error on failure.
 */
export function loadDistrictBoundaries(
  onProgress?: (pct: number) => void,
  sourceUrl?: string,
): Promise<DistrictFeature[]> {
  if (loadPromise) return loadPromise;
  const url = sourceUrl ?? DISTRICT_BOUNDARY_URL;
  loadPromise = (async () => {
    const text = await fetchTextWithProgress(url, onProgress);
    const gj = JSON.parse(text) as { features?: RawFeature[] };
    const features = (gj.features ?? [])
      .map(toFeature)
      .filter((f): f is DistrictFeature => f !== null);
    if (!features.length) throw new Error("Boundary dataset contained no usable districts.");
    return features;
  })().catch((err: unknown) => {
    loadPromise = null;
    throw err instanceof Error ? err : new Error(String(err));
  });
  return loadPromise;
}

/** Test-only reset. */
export function resetBoundaryCache(): void {
  loadPromise = null;
}

/* ─── Lookup ─── */

export interface DistrictResolution {
  feature: DistrictFeature;
  via: "name" | "containment";
}

/** Find the boundary feature for a directory record (name → rename → containment). */
export function resolveDistrict(
  features: DistrictFeature[],
  place: { district: string; state: string; lat?: number; lng?: number },
): DistrictResolution | null {
  const wantDist = normalizeDistrict(place.district);
  const wantState = normalizeState(place.state);

  // 1) exact name match, same state preferred
  let stateMatches: DistrictFeature[] = [];
  let anyMatches: DistrictFeature[] = [];
  for (const f of features) {
    const fKey = normalizeDistrict(f.name);
    if (fKey !== wantDist) continue;
    anyMatches.push(f);
    if (normalizeState(f.state) === wantState) stateMatches.push(f);
  }
  const named = stateMatches[0] ?? anyMatches[0];
  if (named) return { feature: named, via: "name" };

  // 2) containment fallback for reorganized districts absent from the dataset
  if (place.lat !== undefined && place.lng !== undefined && Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
    const lng = place.lng;
    const lat = place.lat;
    const sameState = features.filter((f) => normalizeState(f.state) === wantState);
    for (const f of sameState.length ? sameState : features) {
      const [minLng, minLat, maxLng, maxLat] = f.bbox;
      if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue;
      if (pointInPolygons([lng, lat], f.polygons)) {
        return { feature: f, via: "containment" };
      }
    }
  }
  return null;
}

/** Geographic neighbours of one district (shared/near border) — geometry based. */
export function adjacentDistricts(
  features: DistrictFeature[],
  feature: DistrictFeature,
  maxResults = 8,
): DistrictFeature[] {
  const [minLng, minLat, maxLng, maxLat] = feature.bbox;
  const eps = 0.18; // generous inflation to catch short shared borders
  const refLat = (minLat + maxLat) / 2;

  const scored: Array<{ f: DistrictFeature; d: number }> = [];
  for (const other of features) {
    if (other.key === feature.key) continue;
    const [oMinLng, oMinLat, oMaxLng, oMaxLat] = other.bbox;
    if (oMaxLng < minLng - eps || oMinLng > maxLng + eps) continue;
    if (oMaxLat < minLat - eps || oMinLat > maxLat + eps) continue;
    const d = polygonsSeparationMeters(feature.polygons, other.polygons, refLat);
    // < 2.5 km separation ⇒ neighbouring districts
    if (d < 2500) scored.push({ f: other, d });
  }
  scored.sort((a, b) => a.d - b.d);
  return scored.slice(0, maxResults).map((s) => s.f);
}
