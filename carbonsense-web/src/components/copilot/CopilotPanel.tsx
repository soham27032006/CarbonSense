import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useCopilotChat,
  useCopilotHistory,
  useCopilotSuggestions,
} from "@/hooks/useApi";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useFocusTrap } from "@/hooks/useFocusTrap";

type MessageRole = "user" | "assistant";

interface Msg {
  id: string;
  role: MessageRole;
  content: string;
  created_at?: string;
  pending?: boolean;
  suggestions?: string[];
}

interface HistoryResp {
  messages?: Array<{ id?: string; role: MessageRole; content: string; created_at?: string; timestamp?: string }>;
  history?: Array<{ id?: string; role: MessageRole; content: string; created_at?: string; timestamp?: string }>;
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

function toHistoryMessages(data: HistoryResp | undefined): Msg[] {
  const source = data?.messages ?? data?.history ?? [];
  return source.map((message, index) => ({
    id: message.id ?? `${message.role}_${index}_${message.timestamp ?? message.created_at ?? index}`,
    role: message.role,
    content: message.content,
    created_at: message.created_at ?? message.timestamp,
  }));
}

function getCopilotErrorMessage(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: { error?: { message?: string } } } })?.response;
  const backendMessage = response?.data?.error?.message?.trim();

  if (backendMessage) return backendMessage;

  const status = response?.status;
  if (status === 429) return "You've reached today's Copilot limit. Try again tomorrow.";
  if (status === 400) return "Write a message before asking Copilot to reply.";
  if (status === 401) return "Sign in again to keep chatting with Copilot.";
  if (status === 503) return "The assistant is under heavy demand right now. Try again in a moment.";
  if (status === 504) return "The assistant took too long to respond. Try again.";
  if (status === 502) return "The assistant couldn't answer that right now. Try again with a more specific question.";

  return "I couldn't reach the assistant right now.";
}

