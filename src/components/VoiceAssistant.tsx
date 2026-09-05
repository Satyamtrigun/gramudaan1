import { useState, useRef, useEffect, useCallback } from "react";
import { useOnboarding } from "@/lib/onboarding-context";
import { generateAdvisorReply, runFeasibility } from "@/services/advisor/engine";
import type { AdvisorStateChange } from "@/services/advisor/engine";
import {
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  isMediaRecorderSupported,
  requestMicPermission,
  startListening,
  stopListening,
  speakHindi,
  stopSpeaking,
  startAudioAnalyzer,
  stopAudioAnalyzer,
  startManualRecording,
  stopManualRecording,
  cancelManualRecording,
  transcribeRecording,
} from "@/services/voiceService";
import {
  Mic, MicOff, X, Send, Volume2, VolumeX, Copy,
  Bot, User, AlertCircle, Play, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  isVoice?: boolean;
  appliedNote?: string | null;
}

type AppState = "idle" | "listening" | "recording" | "confirming" | "thinking" | "speaking" | "error" | "permission_required";

const DEFAULT_PROMPTS: string[] = [
  "मेरे लिए कौन सा business अच्छा है?",
  "मेरा score क्यों है?",
  "मुझे कितना loan मिलेगा?",
  "Competition कैसा है?",
  "मुझे कौन सी scheme मिल सकती है?",
  "अब मुझे क्या करना चाहिए?",
];

// Apply an engine-recommended state change to the shared context (single source of truth).
function applyContextChange(
  change: AdvisorStateChange | undefined,
  setters: {
    setBusiness: (b: ReturnType<typeof useOnboarding>["business"]) => void;
    setCapital: (c: number) => void;
    setLocation: (l: ReturnType<typeof useOnboarding>["location"]) => void;
    setFeasibility: (f: ReturnType<typeof useOnboarding>["feasibility"]) => void;
  },
  current: { location: ReturnType<typeof useOnboarding>["location"]; business: ReturnType<typeof useOnboarding>["business"]; capital: number },
): void {
  if (!change?.recompute) return;

  if (change.business) setters.setBusiness(change.business);
  if (change.capital !== undefined) setters.setCapital(change.capital);
  if (change.location) setters.setLocation(change.location);

  const business = change.business ?? current.business;
  const capital = change.capital !== undefined ? change.capital : current.capital;
  const location = change.location ?? current.location;
  const feasibility = runFeasibility(business, capital, location);
  if (feasibility) setters.setFeasibility(feasibility);
}

