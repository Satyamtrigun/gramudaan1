// ─── Geographic helpers for the RuralBiz location intelligence system ───
// Coordinates throughout this module are GeoJSON order: [lng, lat].

export type LngLat = [number, number];

const normCache = new Map<string, string>();

/** Lowercase, strip punctuation, collapse whitespace — for matching names. */
export function normName(s: string): string {
  const cached = normCache.get(s);
  if (cached !== undefined) return cached;
  const out = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normCache.size < 300_000) normCache.set(s, out);
  return out;
}

/** Stable string hash — seeds deterministic scatter/bearing layouts. */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Destination point: move `distanceKm` from (lat, lng) along `bearingDeg`
 * (0 = north, clockwise). Returns [lat, lng] degrees.
 */
export function offsetKm(lat: number, lng: number, bearingDeg: number, distanceKm: number): [number, number] {
  const R = 6371;
  const br = (bearingDeg * Math.PI) / 180;
  const d = distanceKm / R;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI];
}

/** Haversine distance in metres between two [lng, lat] points. */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Equirectangular approximation (metres) — fast, fine for small areas. */
export function equirectMeters(a: LngLat, b: LngLat, refLat?: number): number {
  const lat = refLat ?? (a[1] + b[1]) / 2;
  const mLat = 111_320; // metres per degree latitude
  const mLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  const dx = (b[0] - a[0]) * mLng;
  const dy = (b[1] - a[1]) * mLat;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Ray-casting point-in-polygon test. Ring: array of [lng, lat]. */
export function pointInRing(p: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Point-in-multi-polygon. polygons: ring[][]. */
export function pointInPolygons(p: LngLat, polygons: LngLat[][][]): boolean {
  return polygons.some((poly) =>
    poly.some((ring, i) => {
      const hit = pointInRing(p, ring);
      // even-odd rule across outer rings & holes: first ring is outer.
      return i === 0 ? hit : !hit;
    }),
  );
}

/** Distance from point p to segment ab (planar, metres). */
function pointSegMeters(p: LngLat, a: LngLat, b: LngLat, refLat: number): number {
  const mLat = 111_320;
  const mLng = 111_320 * Math.cos((refLat * Math.PI) / 180);
  const px = (p[0] - a[0]) * mLng;
  const py = (p[1] - a[1]) * mLat;
  const ax = (b[0] - a[0]) * mLng;
  const ay = (b[1] - a[1]) * mLat;
  const len2 = ax * ax + ay * ay;
  if (len2 === 0) return Math.sqrt(px * px + py * py);
  let t = (px * ax + py * ay) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = px - ax * t;
  const cy = py - ay * t;
  return Math.sqrt(cx * cx + cy * cy);
}

/**
 * Minimum separation between two rings (metres), sampling every Nth vertex.
 * Used for district adjacency: two districts share a border when the closest
 * pair of their boundary segments is essentially 0.
 */
export function ringSeparationMeters(
  ringA: LngLat[],
  ringB: LngLat[],
  refLat: number,
): number {
  let best = Infinity;
  const strideA = Math.max(1, Math.floor(ringA.length / 250));
  const strideB = Math.max(1, Math.floor(ringB.length / 250));
  for (let i = 0; i < ringA.length; i += strideA) {
    const a0 = ringA[i];
    const a1 = ringA[(i + 1) % ringA.length];
    for (let j = 0; j < ringB.length; j += strideB) {
      const d = pointSegMeters(a0, ringB[j], ringB[(j + 1) % ringB.length], refLat);
      if (d < best) best = d;
    }
    // early exit: shared border found
    if (best < 150) return best;
  }
  return best;
}

/** Minimum separation between two multi-polygons (metres). */
export function polygonsSeparationMeters(
  polysA: LngLat[][][],
  polysB: LngLat[][][],
  refLat: number,
): number {
  let best = Infinity;
  for (const polyA of polysA) {
    for (const polyB of polysB) {
      // outer rings only — adjacency is about shared outer borders
      const outerA = polyA[0] ?? [];
      const outerB = polyB[0] ?? [];
      if (outerA.length < 3 || outerB.length < 3) continue;
      const d = ringSeparationMeters(outerA, outerB, refLat);
      if (d < best) best = d;
      if (best < 150) return best;
    }
  }
  return best;
}

/** Ramer–Douglas–Peucker simplification over [lng, lat] points, tolerance in degrees. */
export function simplifyRing(points: LngLat[], toleranceDeg: number): LngLat[] {
  if (points.length < 4) return points;
  const sqTol = toleranceDeg * toleranceDeg;

  // Perpendicular squared distance from p to segment ab in degree-space (x scaled for cos(lat)).
  const refLat = points.reduce((s, p) => s + p[1], 0) / points.length;
  const cosLat = Math.max(0.05, Math.cos((refLat * Math.PI) / 180));

  function perpSq(p: LngLat, a: LngLat, b: LngLat): number {
    const ax = (b[0] - a[0]) * cosLat;
    const ay = b[1] - a[1];
    const px = (p[0] - a[0]) * cosLat;
    const py = p[1] - a[1];
    const len2 = ax * ax + ay * ay;
    if (len2 === 0) return (p[0] - a[0]) * (p[0] - a[0]) + (p[1] - a[1]) * (p[1] - a[1]);
    const t = Math.max(0, Math.min(1, (px * ax + py * ay) / len2));
    const cx = px - ax * t;
    const cy = py - ay * t;
    return cx * cx + cy * cy;
  }

  function rdp(pts: LngLat[]): LngLat[] {
    if (pts.length <= 2) return pts;
    let maxD = 0;
    let idx = 0;
    const first = pts[0];
    const last = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
      const d = perpSq(pts[i], first, last);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > sqTol && idx > 0) {
      const left = rdp(pts.slice(0, idx + 1));
      const right = rdp(pts.slice(idx));
      return left.slice(0, -1).concat(right);
    }
    return [first, last];
  }

  const simplified = rdp(points);
  // keep ring closed
  if (simplified.length > 1) {
    const first = simplified[0];
    const last = simplified[simplified.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) simplified.push([first[0], first[1]]);
  }
  return simplified.length >= 4 ? simplified : points;
}

/** Bounding box [minLng, minLat, maxLng, maxLat] of a ring set. */
export function bboxOfPolygons(polygons: LngLat[][][]): [number, number, number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const poly of polygons) {
    for (const ring of poly) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return [minLng, minLat, maxLng, maxLat];
}