export function CopilotPanel({ onClose }: { onClose: () => void }) {
  const reduceMotion = useReducedMotion();
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
  const dialogRef = useFocusTrap<HTMLElement>(true, { initialFocusRef: inputRef });

  useEffect(() => {
    if (suggestionsQuery.data?.suggestions?.length) {
      setSuggestions(suggestionsQuery.data.suggestions);
    }
  }, [suggestionsQuery.data]);

  useEffect(() => {
    const priorMessages = toHistoryMessages(historyQuery.data as HistoryResp | undefined);
    if (priorMessages.length > 0) {
      setHasHistory(true);
    }
  }, [historyQuery.data]);

  useBodyScrollLock(true);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages, reduceMotion]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadEarlier = useCallback(async () => {
    if (historyLoaded) return;

    try {
      const prior = toHistoryMessages(historyQuery.data as HistoryResp | undefined);
      setMessages((current) => [...prior, ...current]);
      setHistoryLoaded(true);
      setHasHistory(false);
      setError(null);
    } catch {
      setError("Couldn't load earlier messages.");
    }
  }, [historyLoaded, historyQuery.data]);

  const focusComposer = useCallback(() => {
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      setError(null);
      const now = Date.now();
      const userMsg: Msg = {
        id: `u_${now}`,
        role: "user",
        content: trimmed,
      };
      const typingId = `a_${now}`;
      const typingMsg: Msg = {
        id: typingId,
        role: "assistant",
        content: "",
        pending: true,
      };

      setMessages((current) => [...current, userMsg, typingMsg]);
      setInput("");
      setSending(true);

      try {
        const data = (await chatMutation.mutateAsync(trimmed)) as ChatResp;
        const fullResponse =
          (data.response ?? "").trim() ||
          "I can help once I have a bit more carbon data from your recent activity.";
        const followUps = data.suggestions ?? [];

        if (reduceMotion) {
          setMessages((current) =>
            current.map((message) =>
              message.id === typingId
                ? { ...message, pending: false, content: fullResponse, suggestions: followUps }
                : message,
            ),
          );
        } else {
          const totalDuration = 600;
          const stepDelay = Math.max(6, Math.min(20, Math.floor(totalDuration / Math.max(40, fullResponse.length))));
          for (let index = 1; index <= fullResponse.length; index += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, stepDelay));
            setMessages((current) =>
              current.map((message) =>
                message.id === typingId ? { ...message, content: fullResponse.slice(0, index) } : message,
              ),
            );
          }
          setMessages((current) =>
            current.map((message) =>
              message.id === typingId
                ? { ...message, pending: false, content: fullResponse, suggestions: followUps }
                : message,
            ),
          );
        }
      } catch (error: unknown) {
        const message = getCopilotErrorMessage(error);
        setMessages((current) =>
          current.map((entry) =>
            entry.id === typingId ? { ...entry, pending: false, content: message } : entry,
          ),
        );
        setError(message);
      } finally {
        setSending(false);
        focusComposer();
      }
    },
    [chatMutation, focusComposer, reduceMotion, sending],
  );

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  };

  const empty = messages.length === 0;
  const lastAssistant = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant" && !message.pending && message.suggestions?.length) {
        return message;
      }
    }
    return null;
  }, [messages]);

  return (
    <>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
        aria-hidden
      />

      <motion.section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="AI Copilot"
        aria-busy={sending}
        initial={reduceMotion ? false : { y: "100%" }}
        animate={{ y: 0 }}
        exit={reduceMotion ? undefined : { y: "100%" }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 34 }}
        className="copilot-panel fixed inset-0 z-[71] flex flex-col overflow-hidden border border-white/10 bg-[oklch(0.18_0.03_180)] text-foreground shadow-[0_-30px_80px_-20px_rgba(0,0,0,0.6)] lg:border-y-0 lg:border-r-0"
      >
        <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-white/15 sm:hidden" />

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
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-foreground/80 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4 pt-3 sm:px-5" aria-live="polite">
          {hasHistory && !historyLoaded && (
            <div className="mb-3 flex justify-center">
              <button
                type="button"
                onClick={loadEarlier}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-emerald-100/80 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
              >
                Load earlier messages
              </button>
            </div>
          )}

          {empty ? (
            <EmptyState suggestions={suggestions} onPick={(suggestion) => void sendMessage(suggestion)} />
          ) : (
            <ul className="space-y-3">
              {messages.map((message) => (
                <li key={message.id}>
                  <Bubble msg={message} reduceMotion={reduceMotion} />
                  {message.role === "assistant" &&
                  !message.pending &&
                  message.suggestions?.length &&
                  message === lastAssistant ? (
                    <FollowUps
                      items={message.suggestions}
                      onPick={(suggestion) => void sendMessage(suggestion)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          onSubmit={onSubmit}
          className="shrink-0 border-t border-white/5 bg-[oklch(0.18_0.03_180)]/95 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur sm:px-4"
        >
          <AnimatePresence>
            {error ? (
              <motion.p
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                className="mb-2 text-center text-xs text-amber-300"
              >
                {error}
              </motion.p>
            ) : null}
          </AnimatePresence>

          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 focus-within:border-emerald-300/40">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              disabled={sending}
              aria-label="Message AI Copilot"
              onChange={(event) => {
                setInput(event.target.value);
                event.currentTarget.style.height = "auto";
                event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 144)}px`;
              }}
              onKeyDown={onKeyDown}
              placeholder="Ask me anything about your carbon..."
              className="max-h-36 flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-foreground placeholder:text-foreground/40 focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label="Send message"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-emerald-950 shadow-[0_8px_24px_-8px_rgba(16,185,129,0.7)] transition hover:scale-[1.04] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </form>
      </motion.section>
    </>
  );
}

function Bubble({ msg, reduceMotion }: { msg: Msg; reduceMotion: boolean | null }) {
  const motionProps = reduceMotion
    ? {
        initial: false as const,
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.2 },
      };

  if (msg.role === "user") {
    return (
      <motion.div {...motionProps} className="flex justify-end">
        <div className="max-w-[82%] rounded-2xl rounded-br-md bg-gradient-to-br from-emerald-400 to-teal-500 px-3.5 py-2.5 text-sm font-medium text-emerald-950 shadow-[0_8px_22px_-12px_rgba(16,185,129,0.6)]">
          {msg.content}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div {...motionProps} className="flex justify-start">
      <div className="max-w-[88%]">
        <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/80">
          <span aria-hidden>+</span>
          <span>CarbonSense AI</span>
        </div>
        <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm leading-relaxed text-foreground/95 backdrop-blur">
          {msg.pending && msg.content.length === 0 ? (
            <TypingDots reduceMotion={reduceMotion} />
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

function TypingDots({ reduceMotion }: { reduceMotion: boolean | null }) {
  if (reduceMotion) {
    return <span className="py-1 text-sm text-emerald-100/85">Thinking...</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="AI is typing">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="h-1.5 w-1.5 rounded-full bg-emerald-200/80"
          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: index * 0.15 }}
        />
      ))}
    </span>
  );
}

function FollowUps({ items, onPick }: { items: string[]; onPick: (suggestion: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="mt-2 flex flex-wrap gap-2 pl-1"
    >
      {items.slice(0, 3).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onPick(item)}
          className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100 transition hover:bg-emerald-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        >
          {item}
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
  onPick: (suggestion: string) => void;
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
        {suggestions.map((suggestion, index) => (
          <motion.button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index, duration: 0.25 }}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-left text-sm text-foreground/90 transition hover:border-emerald-300/30 hover:bg-emerald-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            {suggestion}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
