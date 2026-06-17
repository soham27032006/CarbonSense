import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Flame,
  Leaf,
  Loader2,
  Settings,
  Share2,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";

export const Route = createFileRoute("/teams/$id")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Team — CarbonSense" }],
  }),
  component: TeamDetailPage,
});

interface TeamDetail {
  id: string;
  name: string;
  type: "Neighborhood" | "Employer" | "Friends" | "Custom";
  description?: string;
  invite_code: string;
  created_at: string;
  is_admin: boolean;
  total_carbon_saved: number;
  member_count: number;
  best_streak: number;
  activity: { id: string; text: string; ts: string }[];
}

interface LbEntry {
  rank: number;
  id: string;
  display_name: string;
  carbon_saved: number;
  challenges: number;
  streak: number;
  is_me: boolean;
}

type Period = "week" | "month" | "all";

const TYPE_COLOR: Record<TeamDetail["type"], string> = {
  Neighborhood: "bg-emerald-400/15 text-emerald-200 border-emerald-300/30",
  Employer: "bg-sky-400/15 text-sky-200 border-sky-300/30",
  Friends: "bg-amber-400/15 text-amber-200 border-amber-300/30",
  Custom: "bg-white/10 text-foreground/80 border-white/20",
};

function TeamDetailPage() {
  const { id } = Route.useParams();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [period, setPeriod] = useState<Period>("week");
  const [board, setBoard] = useState<LbEntry[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [loadingBoard, setLoadingBoard] = useState(true);

  useEffect(() => {
    (async () => {
      setLoadingTeam(true);
      try {
        const { data } = await api.get<TeamDetail>(`/teams/${id}`);
        setTeam(data);
      } catch {
        toast.error("Couldn't load this team.");
      } finally {
        setLoadingTeam(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    (async () => {
      setLoadingBoard(true);
      try {
        const { data } = await api.get<{ entries: LbEntry[] }>(
          `/teams/${id}/leaderboard`,
          { params: { period } },
        );
        setBoard(data.entries);
      } catch {
        // ignore
      } finally {
        setLoadingBoard(false);
      }
    })();
  }, [id, period]);

  if (loadingTeam) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-300" />
      </main>
    );
  }
  if (!team) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <div>
          <p className="text-muted-foreground">Team not found.</p>
          <Link to="/teams" className="mt-3 inline-block text-sm text-emerald-300">
            ← Back to teams
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <Ambient />
      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-28 pt-6 sm:px-8">
        <div className="flex items-center justify-between">
          <Link
            to="/teams"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Teams
          </Link>
          {team.is_admin && (
            <button
              onClick={() => toast("Team settings coming soon")}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-white/[0.08]"
            >
              <Settings className="h-3.5 w-3.5" /> Settings
            </button>
          )}
        </div>

        {/* SECTION 1 — Header */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4"
        >
          <h1 className="text-2xl font-bold sm:text-3xl">{team.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${TYPE_COLOR[team.type]}`}>
              {team.type}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> {team.member_count} members
            </span>
            <span>·</span>
            <span>Created {formatDate(team.created_at)}</span>
          </div>
          {team.description && (
            <p className="mt-3 text-sm text-foreground/80">{team.description}</p>
          )}
          <InviteCodeStrip code={team.invite_code} compact />
        </motion.section>

        {/* SECTION 2 — Stats */}
        <section className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard icon={<Leaf className="h-4 w-4" />} label="CO₂ Saved" value={`${team.total_carbon_saved} kg`} tone="emerald" />
          <StatCard icon={<Users className="h-4 w-4" />} label="Members" value={String(team.member_count)} tone="sky" />
          <StatCard icon={<Flame className="h-4 w-4" />} label="Best Streak" value={`${team.best_streak}d`} tone="amber" />
        </section>

        {/* SECTION 3 — Leaderboard */}
        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Leaderboard</h2>
          </div>
          <PeriodToggle value={period} onChange={setPeriod} />
          <Leaderboard entries={board} loading={loadingBoard} />
        </section>

        {/* SECTION 4 — Activity */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Team Activity</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {team.activity.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5"
              >
                <span className="text-sm">{a.text}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.ts)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* SECTION 5 — Invite */}
        <section className="mt-8">
          <div className="rounded-3xl border border-emerald-300/20 bg-gradient-to-br from-emerald-400/15 to-teal-300/5 p-5">
            <h2 className="text-lg font-semibold">Grow your team</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Invite more people to amplify your shared impact.
            </p>
            <InviteCodeStrip code={team.invite_code} teamName={team.name} />
          </div>
        </section>
      </div>
    </main>
  );
}

// ---------- helpers / subcomponents ----------

function Ambient() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      <div className="absolute -top-32 left-1/2 h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="absolute right-[-160px] top-1/3 h-[360px] w-[360px] rounded-full bg-teal-300/10 blur-3xl" />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "emerald" | "sky" | "amber";
}) {
  const toneColors: Record<string, string> = {
    emerald: "text-emerald-200",
    sky: "text-sky-200",
    amber: "text-amber-200",
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
      <div className={`flex items-center gap-1.5 text-xs ${toneColors[tone]}`}>
        {icon}
        <span className="text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1.5 text-xl font-bold sm:text-2xl">{value}</div>
    </div>
  );
}

function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const opts: { key: Period; label: string }[] = [
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "all", label: "All Time" },
  ];
  return (
    <div className="mt-3 flex rounded-2xl border border-white/10 bg-white/[0.04] p-1">
      {opts.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className="relative flex-1 rounded-xl px-3 py-2 text-xs font-medium transition sm:text-sm"
          >
            {active && (
              <motion.span
                layoutId="team-period-pill"
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-400/90 to-teal-300/90"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className={active ? "relative text-emerald-950" : "relative text-muted-foreground"}>
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Leaderboard({ entries, loading }: { entries: LbEntry[]; loading: boolean }) {
  const me = useMemo(() => entries.find((e) => e.is_me), [entries]);
  const meOutOfTop3 = me && me.rank > 3;

  if (loading) {
    return (
      <div className="mt-4 flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-300" />
      </div>
    );
  }

  return (
    <div className="mt-4">
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {entries.map((e) => (
            <motion.li
              key={e.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
            >
              <Row entry={e} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {meOutOfTop3 && me && (
        <div className="sticky bottom-4 mt-4">
          <div className="rounded-2xl border border-emerald-300/40 bg-emerald-400/10 p-1 shadow-lg shadow-emerald-500/10 backdrop-blur">
            <Row entry={me} highlighted />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ entry, highlighted }: { entry: LbEntry; highlighted?: boolean }) {
  const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : null;
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-3.5 py-3 transition ${
        highlighted
          ? "bg-transparent"
          : entry.is_me
            ? "border border-emerald-300/30 bg-emerald-400/10"
            : "border border-white/10 bg-white/[0.04]"
      }`}
    >
      <div className="flex w-9 shrink-0 items-center justify-center text-base font-bold text-muted-foreground">
        {medal ?? `#${entry.rank}`}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{entry.display_name}</span>
          {entry.is_me && (
            <span className="rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
              YOU
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="text-emerald-200/90">{entry.carbon_saved.toFixed(1)} kg</span>
          <span>· {entry.challenges} challenges</span>
          <span className="inline-flex items-center gap-0.5">
            · <Flame className="h-3 w-3 text-amber-300" /> {entry.streak}
          </span>
        </div>
      </div>
    </div>
  );
}

function InviteCodeStrip({
  code,
  teamName,
  compact,
}: {
  code: string;
  teamName?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Invite code copied");
    setTimeout(() => setCopied(false), 1500);
  };
  const share = async () => {
    const text = `Join my CarbonSense team "${teamName ?? ""}". Invite code: ${code}`;
    if (typeof navigator !== "undefined" && (navigator as Navigator).share) {
      try {
        await (navigator as Navigator).share!({ title: "Join my team", text });
        return;
      } catch {
        // fall through
      }
    }
    await navigator.clipboard.writeText(text);
    toast.success("Invite copied to clipboard");
  };

  if (compact) {
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">Invite code:</span>
        <span className="font-mono font-bold tracking-widest text-emerald-200">{code}</span>
        <button
          onClick={copy}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/5 transition hover:bg-white/15"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-emerald-300/80">Invite code</div>
          <div className="font-mono text-2xl font-bold tracking-[0.25em] text-emerald-200">
            {code}
          </div>
        </div>
        <button
          onClick={copy}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 transition hover:bg-white/15"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={copy}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold transition hover:bg-white/[0.08]"
        >
          <Copy className="h-4 w-4" /> Copy Invite Code
        </button>
        <button
          onClick={share}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-2.5 text-sm font-semibold text-emerald-950"
        >
          <Share2 className="h-4 w-4" /> Share
        </button>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
