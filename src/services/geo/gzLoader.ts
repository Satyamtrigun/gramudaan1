// ─── Shared gzip fetch utility ───
// Single code path for fetching + decompressing the compact gzipped JSON
// datasets (pin-level index, full pincode directory). Every network read is
// abortable and bounded by a timeout so no UI state can hang forever.

/** Default ceilings for dataset downloads. */
export const QUICK_LOAD_TIMEOUT_MS = 15_000; // pin index — search must not wait longer
export const FULL_LOAD_TIMEOUT_MS = 30_000; // full directory — background enrichment

/** AbortSignal that fires after timeoutMs (works where AbortSignal.timeout is missing). */
export function timeoutSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  ctrl.signal.addEventListener("abort", () => clearTimeout(id), { once: true });
  return ctrl.signal;
}

function resolveSignal(signal?: AbortSignal, timeoutMs?: number): AbortSignal | undefined {
  if (!timeoutMs) return signal;
  const timeout = timeoutSignal(timeoutMs);
  if (!signal) return timeout;
  // Both: whichever fires first aborts.
  const ctrl = new AbortController();
  const on = () => ctrl.abort();
  signal.addEventListener("abort", on, { once: true });
  timeout.addEventListener("abort", on, { once: true });
  return ctrl.signal;
}

/**
 * Fetch + gunzip a JSON.gz asset from the app's own origin.
 * Throws on HTTP errors, aborts, or when DecompressionStream is unavailable.
 */
export async function fetchGunzipText(
  url: string,
  opts: { signal?: AbortSignal; timeoutMs?: number; onProgress?: (pct: number) => void } = {},
): Promise<string> {
  const { onProgress } = opts;
  const signal = resolveSignal(opts.signal, opts.timeoutMs);
  const res = await fetch(url, { cache: "force-cache", signal });
  if (!res.ok) throw new Error(`Location data download failed (HTTP ${res.status})`);
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress the location dataset.");
  }
  if (!res.body) {
    const buf = await res.arrayBuffer();
    const blob = new Blob([buf]);
    return new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).text();
  }

  // Stream the compressed bytes (progress), then gunzip the received blob.
  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (total > 0) onProgress?.(Math.round((received / total) * 100));
    }
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  onProgress?.(100);
  return text;
}

/** Convenience: fetch + gunzip + parse a JSON array. */
export async function fetchJsonGz<T>(
  url: string,
  opts: { signal?: AbortSignal; timeoutMs?: number; onProgress?: (pct: number) => void } = {},
): Promise<T> {
  return JSON.parse(await fetchGunzipText(url, opts)) as T;
}
