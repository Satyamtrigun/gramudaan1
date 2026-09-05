// Voice Service — Web Speech API for STT + TTS
// Production-grade: mic permissions, Hindi voices, audio analyzer, clean lifecycle

export type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "error" | "permission_required";

// ─── Speech Recognition (STT) ───

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

let recognition: SpeechRecognitionInstance | null = null;
let synth: SpeechSynthesis | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let voicesLoaded = false;
let audioCtx: AudioContext | null = null;
let micStream: MediaStream | null = null;
let analyserNode: AnalyserNode | null = null;
let animFrameId: number | null = null;

// Manual (MediaRecorder) capture for server-side transcription
let mediaRecorder: MediaRecorder | null = null;
let recorderStream: MediaStream | null = null;
let recorderChunks: Blob[] = [];
let recorderAudioCtx: AudioContext | null = null;
let recorderStartedAt = 0;

function pickRecordingMime(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

export function isSpeechRecognitionSupported(): boolean {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported(): boolean {
  return !!window.speechSynthesis;
}

// ─── Pre-request microphone permission ───
export async function requestMicPermission(): Promise<{ granted: boolean; error?: string }> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Got permission — stop the test stream immediately
    stream.getTracks().forEach((t) => t.stop());
    return { granted: true };
  } catch (err: unknown) {
    const e = err as { name?: string };
    if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
      return { granted: false, error: "Microphone permission denied. Please allow mic access in your browser settings." };
    }
    if (e.name === "NotFoundError") {
      return { granted: false, error: "No microphone found. Please connect a microphone." };
    }
    return { granted: false, error: "Could not access microphone." };
  }
}

// ─── Ensure Hindi voices are loaded ───
function ensureVoicesLoaded(): Promise<void> {
  if (voicesLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    synth = window.speechSynthesis;
    const tryLoad = () => {
      const voices = synth!.getVoices();
      if (voices.length > 0) {
        voicesLoaded = true;
        resolve();
      }
    };
    tryLoad();
    synth!.onvoiceschanged = () => {
      tryLoad();
    };
    // Timeout fallback
    setTimeout(() => { voicesLoaded = true; resolve(); }, 1000);
  });
}

function getHindiVoice(): SpeechSynthesisVoice | null {
  if (!synth) return null;
  const voices = synth.getVoices();
  // Prefer exact Hindi India, then any Hindi, then any Indian language
  return (
    voices.find((v) => v.lang === "hi-IN") ||
    voices.find((v) => v.lang.startsWith("hi")) ||
    voices.find((v) => v.lang.startsWith("hi") || v.lang.includes("IN")) ||
    null
  );
}

// ─── Start listening ───
export function startListening(
  onResult: (text: string, isFinal: boolean) => void,
  onError: (error: string, code?: string) => void,
  onEnd: () => void,
  onStarted: () => void,
): void {
  if (!isSpeechRecognitionSupported()) {
    onError("Speech recognition is not supported in this browser. Please type your question.", "unsupported");
    return;
  }

  // Abort any existing session
  if (recognition) {
    try { recognition.abort(); } catch { /* ignore */ }
    recognition = null;
  }

  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognitionCtor();
  recognition.continuous = true; // Keep listening until explicitly stopped
  recognition.interimResults = true;
  recognition.lang = "hi-IN";
  recognition.maxAlternatives = 1;

  let hasReceivedResult = false;
  let networkRetries = 0;

  recognition.onstart = () => {
    onStarted();
  };

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let interimText = "";
    let finalText = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalText += transcript;
        hasReceivedResult = true;
      } else {
        interimText += transcript;
      }
    }

    if (finalText) {
      onResult(finalText.trim(), true);
    } else if (interimText) {
      onResult(interimText.trim(), false);
    }
  };

  recognition.onerror = (event: Event & { error: string }) => {
    const err = event.error;
    if (err === "no-speech") {
      if (!hasReceivedResult) {
        onError("कोई आवाज़ नहीं सुनाई दी। दोबारा बोलें।", "no-speech");
      }
      // If we already got results, no-speech just means silence after speech — ignore
    } else if (err === "not-allowed" || err === "service-not-allowed") {
      onError("Microphone permission नहीं मिली। Browser settings में जाकर microphone allow करें।", "not-allowed");
    } else if (err === "network") {
      // The Google speech service is often unreachable from sandboxed iframes.
      // Retry once (transient failures do recover); otherwise surface a clear
      // error so the UI can offer audio-recording as the reliable fallback.
      if (networkRetries < 1 && !hasReceivedResult) {
        networkRetries += 1;
        setTimeout(() => {
          try {
            recognition?.start();
          } catch {
            /* ignore */
          }
        }, 900);
        return;
      }
      onError(
        "इस browser की voice सेवा कनेक्ट नहीं हो पा रही है।",
        "network",
      );
    } else if (err === "language-not-supported") {
      onError("इस browser में Hindi voice recognition उपलब्ध नहीं है।", "unsupported");
    } else if (err === "aborted") {
      // User manually stopped — don't show error
    } else {
      onError("आवाज़ समझने में दिक्कत हुई। दोबारा कोशिश करें।", "failed");
    }
  };

  recognition.onend = () => {
    onEnd();
  };

  try {
    recognition.start();
  } catch (err) {
    onError("Microphone शुरू नहीं हो पाई। दोबारा कोशिश करें।");
  }
}