export function VoiceAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [appState, setAppState] = useState<AppState>("idle");
  const [interimText, setInterimText] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [micVolume, setMicVolume] = useState(0);
  const [lastResponseText, setLastResponseText] = useState("");
  const [showWelcome, setShowWelcome] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_PROMPTS);
  const [micSupported] = useState(() => isSpeechRecognitionSupported());
  const [recorderSupported] = useState(() => isMediaRecorderSupported());
  const [voiceErrCode, setVoiceErrCode] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const {
    location, business, capital, feasibility, radius,
    setLocation, setBusiness, setCapital, setFeasibility,
  } = useOnboarding();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, appState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      stopSpeaking();
      stopAudioAnalyzer();
      cancelManualRecording();
    };
  }, []);

  // Recording timer for the fallback capture mode
  useEffect(() => {
    if (appState !== "recording") {
      setRecordingSeconds(0);
      return;
    }
    const id = window.setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [appState]);

  // ─── Send message through the real GramUdaan advisor engine ───
  const sendMessage = useCallback(async (raw: string, isVoice = false) => {
    const text = raw.trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setInterimText("");
    setFinalTranscript("");

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      timestamp: Date.now(),
      isVoice,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setAppState("thinking");
    setSuggestions([]);

    try {
      const reply = generateAdvisorReply({
        message: text,
        context: { location, business, capital, feasibility, radius },
      });

      // Sync asserted changes into the shared onboarding context
      applyContextChange(reply.apply, { setBusiness, setCapital, setLocation, setFeasibility }, { location, business, capital });

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: reply.text,
        timestamp: Date.now(),
        appliedNote: reply.apply?.summary ?? null,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setLastResponseText(reply.text);
      setShowWelcome(false);

      if (reply.followups.length > 0) {
        setSuggestions(reply.followups);
      } else if (messages.length < 2) {
        setSuggestions(DEFAULT_PROMPTS);
      }

      // Speak the response in Hindi/Hinglish when enabled
      if (ttsEnabled && isSpeechSynthesisSupported()) {
        setAppState("speaking");
        const speakable = reply.text
          .replace(/[।•\n•]+/g, ". ")
          .replace(/\s+/g, " ")
          .trim();
        speakHindi(
          speakable,
          () => setAppState("idle"),
          () => {
            // TTS failures shouldn't block the conversation — text is always visible
            setAppState("idle");
          },
        );
      } else {
        setAppState("idle");
      }
    } catch {
      setError("जवाब तैयार नहीं हो पाया। कृपया दोबारा कोशिश करें।");
      setAppState("error");
      setSuggestions(DEFAULT_PROMPTS);
    } finally {
      busyRef.current = false;
    }
  }, [location, business, capital, feasibility, setBusiness, setCapital, setLocation, setFeasibility, ttsEnabled]);

  // ─── Native browser speech recognition (works outside sandboxed iframes) ───
  const handleVoiceStart = useCallback(async () => {
    if (busyRef.current) return;
    setError(null);
    setVoiceErrCode(null);
    setInterimText("");
    setFinalTranscript("");
    stopSpeaking();

    if (!micSupported) {
      // No native STT → go straight to audio-recording fallback if available
      if (recorderSupported) {
        startRecordMode();
      } else {
        setError("इस browser में voice input उपलब्ध नहीं है। कृपया लिखकर पूछें।");
        setAppState("error");
      }
      return;
    }

    const perm = await requestMicPermission();
    if (!perm.granted) {
      setError(perm.error || "Microphone permission required.");
      setAppState("permission_required");
      return;
    }

    setAppState("listening");
    startAudioAnalyzer((vol) => setMicVolume(vol));

    startListening(
      (text, isFinal) => {
        if (isFinal) {
          setFinalTranscript(text);
          setInterimText("");
          stopAudioAnalyzer();
          setMicVolume(0);
          setAppState("confirming");
        } else {
          setInterimText(text);
        }
      },
      (err, code) => {
        stopAudioAnalyzer();
        setMicVolume(0);
        // The browser speech service is unreachable inside sandboxed/cross-origin
        // preview iframes. Rather than stopping at an error card, fall straight
        // into audio-recording → server-side transcription, which works here.
        if (recorderSupported && (code === "network" || code === "unsupported")) {
          setError(null);
          setVoiceErrCode(code ?? null);
          setAppState("idle");
          window.setTimeout(() => startRecordModeRef.current(), 200);
          return;
        }
        setError(err);
        setVoiceErrCode(code ?? null);
        setAppState("error");
      },
      () => {
        stopAudioAnalyzer();
        setMicVolume(0);
        setAppState((prev) => (prev === "listening" ? "idle" : prev));
      },
      () => { /* mic live */ },
    );
  }, [micSupported, recorderSupported]);

  // ─── Fallback: record audio locally, then transcribe on the server ───
  const startRecordMode = useCallback(async () => {
    if (busyRef.current) return;
    setError(null);
    setVoiceErrCode(null);
    setInterimText("");
    setFinalTranscript("");
    stopSpeaking();
    stopListening();
    stopAudioAnalyzer();
    setMicVolume(0);

    const perm = await requestMicPermission();
    if (!perm.granted) {
      setError(perm.error || "Microphone permission required.");
      setAppState("permission_required");
      return;
    }

    const result = await startManualRecording((vol) => setMicVolume(vol));
    if (!result.ok) {
      setError(result.error || "Microphone शुरू नहीं हो पाई।");
      setAppState("error");
      return;
    }
    setAppState("recording");
    setRecordingSeconds(0);
  }, []);

  // Keep a ref so handleVoiceStart can auto-fall back into recording mode
  const startRecordModeRef = useRef<() => void>(() => {});
  startRecordModeRef.current = startRecordMode;

  const stopRecordAndSend = useCallback(async () => {
    const recording = await stopManualRecording();
    setMicVolume(0);
    if (!recording.blob) {
      setError("कोई आवाज़ रिकॉर्ड नहीं हुई। दोबारा बोलें।");
      setAppState("error");
      return;
    }

    setAppState("thinking");
    const result = await transcribeRecording(recording.blob);
    if (result.text) {
      setFinalTranscript(result.text);
      setInterimText("");
      setAppState("confirming");
      return;
    }

    if (result.error === "not_configured") {
      setError(
        "Voice transcription अभी configured नहीं है। Freebuff के Keys/API keys में DEEPGRAM_API_KEY डालें, फिर दोबारा try करें।",
      );
    } else if (result.error === "no_speech") {
      setError("कोई आवाज़ नहीं सुनाई दी। दोबारा बोलें।");
    } else {
      setError("आवाज़ transcribe नहीं हो पाई। Internet check करके दोबारा try करें।");
    }
    setVoiceErrCode("server");
    setAppState("error");
  }, []);

  const handleVoiceStop = useCallback(() => {
    stopListening();
    stopAudioAnalyzer();
    setMicVolume(0);
  }, []);

  const handleRecordCancel = useCallback(() => {
    cancelManualRecording();
    setMicVolume(0);
    setAppState("idle");
  }, []);

  const handleConfirmTranscript = useCallback(() => {
    if (finalTranscript) sendMessage(finalTranscript, true);
  }, [finalTranscript, sendMessage]);

  const handleRetryVoice = useCallback(() => {
    setError(null);
    setFinalTranscript("");
    setInterimText("");
    // If native STT is unavailable or unreachable in this browser, route the
    // retry through the audio-recording → server transcription path instead of
    // looping on the same failing service.
    if (recorderSupported && (!micSupported || voiceErrCode === "network" || voiceErrCode === "unsupported")) {
      startRecordMode();
    } else {
      handleVoiceStart();
    }
  }, [handleVoiceStart, startRecordMode, micSupported, recorderSupported, voiceErrCode]);

  const handleStopSpeaking = useCallback(() => {
    stopSpeaking();
    setAppState("idle");
  }, []);

  const handleReplay = useCallback(() => {
    if (!lastResponseText) return;
    stopSpeaking();
    setAppState("speaking");
    const speakable = lastResponseText
      .replace(/[।•\n]+/g, ". ")
      .replace(/\s+/g, " ")
      .trim();
    speakHindi(
      speakable,
      () => setAppState("idle"),
      () => setAppState("idle"),
    );
  }, [lastResponseText]);

  const handleClose = useCallback(() => {
    stopListening();
    stopSpeaking();
    stopAudioAnalyzer();
    setMicVolume(0);
    setIsOpen(false);
    setAppState("idle");
    setInterimText("");
    setFinalTranscript("");
    setError(null);
  }, []);

  const openPanel = useCallback(() => {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 250);
  }, []);

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={openPanel}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-3.5 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:-translate-y-0.5 transition-all duration-200"
          aria-label="Open GramUdaan Voice Advisor"
        >
          <Bot className="h-5 w-5" />
          <span className="text-sm font-semibold hidden sm:inline">AI Advisor</span>
          <span className="text-xs font-medium bg-primary-foreground/20 px-2 py-0.5 rounded-full">हिंदी</span>
        </button>
      )}

      {/* Conversation Panel */}
      {isOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 sm:hidden" onClick={handleClose} />
          <div
            role="dialog"
            aria-label="GramUdaan AI Advisor conversation"
            className="fixed z-50 bg-white border border-border shadow-2xl flex flex-col animate-slide-up inset-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[420px] sm:h-[620px] sm:rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-white sm:rounded-t-2xl">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-foreground font-serif-display">GramUdaan AI Advisor</h3>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <p className="text-[11px] text-muted-foreground truncate">
                    {appState === "listening" ? "सुन रहा हूँ..." :
                     appState === "thinking" ? "आपके analysis की जाँच कर रहा हूँ..." :
                     appState === "speaking" ? "जवाब दे रहा हूँ..." :
                     appState === "confirming" ? "पुष्टि करें..." :
                     business && location ? `${business.name} · ${location.name}` :
                     "आपका Business Advisor"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setTtsEnabled(!ttsEnabled)}
                  className={cn("p-2 rounded-lg transition-colors", ttsEnabled ? "hover:bg-muted" : "bg-muted/70")}
                  title={ttsEnabled ? "Voice बंद करें" : "Voice चालू करें"}
                  aria-label={ttsEnabled ? "Disable voice output" : "Enable voice output"}
                >
                  {ttsEnabled ? <Volume2 className="h-4 w-4 text-muted-foreground" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
                </button>
                <button onClick={handleClose} className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Close advisor">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Context strip */}
            {feasibility && (
              <div className="px-4 py-1.5 bg-emerald-50/70 border-b border-emerald-100 flex items-center gap-2 overflow-x-auto">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide flex-shrink-0">Analysis:</span>
                <span className="text-[10px] text-emerald-800 whitespace-nowrap">
                  {business?.name} · {location?.name}
                </span>
                <span className="text-[10px] font-semibold text-emerald-800 whitespace-nowrap">
                  {feasibility.overallScore}/100 · {feasibility.verdictLabel}
                </span>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {/* Welcome */}
              {showWelcome && messages.length === 0 && (
                <div className="text-center py-6 animate-fade-in">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 mx-auto mb-3 flex items-center justify-center">
                    <Bot className="h-7 w-7 text-primary" />
                  </div>
                  <p className="text-sm font-bold text-foreground mb-1">नमस्ते! 🙏</p>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                    मैं GramUdaan हूँ। मैं आपके business analysis को समझता हूँ — बोलिए या लिखिए, और मैं असली analysis data से जवाब दूँगा।
                  </p>
                  {feasibility ? (
                    <div className="mt-3 inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[11px] font-medium text-emerald-700">
                        Analysis loaded: {feasibility.overallScore}/100 · {business?.name}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-3 inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5">
                      <span className="text-[11px] font-medium text-amber-700">
                        कोई analysis नहीं — location + business + capital बताइए, मैं चला दूँगा
                      </span>
                    </div>
                  )}
                  {micSupported || recorderSupported ? (
                    <button
                      onClick={micSupported ? handleVoiceStart : startRecordMode}
                      className="mt-5 mx-auto flex flex-col items-center gap-2"
                    >
                      <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 hover:shadow-xl transition-all hover:scale-105">
                        <Mic className="h-7 w-7" />
                      </div>
                      <span className="text-xs font-medium text-primary">
                        {micSupported ? "बोलकर पूछें" : "बोलकर पूछें (ऑडियो)"}
                      </span>
                    </button>
                  ) : (
                    <p className="text-[10px] text-red-500 mt-4">इस browser में voice उपलब्ध नहीं — नीचे लिखकर पूछें</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2">या अपना सवाल नीचे लिखें</p>
                </div>
              )}

              {/* Messages */}
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex gap-2 animate-fade-in", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md",
                  )}>
                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    {msg.appliedNote && (
                      <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-semibold">
                        <Check className="h-3 w-3" />
                        {msg.appliedNote}
                      </div>
                    )}
                    {msg.role === "assistant" && (
                      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/30">
                        <button onClick={handleReplay} className="p-1 rounded hover:bg-background/50 transition-colors" title="फिर सुनें" aria-label="Replay response">
                          <Volume2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => navigator.clipboard.writeText(msg.text)}
                          className="p-1 rounded hover:bg-background/50 transition-colors"
                          title="Copy"
                          aria-label="Copy response"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted flex-shrink-0 mt-0.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {/* Live transcription while listening */}
              {appState === "listening" && interimText && (
                <div className="flex gap-2 animate-fade-in justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm bg-primary/20 text-foreground border border-primary/20 border-dashed">
                    <p className="whitespace-pre-wrap italic">{interimText}</p>
                  </div>
                </div>
              )}

              {/* Confirmation step */}
              {appState === "confirming" && finalTranscript && (
                <div className="animate-fade-in">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">क्या आपने कहा:</p>
                    <p className="text-sm font-medium text-foreground mb-2.5">"{finalTranscript}"</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleConfirmTranscript}
                        className="flex-1 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold hover:bg-primary/90 transition-colors"
                      >
                        हाँ, पूछें ✓
                      </button>
                      <button
                        onClick={handleRetryVoice}
                        className="flex-1 rounded-lg bg-white border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
                      >
                        फिर बोलें
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Thinking */}
              {appState === "thinking" && (
                <div className="flex gap-2 animate-fade-in">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground">आपके analysis की जाँच कर रहा हूँ...</span>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 animate-fade-in">
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-red-700">{error}</p>
                    {voiceErrCode === "network" && recorderSupported && (
                      <p className="text-[10px] text-red-500 mt-1 leading-relaxed">
                        इस browser में direct voice recognition connect नहीं हो पा रहा — audio recording के ज़रिए server-side transcription उपयोग करें।
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                      {recorderSupported && (voiceErrCode === "network" || voiceErrCode === "unsupported" || !micSupported) && (
                        <button
                          onClick={() => { setError(null); setVoiceErrCode(null); startRecordMode(); }}
                          className="text-[11px] font-bold text-red-700 hover:underline"
                        >
                          🎙️ ऑडियो से पूछें
                        </button>
                      )}
                      <button onClick={handleRetryVoice} className="text-[11px] font-semibold text-red-600 hover:underline">
                        दोबारा बोलें →
                      </button>
                      <button onClick={() => { setError(null); setAppState("idle"); inputRef.current?.focus(); }} className="text-[11px] font-semibold text-muted-foreground hover:underline">
                        लिखकर पूछें
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggestion chips (contextual — from the engine's followups) */}
            {suggestions.length > 0 && appState === "idle" && (
              <div className="px-4 py-2 border-t border-border/50 max-h-24 overflow-y-auto">
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-[11px] font-medium px-2.5 py-1.5 rounded-full border border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Listening indicator with real waveform */}
            {appState === "listening" && (
              <div className="px-4 py-2.5 bg-primary/5 border-t border-primary/10">
                <div className="flex items-center justify-center gap-3">
                  <div className="flex items-end gap-[3px] h-6">
                    {[...Array(7)].map((_, i) => {
                      const height = 4 + micVolume * 22 * (0.4 + 0.6 * Math.abs(Math.sin(Date.now() / 220 + i * 0.9)));
                      return (
                        <div
                          key={i}
                          className="w-[3px] bg-primary rounded-full transition-all duration-75"
                          style={{ height: `${Math.max(4, Math.min(24, height))}px` }}
                        />
                      );
                    })}
                  </div>
                  <span className="text-xs font-medium text-primary">सुन रहा हूँ... बोलिए</span>
                </div>
              </div>
            )}

            {/* Recording indicator (server-transcribed audio fallback) */}
            {appState === "recording" && (
              <div className="px-4 py-2.5 bg-red-50 border-t border-red-100">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-center gap-2.5">
                    <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                    <span className="text-xs font-semibold text-red-700">
                      रिकॉर्ड हो रहा है… {recordingSeconds}s
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={stopRecordAndSend}
                      className="rounded-lg bg-red-600 text-white px-3.5 py-1.5 text-[11px] font-semibold hover:bg-red-700 transition-colors"
                    >
                      ⏹ रोकें और भेजें
                    </button>
                    <button
                      onClick={handleRecordCancel}
                      className="rounded-lg bg-white border border-border px-3.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted transition-colors"
                    >
                      रद्द करें
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Speaking indicator */}
            {appState === "speaking" && (
              <div className="px-4 py-2.5 bg-emerald-50 border-t border-emerald-100">
                <div className="flex items-center justify-center gap-3">
                  <Volume2 className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
                  <span className="text-xs font-medium text-emerald-700">जवाब दे रहा हूँ...</span>
                  <button onClick={handleStopSpeaking} className="text-[10px] font-semibold text-emerald-600 underline" aria-label="Stop speaking">
                    रोकें
                  </button>
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="px-3 py-3 border-t border-border bg-white sm:rounded-b-2xl">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (inputText.trim()) sendMessage(inputText);
                    }
                  }}
                  placeholder="अपना सवाल लिखें... (Hindi / Hinglish / English)"
                  className="flex-1 rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                  disabled={appState === "thinking" || appState === "confirming"}
                />

                {inputText.trim() ? (
                  <button
                    onClick={() => sendMessage(inputText)}
                    disabled={appState === "thinking" || appState === "confirming"}
                    className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50"
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                ) : appState === "speaking" ? (
                  <button
                    onClick={handleStopSpeaking}
                    className="h-10 w-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors"
                    aria-label="Stop AI response"
                  >
                    <VolumeX className="h-4 w-4" />
                  </button>
                ) : appState === "listening" ? (
                  <button
                    onClick={handleVoiceStop}
                    className="h-10 w-10 rounded-xl bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors animate-pulse"
                    aria-label="Stop listening"
                  >
                    <MicOff className="h-4 w-4" />
                  </button>
                ) : appState === "confirming" ? (
                  <button
                    onClick={handleConfirmTranscript}
                    className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
                    aria-label="Send confirmed message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                ) : appState === "recording" ? (
                  <button
                    onClick={stopRecordAndSend}
                    className="h-10 w-10 rounded-xl bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors animate-pulse"
                    aria-label="Stop recording and send"
                  >
                    <MicOff className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={micSupported ? handleVoiceStart : startRecordMode}
                    disabled={(!micSupported && !recorderSupported) || appState === "thinking"}
                    className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40",
                      micSupported || recorderSupported ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground",
                    )}
                    aria-label={micSupported ? "Start voice input" : recorderSupported ? "Start audio recording" : "Voice input not supported"}
                    title={micSupported ? "बोलकर पूछें" : recorderSupported ? "बोलकर पूछें (ऑडियो)" : "Voice input not supported"}
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Replay last response */}
              {lastResponseText && appState === "idle" && messages.length > 0 && (
                <button
                  onClick={handleReplay}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors"
                >
                  <Play className="h-3 w-3" />
                  फिर सुनें · Replay
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
