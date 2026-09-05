// ─── Build: compact pin-level location index ───
// Reads the full All-India directory (public/pincodes.json.gz) and writes a
// much smaller "pin heads" index (public/loc/pin-heads.json):
//
//   • ONE record per pincode — the best office/locality for that pincode
//     (GPO > HO > SO > BO, coords preferred, most office instances wins).
//   • Records keep the same short-key shape as the full directory
//     ({p,o,i,s,t,a,n}) so the existing normalizeRecord() pipeline works.
//   • Plain JSON (no gzip): the critical search tier must not depend on
//     DecompressionStream/streaming fetch support in the host browser.
//
// The result (~19.5k rows, ~1.8 MB plain JSON) is the tier that makes search
// available immediately. The full directory is still shipped (gzipped) and
// loaded in the background as best-effort enrichment.
//
// Usage:  bun scripts/build-pin-index.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = join(root, "public", "pincodes.json.gz");
const outDir = join(root, "public", "loc");
const outPath = join(outDir, "pin-heads.json");

const raw = JSON.parse(gunzipSync(readFileSync(srcPath)).toString());

const TYPE_RANK = { GPO: 0, HO: 1, SO: 2, BO: 3 };
const pinMap = new Map();

for (const r of raw) {
  const p = String(r.p ?? "").trim();
  if (!/^[1-9]\d{5}$/.test(p)) continue;
  const name = String(r.o ?? "").trim().toUpperCase()
    .replace(/\s*\(?\s*\b(B\.O|S\.O|H\.O|G\.P\.O|GPO|SO|BO|HO)\b\s*\)?$/i, "")
    .replace(/\s+/g, " ").trim();
  if (!name) continue;
  const typeKey = String(r.t ?? "BO").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const type = Object.prototype.hasOwnProperty.call(TYPE_RANK, typeKey) ? typeKey : "BO";
  const lat = Number(r.a);
  const lng = Number(r.n);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) + Math.abs(lng) > 0.05;
  const district = String(r.i ?? "").trim().toUpperCase();
  const state = String(r.s ?? "").trim().toUpperCase();
  if (!district || !state || state === "NA") continue;

  const bucket = pinMap.get(p) ?? (pinMap.set(p, []), pinMap.get(p));
  // Merge repeated office names for the same district under one pincode.
  const key = `${name}|${district}`;
  const existing = bucket.find((x) => x.key === key);
  if (existing) {
    existing.count++;
    if (hasCoords && !existing.hasCoords) {
      existing.a = lat;
      existing.n = lng;
      existing.hasCoords = true;
    }
    continue;
  }
  bucket.push({
    key,
    o: name,
    i: district,
    s: state,
    t: type,
    rank: TYPE_RANK[type],
    a: hasCoords ? lat : 0,
    n: hasCoords ? lng : 0,
    hasCoords,
    count: 1,
  });
}

const out = [];
let coords = 0;
for (const [p, list] of pinMap) {
  // Best head first: coords > office rank > most instances > name length.
  list.sort(
    (x, y) =>
      (y.hasCoords ? 1 : 0) - (x.hasCoords ? 1 : 0) ||
      x.rank - y.rank ||
      y.count - x.count ||
      x.o.length - y.o.length,
  );
  const best = list[0];
  out.push({ p, o: best.o, i: best.i, s: best.s, t: best.t, a: best.a, n: best.n });
  if (best.hasCoords) coords++;
}

const bytes = Buffer.from(JSON.stringify(out));
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, bytes);

console.log(`pin-heads: ${out.length} rows (${pinMap.size} pincodes), ${coords} with coords`);
console.log(`plain JSON ${(bytes.length / 1024).toFixed(0)} KB → ${outPath}`);
