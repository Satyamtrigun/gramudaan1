// ─── Online PIN-code lookup (six-digit PIN searches) ───
// Exact PIN queries go to lightweight postal APIs instead of any bulk
// directory load, so a PIN search works instantly and independently of the
// text-search dataset.
//
//   Primary:   api.pincodeapi.in   GET /pincode/{pin}   (post offices with
//              per-office lat/lng, CORS *)            [https://pincodeapi.in]
//   Overlay:   api.postalpincode.in /pincode/{pin}     (authoritative
//              district/state/block names; no coords)  [https://postalpincode.in]
//
// The India Post coordinate field is notoriously dirty (many branch offices
// share one bogus coordinate far from the real place). So:
//   • every office is placed at its OWN coordinate when that coordinate is
//     within ~60 km of the pin's trusted head-office anchor;
//   • otherwise it falls back to the pin's anchor coordinate (pincode-level
//     position — same granularity the single-row-per-pin local index uses);
//   • never is a coordinate invented.
//
// Responses are cached per session; requests time out and errors surface as
// typed failures the UI translates to friendly messages.

import { cleanOfficeName } from "./pincodeData";
import { timeoutSignal } from "./gzLoader";
import { normName, haversineMeters } from "./geoUtils";

export const PIN_API_TIMEOUT_MS = 8_000;

/** Max distance from the pin's trusted anchor before an office coordinate is
 * treated as the India-Post data quirk and downgraded to pin-level position. */
const SANE_COORD_KM = 60;

export type PinOfficeKind = "GPO" | "HO" | "SO" | "BO" | string;

export interface PinOffice {
  name: string;
  officeType: PinOfficeKind;
  delivery: boolean;
  pincode: string;
  district: string;
  state: string;
  block?: string;
  region?: string;
  division?: string;
  /** Exact office coordinate when trustworthy (never fabricated). */
  lat?: number;
  lng?: number;
  source: "pincodeapi" | "postalpincode";
}

export type PinLookupErrorKind = "network" | "busy" | "invalid";

export class PinLookupError extends Error {
  kind: PinLookupErrorKind;
  constructor(kind: PinLookupErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** True when the trimmed query is a full six-digit Indian PIN. */
export function isPinQuery(query: string): boolean {
  return /^\d{6}$/.test(query.trim());
}

const cache = new Map<string, PinOffice[]>();

/** Session cache for successful PIN lookups. */
export function peekPinCache(pin: string): PinOffice[] | undefined {
  return cache.get(pin);
}

function clean(rawName: string): string {
  return cleanOfficeName(rawName).replace(/\s+/g, " ").trim();
}

function mapKind(raw: string, source: string): PinOfficeKind {
  const t = (raw ?? "").toUpperCase().replace(/\s+/g, " ");
  if (source === "postalpincode") {
    // BranchType strings: "Head Post Office", "Sub Post Office",
    // "Branch Office directly a/w Head Office" (contains "Head Office").
    if (t.includes("SUB POST")) return "SO";
    if (t.includes("HEAD POST")) return "HO";
    if (t.includes("BRANCH")) return "BO";
  }
  const token = t.replace(/[^A-Z0-9]/g, "");
  if (token === "GPO" || token === "HO") return "HO";
  if (token === "SO") return "SO";
  // pincodeapi marks many sub offices as "PO"; keep the token for labels.
  if (token === "PO") return source === "postalpincode" ? "PO" : "SO";
  return "BO";
}

/** Parse a pincodeapi.in response body. */
function parsePincodeApi(body: unknown, pin: string): PinOffice[] {
  const data = (body as { success?: boolean; data?: { post_offices?: Record<string, unknown>[] } })?.data;
  const list = Array.isArray(data?.post_offices) ? data.post_offices : [];
  return list.map((o) => ({
    name: clean(String(o.office_name ?? "")),
    officeType: mapKind(String(o.office_type ?? "BO"), "pincodeapi"),
    delivery: String(o.delivery_status ?? "").toLowerCase().includes("delivery"),
    pincode: String(o.pincode ?? pin),
    district: String(o.district ?? "").trim(),
    state: String(o.state ?? "").trim(),
    region: String(o.region ?? "").trim() || undefined,
    division: String(o.division ?? "").trim() || undefined,
    lat: Number.isFinite(Number(o.latitude)) ? Number(o.latitude) : undefined,
    lng: Number.isFinite(Number(o.longitude)) ? Number(o.longitude) : undefined,
    source: "pincodeapi",
  }));
}

/** Parse a postalpincode.in response body. */
function parsePostalApi(body: unknown, pin: string): PinOffice[] {
  const arr = Array.isArray(body) ? (body as Record<string, unknown>[]) : [];
  const first = arr[0] as { Status?: string; PostOffice?: Record<string, unknown>[] | null } | undefined;
  if (!first || String(first.Status ?? "") !== "Success") return [];
  const list = Array.isArray(first.PostOffice) ? first.PostOffice : [];
  return list.map((o) => ({
    name: clean(String(o.Name ?? "")),
    officeType: mapKind(String(o.BranchType ?? ""), "postalpincode"),
    delivery: String(o.DeliveryStatus ?? "").toLowerCase().includes("delivery"),
    pincode: String(o.Pincode ?? pin),
    district: String(o.District ?? "").trim(),
    state: String(o.State ?? "").trim(),
    block: String(o.Block ?? "").trim() || undefined,
    region: String(o.Region ?? "").trim() || undefined,
    division: String(o.Division ?? "").trim() || undefined,
    source: "postalpincode",
  }));
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: timeoutSignal(PIN_API_TIMEOUT_MS) });
  if (res.status === 429) throw new PinLookupError("busy", "PIN API rate limited");
  if (!res.ok) throw new PinLookupError("network", `PIN API HTTP ${res.status}`);
  return res.json();
}

