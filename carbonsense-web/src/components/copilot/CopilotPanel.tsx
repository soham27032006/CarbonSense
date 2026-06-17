import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useCopilotChat,
  useCopilotHistory,
  useCopilotSuggestions,
} from "@/hooks/useApi";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  pending?: boolean; // assistant typing-effect in progress
  suggestions?: string[];
}

interface HistoryResp {
  messages: Array<{ id: string; role: "user" | "assistant"; content: string; created_at: string }>;
}
interface SuggestResp {
  suggestions: string[];
}
interface ChatResp {
  response: string;
  suggestions: string[];
}

const DEFAULT_SUGGESTIONS = [
  "What's my biggest carbon category?",
  "How do I compare to the average?",
  "Give me tips to reduce food carbon",
  "Is organic really better?",
  "Plan me a low-carbon week",
  "What does my Carbon Age mean?",
];

export function CopilotPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [hasHistory, setHasHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const suggestionsQuery = useCopilotSuggestions();
  const historyQuery = useCopilotHistory();
  const chatMutation = useCopilotChat();

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (suggestionsQuery.data?.suggestions?.length) {
      setSuggestions(suggestionsQuery.data.suggestions);
    }
  }, [suggestionsQuery.data]);

  useEffect(() => {
    if (historyQuery.data?.messages?.length) {
      setHasHistory(true);
    }
  }, [historyQuery.data]);

  // Autofocus when the panel opens.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Auto-scroll to bottom whenever messages change.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  // Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadEarlier = useCallback(async () => {
    if (historyLoaded) return;
    try {
      const prior: Msg[] = ((historyQuery.data as HistoryResp | undefined)?.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      }));
      setMessages((cur) => [...prior, ...cur]);
      setHistoryLoaded(true);
      setHasHistory(false);
    } catch {
      setError("Couldn't load earlier messages.");
    }
  }, [historyLoaded, historyQuery.data]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setError(null);
      const userMsg: Msg = {
        id: `u_${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      const typingId = `a_${Date.now()}`;
      const typingMsg: Msg = {
        id: typingId,
        role: "assistant",
        content: "",
        pending: true,
      };
      setMessages((m) => [...m, userMsg, typingMsg]);
      setInput("");
      setSending(true);

      try {
        const data = (await chatMutation.mutateAsync(trimmed)) as ChatResp;
        // Type the response in character-by-character for a natural feel.
        const full = data.response ?? "";
        const followups = data.suggestions ?? [];
        const totalDuration = 600; // ms cap-ish
        const stepDelay = Math.max(6, Math.min(20, Math.floor(totalDuration / Math.max(40, full.length))));
        for (let i = 1; i <= full.length; i++) {
          await new Promise((r) => setTimeout(r, stepDelay));
          setMessages((m) =>
            m.map((msg) =>
              msg.id === typingId ? { ...msg, content: full.slice(0, i) } : msg,
            ),
          );
        }
        setMessages((m) =>
          m.map((msg) =>
            msg.id === typingId
              ? { ...msg, pending: false, content: full, suggestions: followups }
              : msg,
          ),
        );
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        const text =
          status === 429
            ? "You've reached the chat limit. Try again in a few minutes."
            : "Sorry, I couldn't process that. Try again?";
        setMessages((m) =>
          m.map((msg) =>
            msg.id === typingId ? { ...msg, pending: false, content: text } : msg,
          ),
        );
        setError(text);
      } finally {
        setSending(false);
        // Re-focus the composer for the next message.
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [sending],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const empty = messages.length === 0;
  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && !m.pending && m.suggestions?.length) return m;
    }
    return null;
  }, [messages]);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
        aria-hidden
      />

      {/* Panel */}
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-label="AI Copilot"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="copilot-panel fixed inset-0 z-[71] flex flex-col overflow-hidden border border-white/10 bg-[oklch(0.18_0.03_180)] text-foreground shadow-[0_-30px_80px_-20px_rgba(0,0,0,0.6)] lg:border-y-0 lg:border-r-0"
      >
        {/* drag handle */}
        <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-white/15 sm:hidden" />

        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-emerald-950">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">AI Copilot</h2>
              <p className="text-[11px] text-emerald-200/70">CarbonSense AI · personalized</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-foreground/80 transition hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4 pt-3 sm:px-5">
          {hasHistory && !historyLoaded && (
            <div className="mb-3 flex justify-center">
              <button
                type="button"
                onClick={loadEarlier}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-emerald-100/80 transition hover:bg-white/10"
              >
                Load earlier messages
              </button>
            </div>
          )}

          {empty ? (
            <EmptyState suggestions={suggestions} onPick={(s) => void sendMessage(s)} />
          ) : (
            <ul className="space-y-3">
              {messages.map((m) => (
                <li key={m.id}>
                  <Bubble msg={m} />
                  {m.role === "assistant" &&
                    !m.pending &&
                    m.suggestions?.length &&
                    m === lastAssistant ? (
                    <FollowUps items={m.suggestions} onPick={(s) => void sendMessage(s)} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={onSubmit}
          className="shrink-0 border-t border-white/5 bg-[oklch(0.18_0.03_180)]/95 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur sm:px-4"
        >
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-2 text-center text-xs text-amber-300"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 focus-within:border-emerald-300/40">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              disabled={sending}
              onChange={(e) => {
                setInput(e.target.value);
                // grow up to ~6 lines
                e.currentTarget.style.height = "auto";
                e.currentTarget.style.height =
                  Math.min(e.currentTarget.scrollHeight, 144) + "px";
              }}
              onKeyDown={onKeyDown}
              placeholder="Ask me anything about your carbon…"
              className="max-h-36 flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-foreground placeholder:text-foreground/40 focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label="Send message"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-emerald-950 shadow-[0_8px_24px_-8px_rgba(16,185,129,0.7)] transition hover:scale-[1.04] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </form>
      </motion.section>
    </>
  );
}

// ---------- bubbles ----------

function Bubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-end"
      >
        <div className="max-w-[82%] rounded-2xl rounded-br-md bg-gradient-to-br from-emerald-400 to-teal-500 px-3.5 py-2.5 text-sm font-medium text-emerald-950 shadow-[0_8px_22px_-12px_rgba(16,185,129,0.6)]">
          {msg.content}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex justify-start"
    >
      <div className="max-w-[88%]">
        <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/80">
          <span>✦</span>
          <span>CarbonSense AI</span>
        </div>
        <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm leading-relaxed text-foreground/95 backdrop-blur">
          {msg.pending && msg.content.length === 0 ? (
            <TypingDots />
          ) : (
            <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-ol:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-strong:text-emerald-200">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="AI is typing">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-emerald-200/80"
          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

function FollowUps({ items, onPick }: { items: string[]; onPick: (s: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="mt-2 flex flex-wrap gap-2 pl-1"
    >
      {items.slice(0, 3).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100 transition hover:bg-emerald-400/20"
        >
          {s}
        </button>
      ))}
    </motion.div>
  );
}

function EmptyState({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (s: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto flex max-w-md flex-col items-center pt-6 text-center"
    >
      <motion.div
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-2xl text-emerald-950 shadow-[0_18px_45px_-12px_rgba(16,185,129,0.7)]"
      >
        <Sparkles className="h-6 w-6" />
      </motion.div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">How can I help today?</h3>
      <p className="mt-1 text-sm text-foreground/60">
        Ask anything about your footprint, habits, or how to cut more carbon.
      </p>

      <div className="mt-5 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((s, i) => (
          <motion.button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.25 }}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-left text-sm text-foreground/90 transition hover:border-emerald-300/30 hover:bg-emerald-400/10"
          >
            {s}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
