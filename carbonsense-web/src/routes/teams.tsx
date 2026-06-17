import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Leaf,
  Link2,
  Loader2,
  Plus,
  Users,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useCreateTeam, useJoinTeam, useMyTeams } from "@/hooks/useApi";

export const Route = createFileRoute("/teams")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Teams — CarbonSense" },
      {
        name: "description",
        content: "Compete and collaborate with neighbors, coworkers, and friends.",
      },
    ],
  }),
  component: TeamsPage,
});

interface TeamCard {
  id: string;
  name: string;
  type: "Neighborhood" | "Employer" | "Friends" | "Custom";
  member_count: number;
  total_carbon_saved: number;
}

const TYPE_COLOR: Record<TeamCard["type"], string> = {
  Neighborhood: "bg-emerald-400/15 text-emerald-200 border-emerald-300/30",
  Employer: "bg-sky-400/15 text-sky-200 border-sky-300/30",
  Friends: "bg-amber-400/15 text-amber-200 border-amber-300/30",
  Custom: "bg-white/10 text-foreground/80 border-white/20",
};

function TeamsPage() {
  const [teams, setTeams] = useState<TeamCard[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const teamsQuery = useMyTeams();

  const refresh = async () => {
    await teamsQuery.refetch();
  };

  useEffect(() => {
    if (teamsQuery.data) setTeams(teamsQuery.data.teams);
  }, [teamsQuery.data]);

  useEffect(() => {
    if (teamsQuery.isError) {
      toast.error("Couldn't load your teams.");
      setTeams([]);
    }
  }, [teamsQuery.isError]);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <Ambient />
      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-28 pt-10 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between gap-3"
        >
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">My Teams</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Stronger together. Save more, faster.
            </p>
          </div>
        </motion.div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-3 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-105"
          >
            <Plus className="h-4 w-4" /> Create Team
          </button>
          <button
            onClick={() => setJoinOpen(true)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-white/[0.08]"
          >
            <Link2 className="h-4 w-4" /> Join Team
          </button>
        </div>

        <div className="mt-8">
          {teams === null ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-300" />
            </div>
          ) : teams.length === 0 ? (
            <EmptyState onCreate={() => setCreateOpen(true)} onJoin={() => setJoinOpen(true)} />
          ) : (
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {teams.map((t, i) => (
                <motion.li
                  key={t.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Link
                    to="/teams/$id"
                    params={{ id: t.id }}
                    className="group block rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-emerald-300/40 hover:bg-white/[0.07]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold">{t.name}</h3>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${TYPE_COLOR[t.type]}`}
                          >
                            {t.type}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" /> {t.member_count} members
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-emerald-200/90">
                            <Leaf className="h-3.5 w-3.5" /> {t.total_carbon_saved} kg saved together
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 translate-x-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-emerald-300" />
                    </div>
                    <div className="mt-3 text-xs font-medium text-emerald-300/90">
                      View Team →
                    </div>
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <AnimatePresence>
        {createOpen && (
          <CreateTeamModal
            onClose={() => setCreateOpen(false)}
            onCreated={() => {
              setCreateOpen(false);
              refresh();
            }}
          />
        )}
        {joinOpen && <JoinTeamModal onClose={() => setJoinOpen(false)} onJoined={refresh} />}
      </AnimatePresence>
    </main>
  );
}

function Ambient() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      <div className="absolute -top-32 left-1/2 h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="absolute right-[-160px] top-1/3 h-[360px] w-[360px] rounded-full bg-teal-300/10 blur-3xl" />
    </div>
  );
}

function EmptyState({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center"
    >
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/30 to-teal-300/20 text-4xl">
        🤝
      </div>
      <h2 className="mt-5 text-lg font-semibold">No teams yet</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        Join or create a team to start competing together!
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-2.5 text-sm font-semibold text-emerald-950"
        >
          <Plus className="h-4 w-4" /> Create Team
        </button>
        <button
          onClick={onJoin}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold"
        >
          <Link2 className="h-4 w-4" /> Join Team
        </button>
      </div>
    </motion.div>
  );
}

// ----------------- Modals -----------------

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="modal-sheet relative max-w-md border border-white/10 bg-[oklch(0.22_0.035_180)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </motion.div>
    </motion.div>
  );
}

function CreateTeamModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"Neighborhood" | "Employer" | "Friends" | "Custom">(
    "Neighborhood",
  );
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; invite_code: string; id: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const createTeam = useCreateTeam();

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const data = (await createTeam.mutateAsync({
        name: name.trim(),
        type,
        description: description.trim() || undefined,
      })) as { id: string; name: string; invite_code: string };
      setCreated(data);
      toast.success("Team created! Share the invite code with your group 🎉");
    } catch {
      toast.error("Couldn't create team. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ModalShell
      onClose={() => {
        if (created) onCreated();
        else onClose();
      }}
    >
      {created ? (
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/20 text-3xl">
            🎉
          </div>
          <h3 className="mt-4 text-lg font-semibold">"{created.name}" is live</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Share this code with your group to invite them:
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3">
            <span className="font-mono text-xl font-bold tracking-[0.25em] text-emerald-200">
              {created.invite_code}
            </span>
            <button
              onClick={copy}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition hover:bg-white/15"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <button
            onClick={onCreated}
            className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-3 text-sm font-semibold text-emerald-950"
          >
            Done
          </button>
        </div>
      ) : (
        <div>
          <h3 className="text-lg font-semibold">Create a team</h3>
          <p className="mt-1 text-sm text-muted-foreground">Rally a group around a shared goal.</p>

          <div className="mt-5 space-y-4">
            <Field label="Team Name">
              <input
                autoFocus
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Maple Street Climate Club"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm outline-none focus:border-emerald-300/50"
              />
            </Field>
            <Field label="Type">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm outline-none focus:border-emerald-300/50"
              >
                <option value="Neighborhood">Neighborhood</option>
                <option value="Employer">Employer</option>
                <option value="Friends">Friends</option>
                <option value="Custom">Custom</option>
              </select>
            </Field>
            <Field label={`Description (optional · ${description.length}/200)`}>
              <textarea
                value={description}
                maxLength={200}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What's this team about?"
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm outline-none focus:border-emerald-300/50"
              />
            </Field>
          </div>

          <button
            onClick={submit}
            disabled={busy || !name.trim()}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-3 text-sm font-semibold text-emerald-950 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create Team
          </button>
        </div>
      )}
    </ModalShell>
  );
}

function JoinTeamModal({ onClose, onJoined }: { onClose: () => void; onJoined: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const joinTeam = useJoinTeam();

  const submit = async () => {
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    setError(null);
    try {
      const data = (await joinTeam.mutateAsync(c)) as { id: string; name: string };
      toast.success(`Welcome to ${data.name}! 🤝`);
      onJoined();
      onClose();
      navigate({ to: "/teams/$id", params: { id: data.id } });
    } catch {
      setError("Invalid invite code. Check with your team admin.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-lg font-semibold">Join a team</h3>
      <p className="mt-1 text-sm text-muted-foreground">Got an invite code? Drop it below.</p>
      <div className="mt-5">
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="INVITE CODE"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center font-mono text-lg tracking-[0.25em] outline-none focus:border-emerald-300/50"
        />
        {error && <p className="mt-2 text-center text-sm text-rose-300">{error}</p>}
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Try <span className="font-mono">GREEN42</span> or <span className="font-mono">ACME88</span>
        </p>
      </div>
      <button
        onClick={submit}
        disabled={busy || !code.trim()}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-3 text-sm font-semibold text-emerald-950 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Join Team
      </button>
    </ModalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