export function stopListening(): void {
  if (recognition) {
    try { recognition.stop(); } catch { /* ignore */ }
    // Delay null-out to avoid race conditions
    setTimeout(() => { recognition = null; }, 100);
  }
}

// ─── Text-to-Speech (TTS) ───
export async function speakHindi(
  text: string,
  onEnd: () => void,
  onError: (error: string) => void,
): Promise<void> {
  if (!isSpeechSynthesisSupported()) {
    onError("Text-to-speech is not supported in this browser.");
    return;
  }

  synth = window.speechSynthesis;
  synth.cancel();

  await ensureVoicesLoaded();

  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.lang = "hi-IN";
  currentUtterance.rate = 0.9; // Slightly slower for clarity
  currentUtterance.pitch = 1.0;
  currentUtterance.volume = 1.0;

  const hindiVoice = getHindiVoice();
  if (hindiVoice) {
    currentUtterance.voice = hindiVoice;
  }

  currentUtterance.onend = () => {
    currentUtterance = null;
    onEnd();
  };

  currentUtterance.onerror = (event) => {
    currentUtterance = null;
    const err = (event as SpeechSynthesisErrorEvent).error;
    if (err === "canceled" || err === "interrupted") {
      // User interrupted — don't report error
      onEnd();
    } else {
      onError("Voice output में समस्या आई। Text response देख सकते हैं।");
    }
  };

  // Workaround: some browsers suspend speech after a few seconds
  const resumeInterval = setInterval(() => {
    if (synth?.speaking && synth?.paused) {
      synth.resume();
    }
  }, 300);

  currentUtterance.onend = () => {
    clearInterval(resumeInterval);
    currentUtterance = null;
    onEnd();
  };

  currentUtterance.onerror = (event) => {
    clearInterval(resumeInterval);
    currentUtterance = null;
    const err = (event as SpeechSynthesisErrorEvent).error;
    if (err === "canceled" || err === "interrupted") {
      onEnd();
    } else {
      onError("Voice output में समस्या आई।");
    }
  };

  // Small delay to ensure browser is ready
  setTimeout(() => {
    synth?.speak(currentUtterance!);
  }, 50);
}

export function stopSpeaking(): void {
  if (synth) {
    synth.cancel();
    currentUtterance = null;
  }
}

export function isCurrentlySpeaking(): boolean {
  return synth?.speaking ?? false;
}

// ─── Audio Visualizer (real microphone data) ───
export function startAudioAnalyzer(
  onVolume: (volume: number) => void,
): void {
  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    micStream = stream;
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 128;
    source.connect(analyserNode);

    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    const update = () => {
      if (!analyserNode) return;
      analyserNode.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      onVolume(Math.min(1, avg / 128));
      animFrameId = requestAnimationFrame(update);
    };
    update();
  }).catch(() => {
    // Mic denied — visualizer won't work, but STT might still work
  });
}

