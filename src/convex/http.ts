import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    ...(origin ? { Vary: "Origin" } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

// Receives a raw audio recording from the voice assistant (MediaRecorder blob),
// stores it transiently, and transcribes it server-side via a Node action
// (Deepgram, Hindi). Audio is deleted immediately after transcription.
http.route({
  path: "/voice/transcribe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const origin = request.headers.get("Origin");
    const contentType = request.headers.get("Content-Type") || "audio/webm";
    const mime = contentType.split(";")[0].trim() || "audio/webm";

    try {
      const blob = await request.blob();
      if (!blob || blob.size === 0) {
        return json({ error: "empty" }, 400, origin);
      }

      const storageId = await ctx.storage.store(blob);
      const result = await ctx.runAction(internal.voice.transcribeFromStorage, {
        storageId,
        mime,
      });

      const parsed = result as { text?: string; error?: string };
      if (!parsed?.text) {
        return json({ error: parsed?.error ?? "no_speech" }, 200, origin);
      }
      return json({ text: parsed.text }, 200, origin);
    } catch (err) {
      console.error("[voice] HTTP transcribe failed", err);
      return json({ error: "failed" }, 500, origin);
    }
  }),
});

// CORS pre-flight for the browser fetch above
http.route({
  path: "/voice/transcribe",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request.headers.get("Origin")),
    });
  }),
});

export default http;
