/**
 * TanStack route module for CarbonSense web screens. Defines route metadata and page-level UI composition.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  Leaf,
  Loader2,
  Share2,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { useUnits } from "@/contexts/UnitsContext";
import { api } from "@/lib/api";
import { useChallengeLibrary } from "@/hooks/useApi";
import { useAuthStore } from "@/stores/authStore";
import { StickyHeader } from "@/components/StickyHeader";
import { convertCO2, formatCO2, getCO2Label, pluralize, pluralizeNoun, type UnitSystem } from "@/utils/units";

export const Route = createFileRoute("/challenges")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Challenges — CarbonSense" },
      {
        name: "description",
        content: "Your daily carbon challenge, full history, and the complete challenge library.",
      },
    ],
  }),
  component: ChallengesPage,
});

// ---------- types ----------
type Status = "pending" | "accepted" | "completed" | "skipped";
type LibCategory = "food" | "transport" | "home" | "shopping" | "lifestyle";
type LibraryFilter = "all" | LibCategory;

interface TodayChallenge {
  id: string;
  assignment?: {
    id: string;
    status: Status;
  };
  category: string;
  emoji: string;
  title: string;
  description: string;
  savings_kg: number;
  xp_reward: number;
  difficulty: "Easy" | "Medium" | "Hard";
  participants_today: number;
  why: string;
  tips: string[];
  equivalency: string;
  streak_last_14: boolean[];
}

interface HistoryItem {
  id: string;
  title: string;
  emoji: string;
  category: string;
  date: string;
  status: "completed" | "skipped" | "missed";
  xp_earned: number;
  savings_kg: number;
}

interface HistoryResponse {
  page: number;
  total: number;
  has_more: boolean;
  summary: {
    completed: number;
    total: number;
    carbon_saved_kg: number;
    completion_rate: number;
  };
  items: HistoryItem[];
}

interface LibItem {
  id: string;
  category: LibCategory;
  emoji: string;
  title: string;
  description: string;
  difficulty: "Easy" | "Medium" | "Hard";
  savings_kg: number;
  xp_reward: number;
}

const DIFF_COLOR: Record<string, string> = {
  easy: "bg-emerald-400/15 text-emerald-200 border-emerald-300/30",
  medium: "bg-amber-400/15 text-amber-200 border-amber-300/30",
  hard: "bg-rose-400/15 text-rose-200 border-rose-300/30",
};

function diffColorClass(difficulty: string | undefined): string {
  const key = (difficulty ?? "").trim().toLowerCase();
  return DIFF_COLOR[key] ?? "bg-white/10 text-muted-foreground border-white/10";
}

function formatDifficulty(difficulty: string | undefined): string {
  const key = (difficulty ?? "").trim().toLowerCase();
  if (!key) return "Unknown";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

const LIB_SECTIONS: { key: LibCategory; emoji: string; label: string }[] = [
  { key: "food", emoji: "🍽", label: "Food" },
  { key: "transport", emoji: "🚗", label: "Transport" },
  { key: "home", emoji: "🏠", label: "Home" },
  { key: "shopping", emoji: "🛍", label: "Shopping" },
  { key: "lifestyle", emoji: "🧘", label: "Lifestyle" },
];

type Tab = "today" | "history" | "library";

// ---------- page ----------
function ChallengesPage() {
  const user = useAuthStore((s) => s.user);
  const firstName = useMemo(() => {
    const n = user?.full_name?.trim() || user?.email?.split("@")[0] || "friend";
    return n.split(" ")[0].replace(/^./, (c) => c.toUpperCase());
  }, [user]);

  const [tab, setTab] = useState<Tab>("today");

  return (
    <main className="relative overflow-x-hidden bg-background text-foreground">
      <Ambient />
      <StickyHeader avatarName={firstName} />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-28 pt-6 sm:px-8">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold sm:text-3xl"
        >
          Challenge Center
        </motion.h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One small action a day. Watch it compound.
        </p>

        <Tabs tab={tab} onChange={setTab} />

        <div className="mt-6">
          <AnimatePresence mode="wait">
            {tab === "today" && <TodayTab key="today" onBrowseLibrary={() => setTab("library")} />}
            {tab === "history" && <HistoryTab key="history" />}
            {tab === "library" && <LibraryTab key="library" />}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}

// ---------- tabs ----------
function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "history", label: "History" },
    { key: "library", label: "Library" },
  ];
  return (
    <div className="mt-5 flex rounded-2xl border border-white/10 bg-white/[0.04] p-1">
      {tabs.map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className="relative flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition"
          >
            {active && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-400/90 to-teal-300/90"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className={active ? "relative text-emerald-950" : "relative text-muted-foreground"}>
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- TODAY ----------
function TodayTab({ onBrowseLibrary }: { onBrowseLibrary: () => void }) {
  const { unitSystem } = useUnits();
  const [challenge, setChallenge] = useState<TodayChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("pending");
  const [busy, setBusy] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [celebrateXp, setCelebrateXp] = useState<number | null>(null);
  const [celebrateLevelUp, setCelebrateLevelUp] = useState(false);
  const [altOffset, setAltOffset] = useState(0);
  const [swapDir, setSwapDir] = useState(0);
  const [tipsOpen, setTipsOpen] = useState(false);

  const load = async (alt = 0) => {
    setLoadError(null);
    try {
      const { data } = await api.get<TodayChallenge>("/challenges/today", {
        params: { alt },
      });
      setChallenge(data);
      setStatus(data.assignment?.status ?? "pending");
    } catch {
      setChallenge(null);
      setLoadError("Couldn't load today's challenge.");
      toast.error("Couldn't load today's challenge.", { id: "challenge-today-load-error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accept = async () => {
    if (!challenge) return;
    const assignmentId = challenge.assignment?.id;
    if (!assignmentId) {
      toast.error("Please refresh — could not find your assignment.");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/challenges/${assignmentId}/accept`, {});
      setStatus("accepted");
      toast.success("Challenge accepted — go get it.");
    } catch {
      toast.error("Couldn't accept the challenge.", { id: "challenge-accept-error" });
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!challenge) return;
    const assignmentId = challenge.assignment?.id;
    if (!assignmentId) {
      toast.error("Please refresh — could not find your assignment.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<{
        xp_earned: number;
        new_total_xp: number;
        streak_count: number;
        is_streak_milestone: boolean;
        level_up: boolean;
        achievements_earned: string[];
      }>(`/challenges/${assignmentId}/complete`, {});
      setStatus("completed");
      setCelebrateXp(typeof data?.xp_earned === "number" ? data.xp_earned : 0);
      setCelebrateLevelUp(Boolean(data?.level_up));
      setCelebrate(true);
    } catch {
      toast.error("Couldn't mark complete.", { id: "challenge-complete-error" });
    } finally {
      setBusy(false);
    }
  };

  const skip = async (reason: string) => {
    if (!challenge) return;
    const assignmentId = challenge.assignment?.id;
    if (!assignmentId) {
      toast.error("Please refresh — could not find your assignment.");
      setSkipOpen(false);
      return;
    }
    setSkipOpen(false);
    setBusy(true);
    try {
      await api.post(`/challenges/${assignmentId}/skip`, { reason });
      const next = altOffset + 1;
      setAltOffset(next);
      setSwapDir(1);
      setStatus("skipped");
      await load(next);
      setStatus("pending");
      toast.success("Here's another one for you.");
    } catch {
      toast.error("Couldn't skip the challenge.", { id: "challenge-skip-error" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <div className="h-80 animate-pulse rounded-3xl bg-white/5" />
        <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
      </motion.div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
        <p className="text-base font-semibold">{loadError}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          We'll only show a daily challenge after the backend returns one.
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            load(altOffset);
          }}
          className="mt-5 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-emerald-950"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-muted-foreground">
        No challenge has been assigned yet.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-5"
    >
      {/* featured card */}
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" custom={swapDir}>
          <motion.div
            key={challenge.id + altOffset}
            custom={swapDir}
            initial={{ x: swapDir ? 320 : 0, opacity: swapDir ? 0 : 1 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <FeaturedCard
              challenge={challenge}
              status={status}
              busy={busy}
              unitSystem={unitSystem}
              xpEarned={celebrateXp}
              onAccept={accept}
              onComplete={complete}
              onSkip={() => setSkipOpen(true)}
              onBrowseLibrary={onBrowseLibrary}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* why */}
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/12 via-fuchsia-500/8 to-sky-500/8 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-400">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-violet-200/80">
              Why this challenge?
            </p>
            <p className="mt-1 text-sm leading-relaxed">{challenge.why}</p>
          </div>
        </div>
      </section>

      {/* tips accordion */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
        <button
          type="button"
          aria-expanded={tipsOpen}
          onClick={() => setTipsOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <span className="text-sm font-semibold">Tips to nail it</span>
          <motion.span animate={{ rotate: tipsOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {tipsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <ul className="space-y-2.5 px-5 pb-5">
                {challenge.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-emerald-400/15 text-[11px] font-bold text-emerald-300">
                      {i + 1}
                    </span>
                    {tip}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* saves stat */}
      <section className="flex items-center gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-5">
        <Leaf className="h-6 w-6 flex-none text-emerald-300" />
        <p className="text-sm">
          This saves <span className="font-semibold text-emerald-200">{formatCO2(challenge.savings_kg, unitSystem)}</span>{" "}
          — equivalent to {challenge.equivalency}.
        </p>
      </section>

      {/* others doing this */}
      <section className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        {challenge.participants_today > 0 && (
          <span className="flex -space-x-2">
            {["🦊", "🐼", "🐧", "🦉", "🐝"]
              .slice(0, Math.min(5, challenge.participants_today))
              .map((emoji, i) => (
                <motion.span
                  key={i}
                  initial={{ scale: 0, x: -8 }}
                  animate={{ scale: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.07, type: "spring", stiffness: 400, damping: 20 }}
                  className="grid h-8 w-8 place-items-center rounded-full border-2 border-background bg-gradient-to-br from-emerald-300 to-teal-400 text-xs"
                >
                  {emoji}
                </motion.span>
              ))}
          </span>
        )}
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {challenge.participants_today === 0 ? (
            <span className="font-semibold text-foreground">Be the first</span>
          ) : (
            <>
              <span className="font-semibold text-foreground">{challenge.participants_today}</span>{" "}
              {pluralize(challenge.participants_today, "other", "others")} doing this today
            </>
          )}
        </p>
      </section>

      {/* streak calendar */}
      <StreakStrip days={challenge.streak_last_14} />

      {/* modals */}
      <AnimatePresence>
        {skipOpen && <SkipSheet onClose={() => setSkipOpen(false)} onConfirm={skip} />}
      </AnimatePresence>
      <AnimatePresence>
        {celebrate && (
          <Celebration
            challenge={challenge}
            xpEarned={celebrateXp ?? challenge.xp_reward}
            levelUp={celebrateLevelUp}
            onClose={() => setCelebrate(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FeaturedCard({
  challenge,
  status,
  busy,
  unitSystem,
  xpEarned,
  onAccept,
  onComplete,
  onSkip,
  onBrowseLibrary,
}: {
  challenge: TodayChallenge;
  status: Status;
  busy: boolean;
  unitSystem: UnitSystem;
  xpEarned: number | null;
  onAccept: () => void;
  onComplete: () => void;
  onSkip: () => void;
  onBrowseLibrary: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-emerald-200/20 bg-gradient-to-br from-emerald-400/30 via-teal-400/20 to-sky-500/20 p-7 shadow-[0_30px_80px_-30px_rgba(16,185,129,0.6)] sm:p-9">
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-300/30 blur-3xl" />
      <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-teal-300/20 blur-3xl" />

      <div className="relative flex items-start justify-between">
        <span className="rounded-full bg-emerald-950/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-100">
          Today's Challenge
        </span>
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-4xl backdrop-blur">
          {challenge.emoji}
        </span>
      </div>

      <h2 className="relative mt-6 text-3xl font-bold leading-tight sm:text-4xl">{challenge.title}</h2>
      <p className="relative mt-2 max-w-md text-sm text-emerald-50/85 sm:text-base">
        {challenge.description}
      </p>

      <div className="relative mt-5 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-emerald-950/30 px-2.5 py-1 font-medium text-emerald-50">
          Saves {formatCO2(challenge.savings_kg, unitSystem)}
        </span>
        <span className="rounded-full bg-emerald-950/30 px-2.5 py-1 font-medium text-emerald-50">
          Earns {challenge.xp_reward} XP
        </span>
        <span className="rounded-full bg-emerald-950/30 px-2.5 py-1 font-medium text-emerald-50">
          {challenge.difficulty}
        </span>
      </div>

      <div className="relative mt-7">
        {status === "completed" ? (
          <>
            <div className="flex w-full cursor-default items-center justify-center gap-2 rounded-full bg-emerald-300/90 px-6 py-4 text-base font-semibold text-emerald-950">
              <CheckCircle2 className="h-5 w-5" />
              Completed! +{xpEarned ?? challenge.xp_reward} XP <Star className="h-4 w-4 fill-current" />
            </div>
            <button
              type="button"
              onClick={onBrowseLibrary}
              className="mt-3 block w-full py-2 text-center text-sm text-emerald-300 transition-colors hover:text-emerald-200"
            >
              Browse more challenges →
            </button>
          </>
        ) : status === "accepted" ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={onComplete}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-300 px-6 py-4 text-base font-semibold text-emerald-950 transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Mark Complete 🎉</>}
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="mt-3 block w-full text-center text-xs text-emerald-50/70 underline-offset-4 hover:underline"
            >
              I couldn't today
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={onAccept}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-300 px-6 py-4 text-base font-semibold text-emerald-950 transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Accept Challenge ✓</>}
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="mt-3 block w-full text-center text-xs text-emerald-50/70 underline-offset-4 hover:underline"
            >
              Try Another
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StreakStrip({ days }: { days: boolean[] }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Your challenge streak
      </p>
      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
        {days.map((done, i) => {
          const isToday = i === 13;
          return (
            <motion.span
              key={i}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.03, type: "spring", stiffness: 400, damping: 22 }}
              title={isToday ? "Today" : done ? "Completed" : "Missed"}
              className={[
                "mx-auto h-6 w-6 rounded-full",
                isToday
                  ? "bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.7)]"
                  : done
                    ? "bg-emerald-400"
                    : "border border-white/15 bg-white/5",
              ].join(" ")}
            />
          );
        })}
      </div>
      <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-emerald-400" /> Completed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-amber-300" /> Today
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border border-white/15 bg-white/5" /> Missed
        </span>
      </div>
    </section>
  );
}

// ---------- HISTORY ----------
type HistoryFilter = "all" | "completed" | "skipped";

function HistoryTab() {
  const { unitSystem } = useUnits();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [summary, setSummary] = useState<HistoryResponse["summary"] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [category, setCategory] = useState<string>("all");

  const load = async (p: number) => {
    if (p === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const { data } = await api.get<HistoryResponse>("/challenges/history", {
        params: { page: p, limit: 20 },
      });
      setItems((prev) => (p === 1 ? data.items : [...prev, ...data.items]));
      setSummary(data.summary);
      setHasMore(data.has_more);
      setPage(p);
    } catch {
      toast.error("Couldn't load history.", { id: "challenge-history-load-error" });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filter !== "all" && it.status !== filter) return false;
      if (category !== "all" && it.category !== category) return false;
      return true;
    });
  }, [items, filter, category]);

  const grouped = useMemo(() => groupByWeek(filtered), [filtered]);

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />
        ))}
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      {/* summary */}
      {summary && (
        <section className="grid grid-cols-2 gap-3">
          <SummaryStat label="Completed" value={summary.completed} accent="text-emerald-300" />
          <SummaryStat
            label="Carbon saved"
            value={convertCO2(summary.carbon_saved_kg, unitSystem)}
            suffix={` ${getCO2Label(unitSystem)}`}
            accent="text-sky-300"
          />
          <SummaryStat
            label="Completion rate"
            value={summary.completion_rate}
            suffix="%"
            accent="text-amber-300"
          />
        </section>
      )}

      {/* filters */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(["all", "completed", "skipped"] as HistoryFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={[
              "rounded-full border px-3.5 py-1.5 text-xs font-medium capitalize transition",
              filter === f
                ? "border-emerald-300/50 bg-emerald-400/15 text-emerald-200"
                : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20",
            ].join(" ")}
          >
            {f}
          </button>
        ))}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="ml-auto rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-300/40"
        >
          <option value="all">All categories</option>
          <option value="food">Food</option>
          <option value="transport">Transport</option>
          <option value="home">Home</option>
          <option value="shopping">Shopping</option>
          <option value="lifestyle">Lifestyle</option>
        </select>
      </div>

      {/* grouped list */}
      <div className="mt-6 space-y-6">
        {grouped.length === 0 && (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-muted-foreground">
            Nothing matches that filter.
          </p>
        )}
        {grouped.map((g) => (
          <div key={g.label}>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              {g.label}
            </p>
            <ul className="space-y-2">
              {g.items.map((it) => (
                <HistoryRow key={it.id} item={it} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => load(page + 1)}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-3 text-sm font-medium transition hover:bg-white/[0.08] disabled:opacity-60"
        >
          {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
        </button>
      )}
    </motion.div>
  );
}

function SummaryStat({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: number;
  suffix?: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>
        <CountUp value={value} suffix={suffix} />
      </p>
    </div>
  );
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  completed: { label: "✅ Completed", cls: "bg-emerald-400/15 text-emerald-200" },
  skipped: { label: "⏭ Skipped", cls: "bg-white/10 text-muted-foreground" },
  missed: { label: "❌ Missed", cls: "bg-rose-400/10 text-rose-300/70" },
  accepted: { label: "▶ Accepted", cls: "bg-sky-400/15 text-sky-200" },
  pending: { label: "⏳ Pending", cls: "bg-white/10 text-muted-foreground" },
};

const FALLBACK_STATUS_BADGE = {
  label: "Unknown",
  cls: "bg-white/10 text-muted-foreground",
};

function HistoryRow({ item }: { item: HistoryItem }) {
  const { unitSystem } = useUnits();
  const badge = STATUS_BADGE[item.status] ?? FALLBACK_STATUS_BADGE;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white/5 text-xl">
        {item.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="text-xs text-muted-foreground">{formatDate(item.date)}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>
          {badge.label}
        </span>
        {item.status === "completed" && (
          <span className="text-[11px] text-muted-foreground">
            +{item.xp_earned} XP · {formatCO2(item.savings_kg, unitSystem)}
          </span>
        )}
      </div>
    </li>
  );
}

// ---------- LIBRARY ----------
function LibraryTab() {
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const libraryQuery = useChallengeLibrary();
  const items = libraryQuery.data?.items ?? [];
  const loading = libraryQuery.isLoading;
  const hasError = libraryQuery.isError;
  const visibleSections = LIB_SECTIONS.filter((section) => filter === "all" || section.key === filter);

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-white/5" />
        ))}
      </motion.div>
    );
  }

  if (hasError) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center"
      >
        <p className="text-base font-semibold">Couldn't load the challenge library.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Try again once the backend is reachable.
        </p>
        <button
          type="button"
          onClick={() => {
            toast.dismiss("challenge-library-load-error");
            libraryQuery.refetch().catch(() => {
              toast.error("Couldn't load the library.", {
                id: "challenge-library-load-error",
              });
            });
          }}
          className="mt-5 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-emerald-950"
        >
          Retry
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-8"
    >
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[{ key: "all", label: "All" }, ...LIB_SECTIONS.map(({ key, label }) => ({ key, label }))].map(
          (option) => {
            const active = filter === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilter(option.key as LibraryFilter)}
                className={[
                  "flex-none rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
                  active
                    ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-200"
                    : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {option.label}
              </button>
            );
          },
        )}
      </div>

      {visibleSections.map((sec) => {
        const secItems = items.filter((it: LibItem) => it.category === sec.key);
        return (
          <div key={sec.key}>
            <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <span>{sec.emoji}</span> {sec.label}
            </h3>
            {secItems.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No challenges in this category yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {secItems.map((it: LibItem) => (
                  <LibCard key={it.id} item={it} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </motion.div>
  );
}

function LibCard({ item }: { item: LibItem }) {
  const { unitSystem } = useUnits();
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-white/20">
      <div className="flex items-start justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/5 text-2xl">
          {item.emoji}
        </span>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${diffColorClass(item.difficulty)}`}
        >
          {formatDifficulty(item.difficulty)}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold">{item.title}</p>
      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.description}</p>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1 text-emerald-300">
          <Leaf className="h-3 w-3" /> {formatCO2(item.savings_kg, unitSystem)}
        </span>
        <span className="flex items-center gap-1 text-amber-300">
          <Star className="h-3 w-3" /> {item.xp_reward} XP
        </span>
      </div>
    </div>
  );
}

// ---------- celebration ----------
function Celebration({
  challenge,
  xpEarned,
  levelUp,
  onClose,
}: {
  challenge: TodayChallenge;
  xpEarned: number;
  levelUp: boolean;
  onClose: () => void;
}) {
  const { unitSystem } = useUnits();
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  const share = async () => {
    const text = `I just completed "${challenge.title}" on CarbonSense and saved ${formatCO2(challenge.savings_kg, unitSystem)}!`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Couldn't copy.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-emerald-950/80 px-5 backdrop-blur-md"
    >
      <ConfettiBurst />
      <motion.div
        initial={{ scale: 0.9, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-3xl border border-emerald-200/20 bg-card/95 p-7 text-center shadow-2xl"
      >
        <motion.div
          animate={{ scale: [1, 1.15, 1], rotate: [0, 8, -8, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto text-6xl"
        >
          🎉
        </motion.div>
        <h2 className="mt-4 text-2xl font-bold">Challenge Complete!</h2>
        <p className="mt-3 text-4xl font-extrabold text-emerald-300">
          +<CountUp value={xpEarned} /> XP
        </p>
        {levelUp && (
          <p className="mt-2 text-sm font-semibold text-amber-200">
            ⭐ Level up!
          </p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          You saved {formatCO2(challenge.savings_kg, unitSystem)} — {challenge.equivalency}.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200">
          <Leaf className="h-4 w-4" /> Saved {formatCO2(challenge.savings_kg, unitSystem)}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={share}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 py-3 text-sm font-medium hover:bg-white/10"
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
          <Link
            to="/home"
            className="flex-1 rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 py-3 text-sm font-semibold text-emerald-950"
          >
            Back to Home
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------- skip bottom sheet ----------
const SKIP_REASONS = ["Too hard", "Not relevant", "Already did it", "No time today"];

function SkipSheet({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="modal-sheet max-w-md border border-white/10 bg-card p-6 shadow-2xl"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15 sm:hidden" />
        <h3 className="text-lg font-semibold">Why are you skipping?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          We'll use this to pick something better next time.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {SKIP_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onConfirm(r)}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm font-medium transition hover:border-emerald-300/50 hover:bg-emerald-400/10"
            >
              {r}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-full border border-white/10 bg-white/5 py-3 text-sm font-medium hover:bg-white/10"
        >
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
}

// ---------- bits ----------
function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
      <div className="absolute -top-40 -left-20 h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-[120px]" />
      <div className="absolute top-1/2 right-0 h-[26rem] w-[26rem] rounded-full bg-teal-400/10 blur-[120px]" />
    </div>
  );
}

function CountUp({ value, suffix }: { value: number; suffix?: string }) {
  const mv = useMotionValue(0);
  const integer = Number.isInteger(value);
  const rounded = useTransform(mv, (v) =>
    integer ? Math.round(v).toString() : v.toFixed(1),
  );
  useEffect(() => {
    const controls = animate(mv, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1] });
    return controls.stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span className="tabular-nums">
      <motion.span>{rounded}</motion.span>
      {suffix}
    </span>
  );
}

function ConfettiBurst() {
  const pieces = useRef(
    Array.from({ length: 90 }).map((_, i) => {
      const colors = ["#34d399", "#10b981", "#fde68a", "#fbbf24", "#5eead4"];
      return {
        id: i,
        x: (Math.random() - 0.5) * 800,
        y: -(160 + Math.random() * 420),
        rot: Math.random() * 720 - 360,
        color: colors[i % colors.length],
        delay: Math.random() * 0.25,
        shape: Math.random() > 0.5 ? "rect" : "circle",
      };
    }),
  ).current;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-1/2">
        {pieces.map((p) => (
          <motion.span
            key={p.id}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            animate={{ x: p.x, y: p.y, rotate: p.rot, opacity: 0 }}
            transition={{ duration: 2, ease: [0.22, 1, 0.36, 1], delay: p.delay }}
            style={{
              position: "absolute",
              width: p.shape === "rect" ? 9 : 7,
              height: p.shape === "rect" ? 14 : 7,
              borderRadius: p.shape === "rect" ? 2 : 9999,
              background: p.color,
              boxShadow: `0 0 8px ${p.color}55`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- helpers ----------
function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function groupByWeek(items: HistoryItem[]): { label: string; items: HistoryItem[] }[] {
  const groups: Record<string, HistoryItem[]> = {};
  const order: string[] = [];
  const now = new Date();
  for (const it of items) {
    const d = new Date(it.date + "T00:00:00Z");
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    const week = Math.max(0, Math.floor(diffDays / 7));
    const label =
      week === 0
        ? "This week"
        : week === 1
          ? "1 week ago"
          : `${week} weeks ago`;
    if (!groups[label]) {
      groups[label] = [];
      order.push(label);
    }
    groups[label].push(it);
  }
  return order.map((label) => ({ label, items: groups[label] }));
}
