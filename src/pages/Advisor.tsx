import { useState, useRef, useEffect, useCallback } from "react";
import { useOnboarding } from "@/lib/onboarding-context";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  Send,
  Bot,
  User,
  ArrowUpRight,
  Home,
  ChevronRight,
  Sparkles,
  Mic,
  Check,
} from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { generateAdvisorReply, runFeasibility } from "@/services/advisor/engine";
import type { AdvisorStateChange } from "@/services/advisor/engine";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  appliedNote?: string | null;
  timestamp: Date;
}

const DEFAULT_SUGGESTIONS: string[] = [
  "Why is my score what it is?",
  "Which business is better for me?",
  "How much loan do I need?",
  "Which government scheme may help?",
  "What should I do next?",
  "मेरे पास 2 लाख हैं, गाँव में dairy शुरू करना है",
];

export default function Advisor() {
  const {
    feasibility, location, business, capital, radius,
    setLocation, setBusiness, setCapital, setFeasibility,
  } = useOnboarding();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const businessName = business?.name || (location ? "your business" : "your business");
  const locationName = location ? `${location.name}, ${location.district}` : "your location";

  const handleSend = useCallback(async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: question,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSuggestions([]);

    const reply = generateAdvisorReply({
      message: question,
      context: { location, business, capital, feasibility, radius },
    });

    // Sync asserted changes into shared context (single source of truth)
    if (reply.apply?.recompute) {
      if (reply.apply.business) setBusiness(reply.apply.business);
      if (reply.apply.capital !== undefined) setCapital(reply.apply.capital);
      if (reply.apply.location) setLocation(reply.apply.location);
      const b = reply.apply.business ?? business;
      const c = reply.apply.capital !== undefined ? reply.apply.capital : capital;
      const l = reply.apply.location ?? location;
      const f = runFeasibility(b, c, l, radius);
      if (f) setFeasibility(f);
    }

    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: reply.text,
      appliedNote: reply.apply?.summary ?? null,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, aiMsg]);

    if (reply.followups.length > 0) {
      setSuggestions(reply.followups);
    } else {
      setSuggestions(DEFAULT_SUGGESTIONS.slice(0, 4));
    }
  }, [input, location, business, capital, feasibility, setLocation, setBusiness, setCapital, setFeasibility]);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleVoiceDraft = useCallback(() => {
    // The floating advisor owns the microphone; focus the text input here and
    // hint the user toward the mic bubble.
    inputRef.current?.focus();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar variant="app" />

      <main className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
          <Link to="/" className="hover:text-foreground transition-colors">
            <Home className="h-3.5 w-3.5" />
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/dashboard" className="hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">AI Advisor</span>
        </div>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">AI Business Advisor</h1>
              <p className="text-xs text-muted-foreground">
                Context-aware guidance for {businessName} in {locationName}
              </p>
            </div>
          </div>
          <div className="mt-2 rounded-xl border border-border/70 bg-white px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            🎤 बोलकर पूछने के लिए नीचे दाएँ <Mic className="inline h-3 w-3" /> button दबाएँ — यहाँ लिखकर भी पूछ सकते हैं (Hindi / Hinglish / English)।
            सभी जवाब आपके current GramUdaan analysis और financial engine से निकलते हैं।
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col rounded-2xl border border-border bg-white overflow-hidden mb-4">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 min-h-[400px] max-h-[60vh]">
            {/* Welcome Message */}
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
                  <Bot className="h-7 w-7" />
                </div>
                <h3 className="text-base font-bold text-foreground mb-1">
                  Ask me anything about your business assessment
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  I understand your location, business type, capital, market data and financial structure.
                  Answers come from your actual analysis — not a generic chatbot.
                </p>
                {feasibility && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="text-xs font-semibold text-emerald-700">
                      Loaded: {business?.name ?? "—"} · {feasibility.overallScore}/100 ({feasibility.verdictLabel})
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {msg.role === "assistant" && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0 mt-1">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md",
                  )}
                >
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  {msg.appliedNote && (
                    <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-semibold">
                      <Check className="h-3 w-3" />
                      {msg.appliedNote} — analysis updated
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground flex-shrink-0 mt-1">
                    <User className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="px-4 pb-3 border-t border-border/50 pt-3">
              <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                Suggested Questions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/20 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Ask about your business analysis… (Hindi / Hinglish / English)"
                className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim()}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                  input.trim()
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground",
                )}
                aria-label="Send question"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={handleVoiceDraft}
              className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              <Mic className="h-3 w-3" />
              बोलकर पूछना है? नीचे दाएँ "AI Advisor" bubble में 🎙️ दबाएँ
            </button>
          </div>
        </div>

        {/* CTA */}
        <div className="flex justify-center gap-3 mb-8">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Back to Dashboard
          </Link>
          <Link
            to="/what-if"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try What-If
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