export function stopAudioAnalyzer(): void {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null;
  if (audioCtx && audioCtx.state !== "closed") {
    audioCtx.close().catch(() => {});
  }
  audioCtx = null;
  analyserNode = null;
}

// ─── Manual recording (MediaRecorder) for server-side transcription ───
// This captures REAL microphone audio independent of the browser speech
// service, which is blocked in sandboxed/cross-origin preview iframes.

export function isMediaRecorderSupported(): boolean {
  return typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function isRecordingActive(): boolean {
  return !!mediaRecorder && mediaRecorder.state !== "inactive";
}

export async function startManualRecording(
  onVolume: (volume: number) => void,
): Promise<{ ok: boolean; error?: string }> {
  stopManualRecordingCleanup();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorderStream = stream;

    const mime = pickRecordingMime();
    mediaRecorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    recorderChunks = [];
    recorderStartedAt = Date.now();

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) recorderChunks.push(event.data);
    };

    // Real-time level meter from the same stream being recorded
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      recorderAudioCtx = ctx;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyser || mediaRecorder?.state === "inactive") return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        onVolume(Math.min(1, avg / 128));
        requestAnimationFrame(tick);
      };
      tick();
    } catch {
      onVolume(0.2);
    }

    mediaRecorder.start(250);
    return { ok: true };
  } catch (err: unknown) {
    const e = err as { name?: string };
    if (e.name === "NotAllowedError") {
      return { ok: false, error: "Microphone permission denied. Please allow mic access." };
    }
    if (e.name === "NotFoundError") {
      return { ok: false, error: "No microphone found. Please connect a microphone." };
    }
    return { ok: false, error: "Microphone शुरू नहीं हो पाई।" };
  }
}

export async function stopManualRecording(): Promise<{
  blob: Blob | null;
  mime: string;
  durationMs: number;
}> {
  const durationMs = recorderStartedAt ? Date.now() - recorderStartedAt : 0;

  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    stopManualRecordingCleanup();
    return { blob: null, mime: "", durationMs };
  }

  return new Promise((resolve) => {
    const recorder = mediaRecorder!;
    recorder.onstop = () => {
      const type = recorder.mimeType || "audio/webm";
      const blob = new Blob(recorderChunks, { type });
      stopManualRecordingCleanup();
      resolve({
        blob: blob.size > 0 ? blob : null,
        mime: type,
        durationMs,
      });
    };
    try {
      recorder.stop();
    } catch {
      stopManualRecordingCleanup();
      resolve({ blob: null, mime: "", durationMs });
    }
  });
}

export function cancelManualRecording(): void {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
    } catch {
      /* ignore */
    }
  }
  stopManualRecordingCleanup();
}

function stopManualRecordingCleanup(): void {
  mediaRecorder = null;
  recorderChunks = [];
  recorderStartedAt = 0;
  recorderStream?.getTracks().forEach((t) => t.stop());
  recorderStream = null;
  if (recorderAudioCtx && recorderAudioCtx.state !== "closed") {
    recorderAudioCtx.close().catch(() => {});
  }
  recorderAudioCtx = null;
}

// ─── Server-side transcription of a recorded blob ───
// POSTs raw audio to the Convex HTTP action → Deepgram (Hindi).

export async function transcribeRecording(
  blob: Blob,
): Promise<{ text?: string; error?: "not_configured" | "empty" | "network" | "failed" | "no_speech" }> {
  const convexUrl = (import.meta.env.VITE_CONVEX_URL as string | undefined) || "";
  const siteUrl = convexUrl.replace(/\.convex\.cloud$/, ".convex.site");
  if (!siteUrl) return { error: "network" };

  try {
    const response = await fetch(`${siteUrl}/voice/transcribe`, {
      method: "POST",
      headers: { "Content-Type": blob.type || "audio/webm" },
      body: blob,
    });

    const data = (await response.json().catch(() => null)) as {
      text?: string;
      error?: string;
    } | null;

    if (!response.ok) {
      if (data?.error === "not_configured") return { error: "not_configured" };
      return { error: "failed" };
    }
    if (typeof data?.text === "string" && data.text.trim()) {
      return { text: data.text.trim() };
    }
    return { error: "no_speech" };
  } catch {
    return { error: "network" };
  }
}
