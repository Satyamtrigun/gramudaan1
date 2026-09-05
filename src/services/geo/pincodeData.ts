// ─── All-India pincode directory loader ───
// Source: All India Pincode Directory (India Post), distributed with the
// `india-pincode` npm package (MIT). The compressed JSON lives in `public/`
// (copied from the package's data folder) and is fetched + gunzipped lazily in
// the browser, then normalized into a compact, deduplicated record set.
//
// Field map of the raw records (short keys to keep the file small):
//   c circle | r region | v division | o office name | p pincode | t office type
//   d delivery(0/1) | i district | s state | a lat | n lng

/** Served from /public so the package's `exports` map cannot block it. */
export const PINCODE_DATA_URL = "/pincodes.json.gz";

export type OfficeType = "GPO" | "HO" | "SO" | "BO" | "PO" | string;

/** Canonicalize the directory's office-type label (handles "S.O", "S O", …). */
export function officeKind(raw: string | undefined): OfficeType {
  const t = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (t === "GPO" || t === "HO" || t === "SO" || t === "BO" || t === "PO") return t;
  return (raw ?? "").trim() || "BO";
}

export interface GeoPlace {
  /** 6-digit pincode. */
  pincode: string;
  /** Clean display name (office suffix stripped). */
  name: string;
  /** Original India Post office name. */
  rawName: string;
  officeType: OfficeType;
  delivery: boolean;
  district: string;
  state: string;
  /** Postal region (useful context). Null when not reported. */
  region: string | null;
  /** Postal division (loose proxy for sub-district context). */
  division: string | null;
  lat: number;
  lng: number;
  /** true when lat/lng came from the directory; false when unavailable. */
  hasCoords: boolean;
}

/** Strips the India Post suffix (".B.O", " S.O", " (S.O)") etc. from a name. */
export function cleanOfficeName(raw: string): string {
  return raw
    .replace(/\s*\(?\s*\b(B\.O|S\.O|H\.O|G\.P\.O|GPO|SO|BO|HO)\b\s*\)?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize a raw directory record into our compact GeoPlace. */
export function normalizeRecord(r: Record<string, unknown>): GeoPlace | null {
  const pincode = String(r.p ?? "").trim();
  const rawName = String(r.o ?? "").trim();
  const district = String(r.i ?? "").trim();
  const state = String(r.s ?? "").trim();
  if (!/^[1-9]\d{5}$/.test(pincode) || !rawName || !district || !state) return null;
  // Records with unknown state ("NA") or non-geographic entries are skipped.
  if (state === "NA") return null;

  const lat = Number(r.a);
  const lng = Number(r.n);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (Math.abs(lat) + Math.abs(lng)) > 0.05;

  return {
    pincode,
    name: cleanOfficeName(rawName),
    rawName,
    officeType: officeKind(String(r.t ?? "BO")),
    delivery: Number(r.d) === 1,
    district,
    state,
    region: r.r ? String(r.r) : null,
    division: r.v ? String(r.v) : null,
    lat: hasCoords ? lat : 0,
    lng: hasCoords ? lng : 0,
    hasCoords,
  };
}

let cachePromise: Promise<GeoPlace[]> | null = null;
let cacheError: Error | null = null;

/**
 * Loads and normalizes the full India pincode directory.
 * Result is cached for the session. This is the BACKGROUND enrichment layer:
 * search never waits on it — the compact pin-heads index unblocks search first.
 * Callers may pass an AbortSignal (see gzLoader timeouts); an aborted/failed
 * load is recorded so a later call can retry.
 */
export function loadPincodeData(
  sourceUrl: string = PINCODE_DATA_URL,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<GeoPlace[]> {
  if (cachePromise) return cachePromise;
  if (cacheError) throw cacheError;

  cachePromise = (async () => {
    const { fetchGunzipText } = await import("./gzLoader");
    const text = await fetchGunzipText(sourceUrl, {
      signal,
      timeoutMs: 0, // explicit signal controls this layer
      onProgress,
    });
    const raw = JSON.parse(text) as Record<string, unknown>[];
    const seen = new Set<string>();
    const out: GeoPlace[] = [];
    for (const rec of raw) {
      const place = normalizeRecord(rec);
      if (!place) continue;
      const key = `${place.pincode}|${place.rawName.toUpperCase()}|${place.officeType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(place);
    }
    return out;
  })().catch((err: unknown) => {
    cacheError = err instanceof Error ? err : new Error(String(err));
    cachePromise = null;
    throw cacheError;
  });

  return cachePromise;
}

/** Reset cached dataset (dev / test helper). */
export function resetPincodeCache(): void {
  cachePromise = null;
  cacheError = null;
}
