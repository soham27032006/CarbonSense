/**
 * TanStack route module for CarbonSense web screens. Defines route metadata and page-level UI composition.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Flame,
  Loader2,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  useAcceptChallenge,
  useCompleteChallenge,
  useDashboard,
  useSkipChallenge,
  useTodayChallenge,
} from "@/hooks/useApi";
import { useUnits } from "@/contexts/UnitsContext";
import { useAuthStore } from "@/stores/authStore";
import { useCopilot } from "@/components/copilot/CopilotProvider";
import { StickyHeader } from "@/components/StickyHeader";
import { formatCO2, type UnitSystem } from "@/utils/units";
import { CATEGORY_META, getGreetingForHour } from "@/lib/homeDisplay";

export const Route = createFileRoute("/home")({
  ssr: false,
  head: () => ({ meta: [{ title: "Home — CarbonSense" }] }),
  component: HomePage,
});

// ---------- types ----------
type Category = "food" | "transport" | "home" | "shopping" | "travel" | "other";
type ChallengeStatus = "pending" | "accepted" | "completed" | null;

interface Dashboard {
  carbon_age: number;
  current_level: { level: number; name: string; xp: number; xp_to_next: number };
  streak: { current: number; max: number; freeze_available: number };
  today: { carbon_kg: number; challenge_status: ChallengeStatus };
  this_week: {
    total_carbon_kg: number;
    vs_last_week_percent: number;
    category_breakdown: Record<Category, number>;
    is_estimated?: boolean;
  };
  this_month: {
    total_carbon_kg: number;
    vs_last_month_percent: number;
    daily_average_kg: number;
    is_estimated?: boolean;
  };
  ai_insight: string;
}
interface Challenge {
  id: string;
  assignment?: {
    id: string;
    status: Exclude<ChallengeStatus, null>;
  };
  category: Category;
  emoji: string;
  title: string;
  description: string;
  savings_kg: number;
  xp_reward: number;
  difficulty: "Easy" | "Medium" | "Hard";
  participants_today: number;
}

function pluralUnit(count: number, singular: string, plural = `${singular}s`) {
  return Math.abs(count) === 1 ? singular : plural;
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: any } }).response;
    const data = response?.data;
    return data?.error?.message ?? data?.message ?? fallback;
  }

  return fallback;
}

function getLevelTarget(level: Dashboard["current_level"]) {
  if (level.xp_to_next <= 0) return level.xp > 0 ? level.xp : 1;
  return level.xp + level.xp_to_next;
}

// ---------- page ----------
function HomePage() {
  const user = useAuthStore((s) => s.user);
  const { unitSystem } = useUnits();
  const firstName = useMemo(() => {
    const n = user?.full_name?.trim() || user?.email?.split("@")[0] || "friend";
    return n.split(" ")[0].replace(/^./, (c) => c.toUpperCase());
  }, [user]);

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [status, setStatus] = useState<ChallengeStatus>("pending");
  const [busy, setBusy] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const dashboardQuery = useDashboard();
  const challengeQuery = useTodayChallenge();
  const acceptMutation = useAcceptChallenge();
  const completeMutation = useCompleteChallenge();
  const skipMutation = useSkipChallenge();

  const load = async () => {
    await Promise.all([dashboardQuery.refetch(), challengeQuery.refetch()]);
  };

  useEffect(() => {
    if (dashboardQuery.data) {
      const nextDashboard = dashboardQuery.data as Dashboard;
      setDashboard(nextDashboard);
      setStatus(nextDashboard.today.challenge_status ?? "pending");
    }
  }, [dashboardQuery.data]);

  useEffect(() => {
    if (challengeQuery.data) {
      setChallenge(challengeQuery.data as Challenge);
    }
  }, [challengeQuery.data]);

  useEffect(() => {
    if (dashboardQuery.isError || challengeQuery.isError) {
      toast.error("Couldn't load your dashboard.", { id: "home-load-error" });
    }
  }, [dashboardQuery.isError, challengeQuery.isError]);

  const loading = dashboardQuery.isLoading || challengeQuery.isLoading;

  const accept = async () => {
    if (!challenge) return;
    const assignmentId = challenge.assignment?.id;
    if (!assignmentId) {
      toast.error("Refresh to continue.", { id: "home-assignment-missing" });
      return;
    }
    setBusy(true);
    try {
      await acceptMutation.mutateAsync(assignmentId);
      setStatus("accepted");
      toast.success("Challenge accepted. Go get it.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Couldn't accept. Refresh and try again."), {
        id: "home-accept-error",
      });
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!challenge) return;
    const assignmentId = challenge.assignment?.id;
    if (!assignmentId) {
      toast.error("Refresh to continue.", { id: "home-assignment-missing" });
      return;
    }
    setBusy(true);
    try {
      const result = await completeMutation.mutateAsync(assignmentId);
      const xpEarned = Number(result?.xp_earned ?? challenge.xp_reward);
      setStatus("completed");
      setConfetti(true);
      toast.success(`Challenge complete! +${xpEarned} XP`);
      // Streak / level values are reconciled by `invalidateCore` inside
      // `useCompleteChallenge.onSuccess`, which refetches the dashboard
      // and streaks queries. The `useEffect` above re-syncs `dashboard`
      // state from the fresh response — no manual bump needed (and a
      // manual bump would briefly desync Home from the canonical source).
      setDashboard((d) =>
        d
          ? {
              ...d,
              current_level: {
                ...d.current_level,
                xp: d.current_level.xp + xpEarned,
              },
            }
          : d,
      );
      setTimeout(() => setConfetti(false), 2200);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Couldn't complete the challenge. Try again."), {
        id: "home-complete-error",
      });
    } finally {
      setBusy(false);
    }
  };

  const skip = async (reason: string) => {
    if (!challenge) return;
    const assignmentId = challenge.assignment?.id;
    if (!assignmentId) {
      setSkipOpen(false);
      toast.error("Refresh to continue.", { id: "home-assignment-missing" });
      return;
    }
    setSkipOpen(false);
    setBusy(true);
    try {
      await skipMutation.mutateAsync({
        id: assignmentId,
        reason: reason || "Skipped by user",
      });
      toast.success("Got it. Here's another challenge.");
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Couldn't skip. Refresh and try again."), {
        id: "home-skip-error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative overflow-x-hidden bg-background text-foreground">
      <Ambient />
      <StickyHeader avatarName={firstName} />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-28 sm:px-8"
      >
        {loading ? (
          <DashboardSkeleton />
        ) : !dashboard ? (
          <HomeLoadError onRetry={load} />
        ) : (
          <>
            <Greeting name={firstName} level={dashboard.current_level} />

            <ChallengeHero
              challenge={challenge}
              status={status}
              busy={busy}
              confetti={confetti}
              unitSystem={unitSystem}
              actionUnavailable={!challenge?.assignment?.id}
              onAccept={accept}
              onComplete={complete}
              onSkip={() => setSkipOpen(true)}
            />

            <QuickStats dashboard={dashboard} unitSystem={unitSystem} />

            <InsightCard text={dashboard.ai_insight} />

            <WeeklyBreakdown
              breakdown={dashboard.this_week.category_breakdown}
              total={dashboard.this_week.total_carbon_kg}
              estimated={Boolean(dashboard.this_week.is_estimated)}
              hasCompletedChallenge={status === "completed"}
              unitSystem={unitSystem}
            />
          </>
        )}
      </motion.div>

      <AnimatePresence>
        {skipOpen && <SkipModal onClose={() => setSkipOpen(false)} onConfirm={skip} />}
      </AnimatePresence>
    </main>
  );
}

// ---------- greeting ----------
function Greeting({
  name,
  level,
}: {
  name: string;
  level?: Dashboard["current_level"];
}) {
  const [greeting, emoji] = useMemo(() => getGreetingForHour(new Date().getHours()), []);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05, duration: 0.5 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-sky-500/15 p-5 sm:p-6"
    >
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" />
      <h1 className="relative text-2xl font-bold leading-tight sm:text-3xl">
        {greeting}, {name}! <span aria-hidden>{emoji}</span>
      </h1>
      {level && (
        <p className="relative mt-1.5 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-medium text-emerald-200">
            🌱 {level.name} · Level {level.level}
          </span>
        </p>
      )}
    </motion.section>
  );
}

// ---------- challenge hero ----------
function ChallengeHero({
  challenge,
  status,
  busy,
  confetti,
  unitSystem,
  actionUnavailable,
  onAccept,
  onComplete,
  onSkip,
}: {
  challenge: Challenge | null;
  status: ChallengeStatus;
  busy: boolean;
  confetti: boolean;
  unitSystem: UnitSystem;
  actionUnavailable: boolean;
  onAccept: () => void;
  onComplete: () => void;
  onSkip: () => void;
}) {
  if (!challenge) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center"
      >
        <p className="text-base text-muted-foreground">Your daily challenge is still syncing from the backend.</p>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.55 }}
      className="relative mt-5"
    >
      <motion.div
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
        className="relative overflow-hidden rounded-3xl border border-emerald-200/20 bg-gradient-to-br from-emerald-400/30 via-teal-400/20 to-sky-500/20 p-6 shadow-[0_30px_80px_-30px_rgba(16,185,129,0.6)] sm:p-8"
      >
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-300/30 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-teal-300/20 blur-3xl" />

        <div className="relative flex items-start justify-between">
          <span className="rounded-full bg-emerald-950/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-100">
            Today's Challenge
          </span>
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-3xl backdrop-blur">
            {challenge.emoji}
          </span>
        </div>

        <h2 className="relative mt-5 text-3xl font-bold leading-tight sm:text-4xl">
          {challenge.title}
        </h2>
        <p className="relative mt-2 max-w-md text-sm text-emerald-50/85 sm:text-base">
          {challenge.description}
        </p>

        <div className="relative mt-5 flex flex-wrap gap-2 text-xs">
          <Pill>Saves {formatCO2(challenge.savings_kg, unitSystem)}</Pill>
          <Pill>Earns {challenge.xp_reward} XP</Pill>
          <Pill>{challenge.difficulty}</Pill>
        </div>

        <p className="relative mt-4 flex items-center gap-2 text-xs text-emerald-50/80">
          <span className="flex -space-x-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-5 w-5 rounded-full border-2 border-emerald-900/30 bg-gradient-to-br from-emerald-200 to-teal-300"
              />
            ))}
          </span>
          <span>
            {challenge.participants_today === 0
              ? "Be the first to do this today"
              : `${challenge.participants_today} ${pluralUnit(challenge.participants_today, "other")} doing this today`}
          </span>
        </p>

        <div className="relative mt-6">
          <CTAButton
            status={status}
            busy={busy}
            actionUnavailable={actionUnavailable}
            xp={challenge.xp_reward}
            onAccept={onAccept}
            onComplete={onComplete}
          />
          {status !== "completed" && (
            <button
              type="button"
              onClick={onSkip}
              disabled={busy || actionUnavailable}
              className="mt-3 block w-full text-center text-xs text-emerald-50/70 underline-offset-4 hover:underline disabled:opacity-50"
            >
              {actionUnavailable ? "Refresh to continue" : busy ? "Working..." : "Skip → Try another"}
            </button>
          )}
        </div>

        <AnimatePresence>{confetti && <ConfettiBurst />}</AnimatePresence>
      </motion.div>
    </motion.section>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-emerald-950/30 px-2.5 py-1 font-medium text-emerald-50">
      {children}
    </span>
  );
}

function CTAButton({
  status,
  busy,
  actionUnavailable,
  xp,
  onAccept,
  onComplete,
}: {
  status: ChallengeStatus;
  busy: boolean;
  actionUnavailable: boolean;
  xp: number;
  onAccept: () => void;
  onComplete: () => void;
}) {
  if (status === "completed") {
    return (
      <div className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-300/90 px-6 py-4 text-base font-semibold text-emerald-950">
        <CheckCircle2 className="h-5 w-5" />
        Done! +{xp} XP <Star className="h-4 w-4 fill-current" />
      </div>
    );
  }
  if (status === "accepted") {
    return (
      <button
        type="button"
        disabled={busy || actionUnavailable}
        onClick={onComplete}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-300 to-orange-300 px-6 py-4 text-base font-semibold text-amber-950 shadow-[0_20px_50px_-15px_rgba(251,191,36,0.7)] transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
      >
        {actionUnavailable ? (
          "Refresh to continue"
        ) : busy ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" /> Completing...
          </>
        ) : (
          "Mark Complete"
        )}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={busy || actionUnavailable}
      onClick={onAccept}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-4 text-base font-semibold text-emerald-900 shadow-[0_20px_50px_-15px_rgba(255,255,255,0.4)] transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
    >
      {actionUnavailable ? (
        "Refresh to continue"
      ) : busy ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin" /> Accepting...
        </>
      ) : (
        "Accept Challenge"
      )}
    </button>
  );
}

// ---------- quick stats ----------
function QuickStats({ dashboard, unitSystem }: { dashboard: Dashboard; unitSystem: UnitSystem }) {
  const weekDelta = dashboard.this_week.vs_last_week_percent;
  const weekDown = weekDelta < 0;
  const levelTarget = getLevelTarget(dashboard.current_level);
  const levelProgress = Math.min(100, (dashboard.current_level.xp / levelTarget) * 100);
  return (
    <section className="card-grid mt-5">
      <StatCard
        to="/streak"
        accent="from-amber-300 to-orange-400"
        icon={<Flame className="h-4 w-4" />}
        label="Streak"
        value={
          <span className="text-2xl font-bold tabular-nums">
            {dashboard.streak.current} {pluralUnit(dashboard.streak.current, "day")}
          </span>
        }
        sub={`Best ${dashboard.streak.max} ${pluralUnit(dashboard.streak.max, "day")}`}
      />
      <StatCard
        to="/dashboard"
        accent="from-sky-300 to-blue-500"
        icon={<TrendingUp className="h-4 w-4" />}
        label="This week"
        value={
          <span className="text-2xl font-bold tabular-nums">
            {formatCO2(dashboard.this_week.total_carbon_kg, unitSystem).replace(" CO2", "")}
          </span>
        }
        sub={
          <span
            className={[
              "inline-flex items-center gap-1 text-xs font-medium",
              weekDelta < 0
                ? "text-emerald-300"
                : weekDelta > 0
                  ? "text-amber-300"
                  : "text-muted-foreground",
            ].join(" ")}
          >
            {weekDelta < 0 ? (
              <ArrowDownRight className="h-3 w-3" />
            ) : weekDelta > 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : null}
            {weekDelta === 0 ? "Same as last week" : `${Math.abs(weekDelta)}% vs last`}
          </span>
        }
      />
      <StatCard
        to="/achievements"
        accent="from-fuchsia-300 to-pink-500"
        icon={<Star className="h-4 w-4" />}
        label="XP"
        value={
          <span className="text-2xl font-bold tabular-nums">
            {dashboard.current_level.xp}
            <span className="text-sm font-medium text-muted-foreground">
              /{levelTarget}
            </span>
          </span>
        }
        sub={
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: `${levelProgress}%`,
              }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full bg-gradient-to-r from-fuchsia-300 to-pink-400"
            />
          </div>
        }
      />
    </section>
  );
}

function StatCard({
  to,
  accent,
  icon,
  label,
  value,
  sub,
}: {
  to: string;
  accent: string;
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-white/20 hover:bg-white/[0.07]"
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span
          className={`grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br text-white ${accent}`}
        >
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-2">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </Link>
  );
}

// ---------- ai insight ----------
function InsightCard({ text }: { text: string }) {
  const { setOpen } = useCopilot();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="group mt-5 block w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/15 via-fuchsia-500/10 to-sky-500/10 p-5 text-left transition hover:border-white/20"
    >
      <div className="flex items-start gap-3">
        <motion.span
          animate={{ scale: [1, 1.08, 1], rotate: [0, 6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-400"
        >
          <Sparkles className="h-4 w-4 text-white" />
        </motion.span>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wider text-violet-200/80">AI insight</p>
            <span className="text-[10px] text-muted-foreground">Powered by AI</span>
          </div>
          <p className="mt-1 text-sm leading-relaxed">{text}</p>
        </div>
      </div>
    </button>
  );
}

// ---------- weekly breakdown ----------
function WeeklyBreakdown({
  breakdown,
  total,
  estimated,
  hasCompletedChallenge,
  unitSystem,
}: {
  breakdown: Record<Category, number>;
  total: number;
  estimated: boolean;
  hasCompletedChallenge: boolean;
  unitSystem: UnitSystem;
}) {
  const entries = (Object.entries(breakdown) as [Category, number][]).sort(
    (a, b) => b[1] - a[1],
  );
  const max = Math.max(...entries.map(([, v]) => v), 0.1);
  const hasData = hasCompletedChallenge || entries.some(([, kg]) => kg > 0);

  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {estimated ? "Estimated weekly carbon" : "This week"}
            {estimated && (
              <span className="ml-2 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                From quiz
              </span>
            )}
          </p>
          <p className="mt-1 text-lg font-semibold">
            {formatCO2(total, unitSystem)}
          </p>
          {estimated && (
            <p className="mt-1 text-xs text-muted-foreground">
              Complete challenges or connect a bank for live tracking.
            </p>
          )}
        </div>
        <Link to="/dashboard" className="text-xs font-medium text-emerald-300 hover:underline">
          View full dashboard &gt;
        </Link>
      </div>

      {hasData ? (
        <ul className="mt-4 space-y-2.5">
          {entries.map(([cat, kg], i) => {
            const meta = CATEGORY_META[cat] ?? CATEGORY_META.other;
            const pct = (kg / max) * 100;
            return (
              <li key={cat} className="flex items-center gap-3 text-sm">
                <span className="w-24 flex-none text-muted-foreground">
                  <span className="mr-1">{meta.emoji}</span>
                  {meta.label}
                </span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/8">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: 0.2 + i * 0.05, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${meta.color} ${estimated ? "opacity-70" : ""}`}
                  />
                </div>
                <span className="w-14 flex-none text-right text-xs tabular-nums text-muted-foreground">
                  {formatCO2(kg, unitSystem).replace(" CO2", "")}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center text-sm text-muted-foreground">
          Complete your first challenge to start tracking carbon here.
        </div>
      )}
    </section>
  );
}

// ---------- skip modal ----------
const SKIP_REASONS = [
  "Not feeling it today",
  "Too hard for me",
  "Already did it",
  "Different category",
];

function SkipModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState(SKIP_REASONS[0]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm px-5"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 10, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        className="modal-sheet max-w-sm border border-white/10 bg-card p-6 shadow-2xl"
      >
        <h3 className="text-lg font-semibold">Skip today's challenge?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us why so we can tune your next pick.
        </p>
        <div className="mt-4 space-y-2">
          {SKIP_REASONS.map((r) => (
            <label
              key={r}
              className={[
                "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition",
                reason === r
                  ? "border-emerald-300/60 bg-emerald-400/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20",
              ].join(" ")}
            >
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="sr-only"
              />
              <span
                className={[
                  "h-4 w-4 flex-none rounded-full border",
                  reason === r ? "border-emerald-300 bg-emerald-300" : "border-white/30",
                ].join(" ")}
              />
              {r}
            </label>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-white/10 bg-white/5 py-3 text-sm font-medium hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            className="flex-1 rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 py-3 text-sm font-semibold text-emerald-950"
          >
            Skip & swap
          </button>
        </div>
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

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-28 animate-pulse rounded-3xl bg-white/5" />
      <div className="h-72 animate-pulse rounded-3xl bg-white/5" />
      <div className="card-grid">
        <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
      </div>
      <div className="h-20 animate-pulse rounded-2xl bg-white/5" />
      <div className="h-48 animate-pulse rounded-2xl bg-white/5" />
    </div>
  );
}

function HomeLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center">
      <p className="text-lg font-semibold">Couldn't load your live dashboard.</p>
      <p className="mt-2 text-sm text-muted-foreground">
        CarbonSense won't show fallback stats here. Retry once the backend is reachable.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-emerald-950"
      >
        Try again
      </button>
    </div>
  );
}

function CountUp({
  value,
  suffix,
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const mv = useMotionValue(0);
  const integer = Number.isInteger(value);
  const rounded = useTransform(mv, (v) => (integer ? Math.round(v).toString() : v.toFixed(1)));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1] });
    return controls.stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span className={className}>
      <motion.span className="tabular-nums">{rounded}</motion.span>
      {suffix}
    </span>
  );
}

// Lightweight DOM confetti burst — no extra deps.
function ConfettiBurst() {
  const pieces = useMemo(() => {
    const colors = ["#34d399", "#5eead4", "#fde68a", "#f0abfc", "#93c5fd"];
    return Array.from({ length: 60 }).map((_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 600,
      y: -(120 + Math.random() * 280),
      rot: Math.random() * 720 - 360,
      color: colors[i % colors.length],
      delay: Math.random() * 0.15,
      shape: Math.random() > 0.5 ? "rect" : "circle",
    }));
  }, []);
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-0"
    >
      <div className="absolute left-1/2 top-1/2">
        {pieces.map((p) => (
          <motion.span
            key={p.id}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            animate={{ x: p.x, y: p.y, rotate: p.rot, opacity: 0 }}
            transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: p.delay }}
            style={{
              position: "absolute",
              width: p.shape === "rect" ? 8 : 6,
              height: p.shape === "rect" ? 12 : 6,
              borderRadius: p.shape === "rect" ? 2 : 9999,
              background: p.color,
              boxShadow: `0 0 8px ${p.color}55`,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
