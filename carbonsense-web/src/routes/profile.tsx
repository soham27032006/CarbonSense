/**
 * TanStack route module for CarbonSense web screens. Defines route metadata and page-level UI composition.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Camera,
  Check,
  ChevronRight,
  CreditCard,
  Database,
  Download,
  FileText,
  Flame,
  Globe,
  Info,
  Leaf,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Ruler,
  Shield,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Users,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useUnits } from "@/contexts/UnitsContext";
import { StickyHeader } from "@/components/StickyHeader";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { getLevelProgressFraction } from "@/lib/levels";
import { formatCO2, pluralizeNoun } from "@/utils/units";

export const Route = createFileRoute("/profile")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Profile — CarbonSense" },
      { name: "description", content: "Your account, banks, teams, and app preferences." },
    ],
  }),
  component: ProfilePage,
});

// ----- types (mirrors server store) -----
type Units = "metric" | "imperial";

interface BankAccount {
  id: string;
  institution: string;
  logo_emoji: string;
  status: "active" | "error";
  last_synced_at: string;
  mask: string;
}
interface TeamLite {
  id: string;
  name: string;
  member_count: number;
  role: string;
}
interface NotificationPrefs {
  daily_challenge: { enabled: boolean; time: string };
  streak_at_risk: boolean;
  weekly_summary: boolean;
  achievement_earned: boolean;
}
interface AppSettings {
  units: Units;
  country: string;
}
interface Profile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  level: number;
  level_name: string;
  xp: number;
  xp_to_next: number;
  streak: number;
  max_streak: number;
  carbon_age: number;
  real_age: number;
  challenges_completed: number;
  carbon_saved_kg: number;
  member_since: string;
  bank_accounts: BankAccount[];
  teams: TeamLite[];
  notifications: NotificationPrefs;
  settings: AppSettings;
}

const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "NL", label: "Netherlands" },
  { value: "SE", label: "Sweden" },
  { value: "ES", label: "Spain" },
  { value: "IT", label: "Italy" },
  { value: "JP", label: "Japan" },
  { value: "BR", label: "Brazil" },
  { value: "IN", label: "India" },
];

function levelColor(level: number) {
  if (level >= 8) return "#f472b6";
  if (level >= 5) return "#34d399";
  if (level >= 3) return "#fbbf24";
  return "#60a5fa";
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function monthYear(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// ============================================================
function ProfilePage() {
  const [resetKey, setResetKey] = useState(0);

  return (
    <ProfilePageErrorBoundary
      resetKey={resetKey}
      onRetry={() => setResetKey((key) => key + 1)}
    >
      <ProfilePageContent key={resetKey} />
    </ProfilePageErrorBoundary>
  );
}

function ProfilePageContent() {
  const navigate = useNavigate();
  const { unitSystem, setUnitSystem } = useUnits();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<BankAccount | null>(null);
  const [ageModal, setAgeModal] = useState(false);
  const [aboutModal, setAboutModal] = useState(false);
  const [sourcesModal, setSourcesModal] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const patchRequestId = useRef(0);
  const mountedRef = useRef(false);

  const load = async () => {
    if (!mountedRef.current) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data } = await api.get<Profile>("/profile");
      if (mountedRef.current) {
        setProfile(data);
        setUnitSystem(data.settings.units);
      }
    } catch (error) {
      const message = getApiErrorMessage(error, "Couldn't load your profile.");
      if (mountedRef.current) {
        setLoadError(message);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
      patchRequestId.current += 1;
    };
  }, []);

  // Auto-save patcher
  const patch = async (body: Partial<Profile>) => {
    if (!profile) return;
    const requestId = patchRequestId.current + 1;
    patchRequestId.current = requestId;
    const previous = profile;
    const serverPatch = toProfileUpdatePayload(body);

    setProfile((current) => (current ? mergeProfilePatch(current, body) : current));
    try {
      const { data } = await api.patch<Profile>("/profile", serverPatch);
      if (mountedRef.current && requestId === patchRequestId.current) {
        setProfile(data);
        setUnitSystem(data.settings.units);
        toast.success("Saved!", { duration: 1500, icon: "OK" });
      }
    } catch (error) {
      if (mountedRef.current && requestId === patchRequestId.current) {
        setProfile(previous);
        if (body.settings?.units) {
          setUnitSystem(previous.settings.units);
        }
        toast.error(getApiErrorMessage(error, "Couldn't save change."), { id: "profile-save-error" });
      }
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await api.delete(`/plaid/disconnect/${id}`);
      toast.success("Bank disconnected.");
      setDisconnectTarget(null);
      load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Couldn't disconnect bank."), {
        id: "profile-disconnect-error",
      });
    }
  };

  const handleLogout = async () => {
    useAuthStore.getState().reset();
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const handleDelete = async () => {
    try {
      await api.delete("/profile");
      await supabase.auth.signOut();
      toast.success("Account deleted. We're sorry to see you go 🌍");
      navigate({ to: "/login" });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Couldn't delete account."), {
        id: "profile-delete-error",
      });
      setDeleteOpen(false);
      throw error;
    }
  };

  const handleExportData = () => {
    if (!profile) {
      toast.error("Profile data is still loading.", { id: "profile-loading-error" });
      return;
    }

    const exportPayload = {
      exported_at: new Date().toISOString(),
      profile
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `carbonsense-profile-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Profile export downloaded.");
  };

  return (
    <main className="relative overflow-x-hidden bg-background text-foreground">
      <Ambient />
      <StickyHeader left={<ProfileHeaderLeft />} center={<ProfileHeaderCenter />} />

      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-32 pt-6 sm:px-8">
        {isLoading ? (
          <ProfileSkeleton />
        ) : loadError || !profile ? (
          <ProfileLoadError message={loadError} onRetry={load} />
        ) : (
          <>
            <ProfileHeader profile={profile} onEdit={() => setEditOpen(true)} />
            <StatsRow profile={profile} />
            <BanksSection
              banks={profile.bank_accounts}
              onDisconnect={(b) => setDisconnectTarget(b)}
            />
            <TeamsSection teams={profile.teams} />
            <NotificationsSection
              prefs={profile.notifications}
              onChange={(notifications) => patch({ notifications } as Partial<Profile>)}
            />
            <AppSettingsSection
              settings={profile.settings}
              unitSystem={unitSystem}
              onChange={(settings) => patch({ settings } as Partial<Profile>)}
            />
            <AboutSection
              onAge={() => setAgeModal(true)}
              onAbout={() => setAboutModal(true)}
              onSources={() => setSourcesModal(true)}
            />
            <AccountActions
              onExport={handleExportData}
              onLogout={handleLogout}
              onDelete={() => setDeleteOpen(true)}
            />
          </>
        )}
      </div>

      <AnimatePresence>
        {editOpen && profile && (
          <EditProfileModal
            profile={profile}
            onClose={() => setEditOpen(false)}
            onSaved={(p) => {
              setProfile(p);
              setEditOpen(false);
              toast.success("Profile updated!");
            }}
          />
        )}
        {disconnectTarget && (
          <ConfirmModal
            icon={<AlertTriangle className="h-7 w-7 text-amber-300" />}
            title={`Disconnect ${disconnectTarget.institution}?`}
            body="We'll stop importing transactions and your carbon tracking may pause until you reconnect."
            cta="Disconnect"
            ctaTone="danger"
            onClose={() => setDisconnectTarget(null)}
            onConfirm={() => handleDisconnect(disconnectTarget.id)}
          />
        )}
        {ageModal && <CarbonAgeModal onClose={() => setAgeModal(false)} />}
        {aboutModal && <AboutModal onClose={() => setAboutModal(false)} />}
        {sourcesModal && <SourcesModal onClose={() => setSourcesModal(false)} />}
        {deleteOpen && (
          <DeleteAccountModal
            onClose={() => setDeleteOpen(false)}
            onConfirm={handleDelete}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: any } }).response;
    const data = response?.data;
    return data?.error?.message ?? data?.message ?? fallback;
  }

  return error instanceof Error ? error.message : fallback;
}

class ProfilePageErrorBoundary extends Component<
  {
    children: ReactNode;
    onRetry: () => void;
    resetKey: number;
  },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Profile page crashed", { error, info });
  }

  componentDidUpdate(prevProps: { resetKey: number }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  retry = () => {
    this.setState({ error: null });
    this.props.onRetry();
  };

  render() {
    if (this.state.error) {
      return (
        <main className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
          <Ambient />
          <StickyHeader left={<ProfileHeaderLeft />} center={<ProfileHeaderCenter />} />
          <div className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-32 pt-6 sm:px-8">
            <ProfileLoadError
              message="Something went wrong while rendering your profile."
              onRetry={this.retry}
            />
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4 py-2">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="mx-auto h-[100px] w-[100px] animate-pulse rounded-full bg-white/10" />
        <div className="mx-auto mt-5 h-6 w-44 animate-pulse rounded-full bg-white/10" />
        <div className="mx-auto mt-3 h-5 w-36 animate-pulse rounded-full bg-white/10" />
        <div className="mx-auto mt-6 h-24 w-32 animate-pulse rounded-2xl bg-white/10" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-14 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
          />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
        />
      ))}
    </div>
  );
}

function toProfileUpdatePayload(body: Partial<Profile>) {
  const payload: Record<string, unknown> = {};

  if (body.name !== undefined) payload.name = body.name;
  if (body.avatar_url !== undefined) payload.avatar_url = body.avatar_url;
  if (body.notifications !== undefined) {
    payload.notification_preferences = body.notifications;
  }
  if (body.settings !== undefined) {
    payload.settings = body.settings;
  }

  return payload;
}

function mergeProfilePatch(profile: Profile, body: Partial<Profile>): Profile {
  return {
    ...profile,
    ...body,
    notifications: {
      ...profile.notifications,
      ...(body.notifications ?? {}),
    },
    settings: {
      ...profile.settings,
      ...(body.settings ?? {}),
    },
  };
}

function ProfileLoadError({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-rose-400/10">
        <AlertTriangle className="h-7 w-7 text-rose-300" />
      </div>
      <h2 className="text-xl font-semibold text-foreground">
        Couldn't load your profile
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {message ?? "Please check your connection and try again."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition hover:scale-[1.02]"
      >
        Try again
      </button>
    </div>
  );
}

// ----- ambient + header -----
function Ambient() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      <div className="absolute -top-32 left-1/2 h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="absolute right-[-160px] top-1/3 h-[360px] w-[360px] rounded-full bg-teal-300/10 blur-3xl" />
    </div>
  );
}

const ProfileHeaderLeft = () => (
  <Link to="/home" className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
    <ArrowLeft className="h-4 w-4" /> Home
  </Link>
);

const ProfileHeaderCenter = () => (
  <span className="text-sm font-bold tracking-tight">Profile</span>
);

// ----- SECTION 1: Profile header -----
function ProfileHeader({ profile, onEdit }: { profile: Profile; onEdit: () => void }) {
  const color = levelColor(profile.level);
  const initial = (profile.name || profile.email).trim().charAt(0).toUpperCase();
  const ageDiff = profile.carbon_age - profile.real_age;
  const ageTone =
    ageDiff <= 0
      ? { label: `${Math.abs(ageDiff)} yrs younger`, color: "#34d399" }
      : ageDiff <= 5
      ? { label: `+${ageDiff} yrs`, color: "#fbbf24" }
      : { label: `+${ageDiff} yrs`, color: "#f87171" };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 text-center"
    >
      <div className="relative mx-auto h-[100px] w-[100px]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 46}
            strokeDashoffset={
              2 * Math.PI * 46 * (1 - getLevelProgressFraction(profile.level, profile.xp))
            }
            style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
          />
        </svg>
        <div className="absolute inset-[6px] grid place-items-center overflow-hidden rounded-full bg-white/5">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-3xl font-semibold">{initial}</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="group mx-auto mt-4 inline-flex items-center gap-1.5 text-xl font-bold transition hover:text-emerald-300"
      >
        {profile.name || "Add your name"}
        <Pencil className="h-3.5 w-3.5 opacity-50 transition group-hover:opacity-100" />
      </button>

      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium">
        <Sparkles className="h-3 w-3" style={{ color }} />
        <span style={{ color }}>Level {profile.level}</span>
        <span className="text-muted-foreground">· {profile.level_name}</span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Member since {monthYear(profile.member_since)}
      </p>

      <div className="mt-5 inline-flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-3">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Carbon Age
        </span>
        <span className="mt-0.5 text-4xl font-bold tabular-nums" style={{ color: ageTone.color }}>
          {profile.carbon_age}
        </span>
        <span className="mt-0.5 text-xs text-muted-foreground">
          Real age: {profile.real_age} · <span style={{ color: ageTone.color }}>{ageTone.label}</span>
        </span>
      </div>
    </motion.section>
  );
}

// ----- SECTION 2: Stats row -----
function StatsRow({ profile }: { profile: Profile }) {
  const { unitSystem } = useUnits();
  const items = [
    { icon: <Flame className="h-4 w-4 text-orange-300" />, label: `${profile.streak}-day streak` },
    { icon: <Star className="h-4 w-4 text-amber-300" />, label: `${profile.xp.toLocaleString()} XP` },
    {
      icon: <Check className="h-4 w-4 text-emerald-300" />,
      label: pluralizeNoun(profile.challenges_completed, "challenge")
    },
    { icon: <Leaf className="h-4 w-4 text-teal-300" />, label: `${formatCO2(profile.carbon_saved_kg, unitSystem)} saved` },
  ];
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((s, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5"
        >
          {s.icon}
          <span className="text-xs font-medium">{s.label}</span>
        </motion.div>
      ))}
    </div>
  );
}

// ----- SECTION 3: Connected accounts -----
function BanksSection({
  banks,
  onDisconnect,
}: {
  banks: BankAccount[];
  onDisconnect: (b: BankAccount) => void;
}) {
  return (
    <Section title="Bank Accounts" icon={<CreditCard className="h-4 w-4" />}>
      {banks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Connect your bank for automatic carbon tracking.
          </p>
          <Link
            to="/connect-bank"
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-2.5 text-xs font-semibold text-emerald-950"
          >
            <Plus className="h-3.5 w-3.5" /> Connect Bank Account
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {banks.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-xl">
                {b.logo_emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{b.institution}</span>
                  <span className="text-[11px] text-muted-foreground">{b.mask}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  {b.status === "active" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-300">
                      <Check className="h-3 w-3" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-300">
                      <AlertTriangle className="h-3 w-3" /> Error
                    </span>
                  )}
                  <span>· Synced {timeAgo(b.last_synced_at)}</span>
                </div>
              </div>
              <button
                onClick={() => onDisconnect(b)}
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:border-rose-300/40 hover:text-rose-300"
              >
                Disconnect
              </button>
            </li>
          ))}
          <Link
            to="/connect-bank"
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 px-4 py-3 text-xs font-semibold text-muted-foreground transition hover:border-emerald-300/40 hover:text-emerald-300"
          >
            <Plus className="h-3.5 w-3.5" /> Connect Bank Account
          </Link>
        </ul>
      )}
    </Section>
  );
}

// ----- SECTION 4: Teams -----
function TeamsSection({ teams }: { teams: TeamLite[] }) {
  return (
    <Section
      title="My Teams"
      icon={<Users className="h-4 w-4" />}
      action={
        <Link to="/teams" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
          Manage Teams <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      {teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">You're not on any teams yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {teams.map((t) => (
            <Link
              key={t.id}
              to="/teams/$id"
              params={{ id: t.id }}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-emerald-300/40"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{t.name}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {t.member_count} members · {t.role}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ----- SECTION 5: Notifications -----
function NotificationsSection({
  prefs,
  onChange,
}: {
  prefs: NotificationPrefs;
  onChange: (next: NotificationPrefs) => void;
}) {
  const set = <K extends keyof NotificationPrefs>(k: K, v: NotificationPrefs[K]) =>
    onChange({ ...prefs, [k]: v });

  return (
    <Section title="Notifications" icon={<Bell className="h-4 w-4" />}>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] divide-y divide-white/5">
        <ToggleRow
          emoji="📱"
          label="Daily challenge reminder"
          checked={prefs.daily_challenge.enabled}
          onChange={(v) => set("daily_challenge", { ...prefs.daily_challenge, enabled: v })}
          right={
            prefs.daily_challenge.enabled ? (
              <input
                aria-label="Daily challenge reminder time"
                type="time"
                value={prefs.daily_challenge.time}
                onChange={(e) =>
                  set("daily_challenge", { ...prefs.daily_challenge, time: e.target.value })
                }
                className="w-full min-w-[7rem] rounded-lg border border-white/10 bg-[#1a2332] px-2 py-1.5 text-xs text-foreground outline-none focus:border-emerald-300/50 sm:w-auto"
              />
            ) : null
          }
        />
        <ToggleRow
          emoji="🔥"
          label="Streak at risk"
          checked={prefs.streak_at_risk}
          onChange={(v) => set("streak_at_risk", v)}
        />
        <ToggleRow
          emoji="📊"
          label="Weekly summary"
          checked={prefs.weekly_summary}
          onChange={(v) => set("weekly_summary", v)}
        />
        <ToggleRow
          emoji="🏆"
          label="Achievement earned"
          checked={prefs.achievement_earned}
          onChange={(v) => set("achievement_earned", v)}
        />
      </div>
    </Section>
  );
}

function ToggleRow({
  emoji,
  label,
  checked,
  onChange,
  right,
}: {
  emoji: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/5 text-base">
        {emoji}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{label}</span>
      {right ? <div className="order-last w-full sm:order-none sm:w-auto">{right}</div> : null}
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full p-1 transition focus:outline-none focus:ring-2 focus:ring-emerald-300/60 ${
          checked ? "bg-emerald-400" : "bg-white/10"
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

// ----- SECTION 6: App settings -----
function AppSettingsSection({
  settings,
  unitSystem,
  onChange,
}: {
  settings: AppSettings;
  unitSystem: Units;
  onChange: (next: AppSettings) => void;
}) {
  return (
    <Section title="App Settings" icon={<Sun className="h-4 w-4" />}>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] divide-y divide-white/5">
        <SegmentRow
          icon={<Ruler className="h-4 w-4 text-sky-200" />}
          label="Units"
          description={
            unitSystem === "metric"
              ? "Carbon values display in kg."
              : "Carbon values display in lb."
          }
          value={unitSystem}
          options={[
            { value: "metric", label: "Metric" },
            { value: "imperial", label: "Imperial" },
          ]}
          onChange={(v) => onChange({ ...settings, units: v as Units })}
        />
        <div className="grid gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
          <Globe className="mt-1 h-4 w-4 text-emerald-200" />
          <div className="min-w-0">
            <span className="block text-sm font-medium">Country</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Used for regional carbon benchmarks.
            </span>
          </div>
          <select
            value={settings.country}
            onChange={(e) => onChange({ ...settings, country: e.target.value })}
            aria-label="Country"
            className="w-full rounded-lg border border-white/10 bg-[#1a2332] px-3 py-2 text-sm text-foreground outline-none focus:border-emerald-300/50 sm:col-start-2"
          >
            {COUNTRIES.map((c) => (
              <option key={c.value} value={c.value} className="bg-[#1a2332] text-foreground">
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Section>
  );
}

function SegmentRow({
  icon,
  label,
  description,
  value,
  options,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 rounded-lg border border-white/10 bg-white/5 p-0.5" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-3 py-2 text-xs font-medium transition ${
              value === o.value
                ? "bg-emerald-400/90 text-emerald-950"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ----- SECTION 7: About & Legal -----
function AboutSection({
  onAge,
  onAbout,
  onSources,
}: {
  onAge: () => void;
  onAbout: () => void;
  onSources: () => void;
}) {
  const items = [
    { icon: <Info className="h-4 w-4" />, label: "About CarbonSense", onClick: onAbout },
    {
      icon: <Shield className="h-4 w-4" />,
      label: "Privacy Policy",
      onClick: () => toast("Coming soon", { icon: "Lock" })
    },
    {
      icon: <FileText className="h-4 w-4" />,
      label: "Terms of Service",
      onClick: () => toast("Coming soon", { icon: "Doc" })
    },
    { icon: <Leaf className="h-4 w-4" />, label: "How Carbon Age is calculated", onClick: onAge },
    { icon: <Database className="h-4 w-4" />, label: "Data Sources", onClick: onSources },
  ];
  return (
    <Section title="About & Legal" icon={<Info className="h-4 w-4" />}>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] divide-y divide-white/5">
        {items.map((it, i) => (
          <button
            key={i}
            onClick={it.onClick}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium transition hover:bg-white/[0.03]"
          >
            <span className="text-muted-foreground">{it.icon}</span>
            <span className="flex-1">{it.label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </Section>
  );
}

// ----- SECTION 8: Account actions -----
function AccountActions({
  onExport,
  onLogout,
  onDelete,
}: {
  onExport: () => void;
  onLogout: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-10 flex flex-col gap-3">
      <button
        onClick={onExport}
        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-semibold transition hover:bg-white/[0.08]"
      >
        <Download className="h-4 w-4" /> Export My Data
      </button>
      <button
        onClick={onLogout}
        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-300/30 bg-rose-400/5 px-4 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/10"
      >
        <LogOut className="h-4 w-4" /> Log Out
      </button>
      <button
        onClick={onDelete}
        className="mt-2 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-rose-300/80 transition hover:text-rose-300"
      >
        <Trash2 className="h-3.5 w-3.5" /> Delete Account
      </button>
    </div>
  );
}

// ----- generic Section wrapper -----
function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {icon} {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ============================================================
// MODALS
// ============================================================
function ModalShell({
  onClose,
  children,
  size = "md",
}: {
  onClose: () => void;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")?.focus();
    return () => previous?.focus();
  }, []);

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") onClose();
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? []).filter((el) => !el.hasAttribute("disabled"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Profile dialog"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className={`relative w-full rounded-t-3xl border border-white/10 bg-[oklch(0.22_0.035_180)] p-6 sm:rounded-3xl ${size === "lg" ? "max-w-lg" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapFocus}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition hover:bg-white/10"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        {children}
      </motion.div>
    </motion.div>
  );
}

function EditProfileModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: (p: Profile) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.patch<Profile>("/profile", {
        name: name.trim(),
        avatar_url: avatarUrl.trim() || null,
      });
      onSaved(data);
    } catch {
      toast.error("Couldn't update profile.", { id: "profile-update-error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-lg font-semibold">Edit profile</h3>
      <p className="mt-1 text-sm text-muted-foreground">Update how you appear in CarbonSense.</p>

      <div className="mt-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-white/5">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Camera className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <label htmlFor="profile-avatar-url" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Avatar URL
            </label>
            <input
              id="profile-avatar-url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm outline-none focus:border-emerald-300/50"
            />
          </div>
        </div>

        <label className="block">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Name</div>
          <input
            autoFocus
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm outline-none focus:border-emerald-300/50"
          />
        </label>
      </div>

      <button
        onClick={save}
        disabled={busy || !name.trim()}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-3 text-sm font-semibold text-emerald-950 disabled:opacity-50"
      >
        {busy ? <Loader2 role="status" aria-label="Saving profile" className="h-4 w-4 animate-spin" /> : null} Save
      </button>
    </ModalShell>
  );
}

function ConfirmModal({
  icon,
  title,
  body,
  cta,
  ctaTone = "default",
  onClose,
  onConfirm,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  ctaTone?: "default" | "danger";
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell onClose={onClose}>
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/5">{icon}</div>
        <h3 className="mt-4 text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold ${
              ctaTone === "danger"
                ? "bg-rose-400/90 text-rose-950 hover:bg-rose-400"
                : "bg-gradient-to-r from-emerald-400 to-teal-300 text-emerald-950"
            }`}
          >
            {cta}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function CarbonAgeModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell onClose={onClose} size="lg">
      <h3 className="text-lg font-bold">How Carbon Age is calculated</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Your <span className="font-medium text-foreground">Carbon Age</span> translates your yearly
        CO₂ footprint into an intuitive number. We sum emissions across categories, then map your
        annual total onto the lifestyle of an average person at that emissions level.
      </p>
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 font-mono text-xs leading-relaxed text-muted-foreground">
        carbon_age = base_age + (annual_kg − global_avg) / sensitivity
        <br />
        sensitivity ≈ 150 kg / year
      </div>
      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
        <li>🌍 Lower than your real age = you live lighter than most peers.</li>
        <li>🎯 The target age is Paris-aligned (~2,300 kg / yr).</li>
        <li>📉 Every challenge nudges this number down.</li>
      </ul>
      <button
        onClick={onClose}
        className="mt-6 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-3 text-sm font-semibold text-emerald-950"
      >
        Got it
      </button>
    </ModalShell>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell onClose={onClose}>
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-400/20 text-3xl">
          🌍
        </div>
        <h3 className="mt-4 text-lg font-semibold">CarbonSense</h3>
        <p className="mt-1 text-xs text-muted-foreground">Version 1.0.0-beta</p>
        <p className="mt-4 text-sm text-muted-foreground">
          Made with 💚 by the CarbonSense team. We believe small daily actions add up to a
          climate-positive life.
        </p>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Credits</p>
          <p className="mt-1">
            Built by the CarbonSense team for the Hack2Skill Prompt Wars Hackathon 2026.
          </p>
          <p>Powered by Supabase, Google Gemini, and Plaid.</p>
        </div>
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-3 text-sm font-semibold text-emerald-950"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
}

function SourcesModal({ onClose }: { onClose: () => void }) {
  const sources = [
    { name: "US EPA", desc: "Emission factors for energy, transport, and waste." },
    { name: "UK DEFRA", desc: "Greenhouse gas conversion factors (annual)." },
    { name: "Climatiq API", desc: "Real-time emission factor lookups by category." },
    { name: "Our World in Data", desc: "National and global per-capita benchmarks." },
  ];
  return (
    <ModalShell onClose={onClose} size="lg">
      <h3 className="text-lg font-bold">Emission factor sources</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        We combine peer-reviewed datasets to keep your footprint accurate.
      </p>
      <ul className="mt-4 space-y-3">
        {sources.map((s) => (
          <li key={s.name} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-sm font-semibold">{s.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
          </li>
        ))}
      </ul>
      <button
        onClick={onClose}
        className="mt-6 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-3 text-sm font-semibold text-emerald-950"
      >
        Close
      </button>
    </ModalShell>
  );
}

function DeleteAccountModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const armed = text.trim() === "DELETE";

  const go = async () => {
    if (!armed) return;
    setBusy(true);
    try {
      await onConfirm();
    } catch {
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose} size="lg">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-rose-400/15">
        <AlertTriangle className="h-7 w-7 text-rose-300" />
      </div>
      <h3 className="mt-4 text-center text-lg font-semibold">Delete your account?</h3>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Are you sure? This will permanently delete all your data including carbon history,
        challenges, team memberships, and conversations.
        <br />
        <span className="font-semibold text-rose-300">This action cannot be undone.</span>
      </p>
      <label className="mt-5 block">
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">
          Type <span className="font-mono font-semibold text-foreground">DELETE</span> to confirm
        </div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="DELETE"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-center font-mono text-sm tracking-[0.25em] outline-none focus:border-rose-300/50"
        />
      </label>
      <div className="mt-5 flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-semibold"
        >
          Cancel
        </button>
        <button
          onClick={go}
          disabled={!armed || busy}
          className="flex-1 rounded-xl bg-rose-500/90 px-4 py-3 text-sm font-semibold text-rose-50 transition hover:bg-rose-500 disabled:opacity-40"
        >
          {busy ? <Loader2 role="status" aria-label="Deleting account" className="mx-auto h-4 w-4 animate-spin" /> : "Delete forever"}
        </button>
      </div>
    </ModalShell>
  );
}