const KIND_RANK: Record<string, number> = { HO: 0, GPO: 0, SO: 1, PO: 2, BO: 3 };
const kindRank = (o: { officeType: string }) => KIND_RANK[String(o.officeType).toUpperCase()] ?? 9;

/**
 * Merge the two sources for one pin:
 * 1. district/state/block taken from postalpincode when it reports a single
 *    coherent district (it uses current official names);
 * 2. extra office names from postalpincode are added (they carry no coords —
 *    they get the pin-level anchor position, same granularity as the local
 *    single-row-per-pin index);
 * 3. pincodeapi coordinates are kept only when within SANE_COORD_KM of the
 *    pin's trusted anchor; otherwise the office falls back to pin-level.
 */
function mergeSources(primary: PinOffice[], postal: PinOffice[], anchor: { lat: number; lng: number } | null): PinOffice[] {
  let district = "";
  let state = "";
  if (postal.length > 0) {
    const districts = new Set(postal.map((o) => o.district).filter(Boolean));
    const states = new Set(postal.map((o) => o.state).filter(Boolean));
    if (districts.size === 1) district = [...districts][0];
    if (states.size === 1) state = [...states][0];
  }

  const byName = new Map<string, PinOffice>(); // normalized name → office
  const seen = new Set<string>();
  const push = (o: PinOffice, position: { lat?: number; lng?: number } | null) => {
    const key = normName(o.name || o.pincode);
    if (seen.has(key)) return;
    seen.add(key);
    byName.set(key, {
      ...o,
      ...(district && o.district !== district ? { district } : {}),
      ...(state && o.state !== state ? { state } : {}),
      ...(o.lat === undefined && position ? { lat: position.lat, lng: position.lng } : {}),
    });
  };

  // Primary offices first (ranked later by caller) with coordinate sanity.
  const anchored: PinOffice[] = [];
  for (const o of primary) {
    if (
      o.lat !== undefined &&
      o.lng !== undefined &&
      anchor &&
      haversineMeters([anchor.lng, anchor.lat], [o.lng, o.lat]) > SANE_COORD_KM * 1000
    ) {
      anchored.push({ ...o, lat: undefined, lng: undefined }); // quirk row → pin-level
    } else {
      anchored.push(o);
    }
  }
  for (const o of anchored) push(o, anchor);

  // Additional names only from postalpincode.
  const postalBlocks = new Map<string, string>();
  for (const o of postal) postalBlocks.set(normName(o.name), o.block ?? "");
  for (const o of postal) {
    if (seen.has(normName(o.name))) {
      const existing = byName.get(normName(o.name));
      if (existing && postalBlocks.get(normName(o.name)) && !existing.block) {
        existing.block = postalBlocks.get(normName(o.name));
      }
      continue;
    }
    push(o, anchor);
  }

  const out = [...byName.values()];
  out.sort((a, b) => kindRank(a) - kindRank(b) || a.name.localeCompare(b.name));
  return out;
}

/**
 * Look up one PIN online. Returns [] when the API says the PIN is unknown.
 * Successful responses are cached for the session.
 */
export async function lookupPin(pin: string): Promise<PinOffice[]> {
  const cached = cache.get(pin);
  if (cached) return cached;

  if (!/^\d{6}$/.test(pin)) {
    throw new PinLookupError("invalid", "Not a six-digit PIN");
  }

  // Primary source (coords). Secondary source is a best-effort overlay —
  // a postal failure never fails the lookup when pincodeapi succeeded.
  const primary = await (async () => {
    try {
      const body = await fetchJson(`https://api.pincodeapi.in/api/v1/pincode/${pin}`);
      return parsePincodeApi(body, pin);
    } catch (err) {
      if (err instanceof PinLookupError && err.kind === "invalid") throw err;
      return [];
    }
  })();

  if (primary.length === 0) {
    // No primary data → try the secondary source alone.
    const body = await fetchJson(`https://api.postalpincode.in/pincode/${pin}`);
    const postal = parsePostalApi(body, pin);
    if (postal.length === 0) return [];
    cache.set(pin, postal);
    return postal;
  }

  // Anchor: highest-ranked primary office with a coordinate.
  const ranked = [...primary].sort((a, b) => kindRank(a) - kindRank(b));
  const anchor = ranked.find((o) => o.lat !== undefined && o.lng !== undefined);
  const anchorPoint = anchor ? { lat: anchor.lat as number, lng: anchor.lng as number } : null;

  let postal: PinOffice[] = [];
  try {
    const body = await fetchJson(`https://api.postalpincode.in/pincode/${pin}`);
    postal = parsePostalApi(body, pin);
  } catch {
    // Overlay optional.
  }

  const offices = mergeSources(primary, postal, anchorPoint);
  if (offices.length > 0) cache.set(pin, offices);
  return offices;
}
