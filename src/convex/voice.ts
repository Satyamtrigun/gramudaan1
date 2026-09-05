import { internalAction } from "./_generated/server";
import { v } from "convex/values";

// Server-side Hindi speech-to-text fallback.
//
// The browser-native SpeechRecognition API depends on Google's speech service,
// which is unavailable inside sandboxed/cross-origin preview iframes. Instead we
// record audio with MediaRecorder in the browser, store it, and transcribe it
// here in a Node-runtime action using Deepgram's raw-audio HTTP API.
//
// Requires the DEEPGRAM_API_KEY environment variable (set via the Freebuff
// "Keys" tab → it is pushed to the Convex deployment as an env var).

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";

function readEnvKey(): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string> } };
  return g.process?.env?.DEEPGRAM_API_KEY;
}

export const transcribeFromStorage = internalAction({
  args: {
    storageId: v.id("_storage"),
    mime: v.string(),
  },
  handler: async (ctx, { storageId, mime }) => {

    try {
      const key = readEnvKey();
      if (!key) {
        await ctx.storage.delete(storageId);
        return { text: "", error: "not_configured" };
      }

      const blob = await ctx.storage.get(storageId);
      if (!blob) {
        return { text: "", error: "empty" };
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());

      // 60-second safety cap on any single recording
      if (bytes.length === 0) {
        await ctx.storage.delete(storageId);
        return { text: "", error: "empty" };
      }

      const url = new URL(DEEPGRAM_URL);
      url.searchParams.set("model", "nova-3");
      url.searchParams.set("language", "hi");
      url.searchParams.set("smart_format", "true");
      url.searchParams.set("punctuate", "true");

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Token ${key}`,
          "Content-Type": mime || "audio/webm",
        },
        body: bytes,
      });

      await ctx.storage.delete(storageId);

      if (!response.ok) {
        return { text: "", error: "provider" };
      }

      const data = (await response.json()) as {
        results?: {
          channels?: { alternatives?: { transcript?: string }[] }[];
        };
      };
      const text =
        data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || "";

      if (!text) return { text: "", error: "no_speech" };
      return { text, error: "" };
    } catch (err) {
      // Best-effort cleanup if the storage entry survived
      try {
        await ctx.storage.delete(storageId);
      } catch {
        /* ignore */
      }
      console.error("[voice] transcription failed", err);
      return { text: "", error: "failed" };
    }
  },
});
