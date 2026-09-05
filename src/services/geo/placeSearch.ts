// ─── Nationwide location search (indexed, offline, no external geocoder) ───
// Ranks results over the in-memory All India Pincode Directory index with a
// deterministic scoring model:
//   1. Exact pincode           2. Exact place name   3. Name / district prefix
//   4. District / state match  5. Related office (village/locality) match

import type { GeoPlace } from "./pincodeData";
import { normName, haversineMeters } from "./geoUtils";

/** Deterministic per-place score for a text query. Pure & unit-testable. */
export function scorePlace(p: GeoPlace, qNorm: string, tokens: string[]): number {
  const name = normName(p.name);
  const district = normName(p.district);
  const state = normName(p.state);
  const hay = `${name} ${district} ${state}`;

  // Cheap prefilter: first meaningful token must appear somewhere.
  const first = tokens[0];
  if (first && first.length >= 2 && !hay.includes(first)) return 0;

  let score = 0;
  if (name === qNorm) score += 420;
  else if (name.startsWith(qNorm)) score += 260;
  else if (name.includes(qNorm)) score += 130;

  if (district === qNorm) score += 320;
  else if (district.startsWith(qNorm)) score += 200;
  else if (district.includes(qNorm)) score += 110;

  if (state === qNorm) score += 170;
  else if (state.includes(qNorm)) score += 70;

  for (const tok of tokens) {
    if (tok.length < 2) continue;
    if (name.startsWith(tok)) score += 22;
    else if (name.includes(tok)) score += 9;
    if (district.startsWith(tok)) score += 16;
    else if (district.includes(tok)) score += 7;
    if (state.startsWith(tok)) score += 10;
  }

  const officeType = (p.officeType || "").toUpperCase();
  if (officeType === "GPO" || officeType === "HO") score += 20;
  else if (officeType === "SO") score += 12;
  // Calibrated demo towns (curated layer) lead near-ties.
  if (officeType === "CUR") score += 90;
  if (p.delivery) score += 6;
  if (!p.hasCoords) score -= 40; // keep coordinate-less offices low
  return score;
}

const OFFICE_ORDER: Record<string, number> = { GPO: 0, HO: 0, SO: 1, BO: 2 };

/** Search text / place names. */
export function searchPlacesByName(
  places: GeoPlace[],
  query: string,
  limit = 24,
): GeoPlace[] {
  const q = query.trim();
  if (!q) return [];
  const qNorm = normName(q);

  const scored: Array<{ p: GeoPlace; s: number }> = [];
  const tokens = qNorm.split(" ");
  for (const p of places) {
    const s = scorePlace(p, qNorm, tokens);
    if (s <= 0) continue;
    scored.push({ p, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.p);
}

/** Search by pincode (exact or prefix, e.g. "242" or "2621"). */
export function searchPlacesByPincode(
  places: GeoPlace[],
  digits: string,
  limit = 24,
): GeoPlace[] {
  const d = digits.trim().replace(/\D/g, "");
  if (!d || d.length < 2) return [];
  const out: GeoPlace[] = [];
  const seen = new Set<string>();
  for (const p of places) {
    if (!p.pincode.startsWith(d)) continue;
    const key = `${p.pincode}|${p.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= limit) break;
  }
  // prefer HQ/sub offices & delivery, then by pincode
  out.sort((a, b) => {
    const oa = OFFICE_ORDER[a.officeType.toUpperCase()] ?? 3;
    const ob = OFFICE_ORDER[b.officeType.toUpperCase()] ?? 3;
    if (oa !== ob) return oa - ob;
    if (Number(a.pincode) !== Number(b.pincode)) return a.pincode.localeCompare(b.pincode);
    return Number(b.delivery) - Number(a.delivery);
  });
  return out.slice(0, limit);
}

/** Auto-detect numeric vs text query and route accordingly. */
export function searchPlaces(
  places: GeoPlace[],
  query: string,
  limit = 24,
): GeoPlace[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (/^\d[\d ]*$/.test(trimmed)) return searchPlacesByPincode(places, trimmed, limit);
  return searchPlacesByName(places, trimmed, limit);
}

/** Representative pins for "popular places" shown before any query. */
const POPULAR_PINS = [
  "110001", // Delhi
  "400001", // Mumbai
  "560001", // Bengaluru
  "700001", // Kolkata
  "600001", // Chennai
  "500001", // Hyderabad
  "302001", // Jaipur
  "380001", // Ahmedabad
  "411001", // Pune
  "226001", // Lucknow
  "800001", // Patna
  "781001", // Guwahati
  "208001", // Kanpur
  "221001", // Varanasi
  "302001", // dup guard below
];

function bestOfPincode(places: GeoPlace[], pincode: string): GeoPlace | null {
  const matches = places.filter((p) => p.pincode === pincode);
  if (!matches.length) return null;
  matches.sort((a, b) => {
    const oa = OFFICE_ORDER[a.officeType.toUpperCase()] ?? 3;
    const ob = OFFICE_ORDER[b.officeType.toUpperCase()] ?? 3;
    if (oa !== ob) return oa - ob;
    return Number(b.delivery) - Number(a.delivery);
  });
  return matches[0];
}

/** Suggestion list for the empty state ("Popular places to try"). */
export function popularSuggestions(places: GeoPlace[], limit = 8): GeoPlace[] {
  const out: GeoPlace[] = [];
  const seen = new Set<string>();
  for (const pin of POPULAR_PINS) {
    const best = bestOfPincode(places, pin);
    if (!best || seen.has(best.name)) continue;
    seen.add(best.name);
    out.push(best);
    if (out.length >= limit) break;
  }
  return out;
}

/** Nearest places to a clicked coordinate within radiusKm (haversine). */
export function findNearestPlaces(
  places: GeoPlace[],
  lat: number,
  lng: number,
  radiusKm = 30,
  limit = 4,
): GeoPlace[] {
  const dLat = 0.35; // ~38 km box
  const dLng = 0.45;
  const candidates: Array<{ p: GeoPlace; d: number }> = [];
  for (const p of places) {
    if (!p.hasCoords) continue;
    if (Math.abs(p.lat - lat) > dLat || Math.abs(p.lng - lng) > dLng) continue;
    const d = haversineMeters([lng, lat], [p.lng, p.lat]);
    if (d <= radiusKm * 1000) candidates.push({ p, d });
  }
  candidates.sort((a, b) => a.d - b.d);
  const out: GeoPlace[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = `${c.p.pincode}|${c.p.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c.p);
    if (out.length >= limit) break;
  }
  return out;
}
