import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Crown,
  Loader2,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { api } from "@/lib/api";

export const Route = createFileRoute("/connect-bank")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connect Your Bank — CarbonSense" },
      {
        name: "description",
        content: "Securely link your bank account for automatic carbon tracking.",
      },
    ],
  }),
  component: ConnectBankPage,
});

const FREE_TIER_LIMIT = 3;

interface BankAccount {
  id: string;
  institution: string;
  logo_emoji: string;
  status: "active" | "error";
  last_synced_at: string;
  mask: string;
}

interface SyncResult {
  count: number;
  total_carbon_kg: number;
  top_transactions: {
    merchant: string;
    category: string;
    amount: number;
    carbon_kg: number;
    emoji: string;
  }[];
}

type Stage = "intro" | "linking" | "exchanging" | "syncing" | "done" | "error";

const MOCK_INSTITUTIONS = [
  { id: "ins_chase", name: "Chase", emoji: "🏦" },
  { id: "ins_boa", name: "Bank of America", emoji: "🏛️" },
  { id: "ins_wf", name: "Wells Fargo", emoji: "🐎" },
  { id: "ins_citi", name: "Citi", emoji: "🏙️" },
  { id: "ins_amex", name: "American Express", emoji: "💳" },
  { id: "ins_capital_one", name: "Capital One", emoji: "🅒" },
  { id: "ins_us_bank", name: "U.S. Bank", emoji: "🇺🇸" },
  { id: "ins_pnc", name: "PNC Bank", emoji: "🟧" },
];

function ConnectBankPage() {
  const navigate = useNavigate();
  const [banks, setBanks] = useState<BankAccount[] | null>(null);
  const [stage, setStage] = useState<Stage>("intro");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [institution, setInstitution] = useState<{ id: string; name: string; emoji?: string } | null>(null);
  const [sync, setSync] = useState<SyncResult | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [mockPickerOpen, setMockPickerOpen] = useState(false);

  const loadBanks = async () => {
    try {
      const { data } = await api.get<{ bank_accounts: BankAccount[] }>("/profile");
      setBanks(data.bank_accounts);
    } catch {
      setBanks([]);
    }
  };

  useEffect(() => {
    loadBanks();
  }, []);

  const atLimit = (banks?.length ?? 0) >= FREE_TIER_LIMIT;

  // ----- Plaid Link bootstrap -----
  // We always request a link token. If the server marks it as mock, we open
  // our own institution picker (no real Plaid creds available in dev).
  const startConnect = async () => {
    if (atLimit) {
      toast.error("Free tier limit reached. Upgrade to Pro for unlimited connections.");
      return;
    }
    setErrorMsg(null);
    setStage("linking");
    try {
      const { data } = await api.post<{ link_token: string; mock?: boolean }>(
        "/plaid/create-link-token",
      );
      setLinkToken(data.link_token);
      if (data.mock || data.link_token.startsWith("mock-")) {
        setMockPickerOpen(true);
      }
      // Real Plaid Link auto-opens via the effect below.
    } catch {
      setErrorMsg("Something went wrong connecting your bank. Please try again.");
      setStage("error");
    }
  };

  // react-plaid-link integration (real-mode). Safe to mount even with a mock
  // token — we just never call .open() in mock mode.
  const plaid = usePlaidLink({
    token: linkToken && !linkToken.startsWith("mock-") ? linkToken : null,
    onSuccess: async (public_token, metadata: PlaidLinkOnSuccessMetadata) => {
      await exchange(public_token, {
        id: metadata.institution?.institution_id ?? "ins_unknown",
        name: metadata.institution?.name ?? "Connected Bank",
      });
    },
    onExit: (err) => {
      if (err) {
        setErrorMsg("Something went wrong connecting your bank. Please try again.");
        setStage("error");
      } else if (stage === "linking") {
        setStage("intro");
      }
    },
  });

  useEffect(() => {
    if (
      linkToken &&
      !linkToken.startsWith("mock-") &&
      plaid.ready &&
      stage === "linking"
    ) {
      plaid.open();
    }
  }, [linkToken, plaid.ready, stage]);

  const exchange = async (
    publicToken: string,
    inst: { id: string; name: string; emoji?: string },
  ) => {
    setInstitution(inst);
    setStage("exchanging");
    try {
      const { data } = await api.post<{ connection_id: string }>(
        "/plaid/exchange-token",
        {
          public_token: publicToken,
          institution: { id: inst.id, name: inst.name, logo_emoji: inst.emoji },
        },
      );
      await beginSync(data.connection_id);
    } catch (e: any) {
      if (e?.response?.status === 402) {
        setErrorMsg("Free tier supports up to 3 bank connections. Upgrade to Pro for more.");
      } else {
        setErrorMsg("We couldn't process the connection. Try a different bank or skip for now.");
      }
      setStage("error");
    }
  };

  const beginSync = async (connectionId: string) => {
    setStage("syncing");
    try {
      const { data } = await api.post<SyncResult>("/plaid/sync-transactions", {
        connection_id: connectionId,
      });
      setSync(data);
      setStage("done");
    } catch {
      toast(
        "Bank connected, but we're still processing your transactions. They'll appear soon!",
      );
      setStage("done");
      setSync({ count: 0, total_carbon_kg: 0, top_transactions: [] });
    }
  };

  // Mock picker → simulate Plaid success path.
  const pickMockInstitution = async (inst: { id: string; name: string; emoji: string }) => {
    setMockPickerOpen(false);
    const publicToken = `mock-public-${Math.random().toString(36).slice(2, 12)}`;
    await exchange(publicToken, inst);
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <Ambient />
      <TopBar />

      <div className="relative z-10 mx-auto w-full max-w-xl px-5 pb-28 pt-6 sm:px-8">
        {banks === null ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-300" />
          </div>
        ) : (
          <>
            {banks.length > 0 && stage === "intro" && (
              <ExistingBanks banks={banks} atLimit={atLimit} />
            )}

            <AnimatePresence mode="wait">
              {stage === "intro" && (
                <Intro
                  key="intro"
                  hasAny={banks.length > 0}
                  atLimit={atLimit}
                  onConnect={startConnect}
                  onSkip={() => navigate({ to: banks.length > 0 ? "/profile" : "/home" })}
                />
              )}
              {stage === "linking" && (
                <Status
                  key="linking"
                  title="Opening secure connection…"
                  body="Waiting for Plaid Link to load."
                />
              )}
              {stage === "exchanging" && (
                <Status
                  key="exchanging"
                  title="Connecting your bank…"
                  body={institution ? `Linking to ${institution.name}` : ""}
                />
              )}
              {stage === "syncing" && (
                <SyncingScreen key="syncing" institution={institution?.name ?? ""} />
              )}
              {stage === "done" && sync && (
                <DoneScreen
                  key="done"
                  institution={institution?.name ?? "your bank"}
                  sync={sync}
                  onContinue={() => navigate({ to: "/dashboard" })}
                  onAddAnother={() => {
                    setStage("intro");
                    setSync(null);
                    setInstitution(null);
                    loadBanks();
                  }}
                />
              )}
              {stage === "error" && (
                <ErrorScreen
                  key="error"
                  message={errorMsg ?? "Something went wrong."}
                  onRetry={() => {
                    setErrorMsg(null);
                    setStage("intro");
                  }}
                  onSkip={() => navigate({ to: "/home" })}
                />
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      <AnimatePresence>
        {mockPickerOpen && (
          <MockBankPicker
            onClose={() => {
              setMockPickerOpen(false);
              setStage("intro");
            }}
            onPick={pickMockInstitution}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

// =========================== sub-components ===========================
function Ambient() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      <div className="absolute -top-32 left-1/2 h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="absolute right-[-160px] top-1/3 h-[360px] w-[360px] rounded-full bg-teal-300/10 blur-3xl" />
    </div>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-xl items-center justify-between px-5 sm:px-8">
        <Link
          to="/profile"
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <span className="text-sm font-bold tracking-tight">Connect Bank</span>
        <span className="w-12" />
      </div>
    </header>
  );
}

function ExistingBanks({ banks, atLimit }: { banks: BankAccount[]; atLimit: boolean }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Connected ({banks.length}/{FREE_TIER_LIMIT})
      </h2>
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
              <p className="truncate text-sm font-semibold">{b.institution}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{b.mask}</p>
            </div>
            {b.status === "active" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
                <Check className="h-3 w-3" /> Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                <AlertTriangle className="h-3 w-3" /> Error
              </span>
            )}
          </li>
        ))}
      </ul>
      {atLimit && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4">
          <Crown className="h-5 w-5 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Free tier limit reached</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Upgrade to Pro for unlimited bank connections.
            </p>
          </div>
          <button className="rounded-xl bg-amber-400/90 px-3 py-2 text-xs font-semibold text-amber-950 transition hover:bg-amber-400">
            Upgrade
          </button>
        </div>
      )}
    </motion.section>
  );
}

function Intro({
  hasAny,
  atLimit,
  onConnect,
  onSkip,
}: {
  hasAny: boolean;
  atLimit: boolean;
  onConnect: () => void;
  onSkip: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
          className="relative mx-auto grid h-24 w-24 place-items-center"
        >
          <div className="absolute inset-0 rounded-full bg-emerald-400/15 blur-2xl" />
          <div className="relative grid h-24 w-24 place-items-center rounded-3xl bg-gradient-to-br from-emerald-400/30 to-teal-300/10 ring-1 ring-emerald-300/30">
            <Building2 className="h-10 w-10 text-emerald-200" strokeWidth={1.5} />
            <ShieldCheck className="absolute -bottom-1.5 -right-1.5 h-8 w-8 rounded-full bg-emerald-500 p-1.5 text-emerald-950 ring-2 ring-background" />
          </div>
        </motion.div>

        <h1 className="mt-5 text-2xl font-bold sm:text-3xl">
          {hasAny ? "Add Another Bank 🏦" : "Connect Your Bank 🏦"}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Automatic carbon tracking, zero manual entry.
        </p>
      </div>

      <ul className="mt-7 space-y-2.5">
        {[
          "Automatically track your carbon from purchases",
          "No manual entry needed",
          "See exactly which spending drives your footprint",
        ].map((b) => (
          <li
            key={b}
            className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <span className="text-sm">{b}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 rounded-3xl border border-emerald-300/20 bg-emerald-400/5 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
          <Lock className="h-4 w-4" /> Your privacy, protected
        </div>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {[
            "We never see your bank balance or credentials",
            "Transaction data is encrypted and private",
            "You can disconnect anytime",
            "Powered by Plaid — trusted by millions",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <span className="mt-0.5 text-emerald-300">🔒</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={onConnect}
        disabled={atLimit}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-4 text-base font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {hasAny ? <Plus className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
        {hasAny ? "Add Another Bank" : "Connect Bank Account"}
      </button>

      <button
        onClick={onSkip}
        className="mt-3 block w-full text-center text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        Skip for now
      </button>
    </motion.section>
  );
}

function Status({ title, body }: { title: string; body: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="grid place-items-center py-24 text-center"
    >
      <Loader2 className="h-10 w-10 animate-spin text-emerald-300" />
      <h2 className="mt-6 text-lg font-semibold">{title}</h2>
      {body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}
    </motion.section>
  );
}

function SyncingScreen({ institution }: { institution: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="grid place-items-center py-20 text-center"
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 16 }}
        className="grid h-16 w-16 place-items-center rounded-full bg-emerald-400/20 ring-1 ring-emerald-300/40"
      >
        <Check className="h-8 w-8 text-emerald-300" />
      </motion.div>
      <h2 className="mt-5 text-lg font-semibold">Connected to {institution} ✅</h2>
      <p className="mt-1 text-sm text-muted-foreground">Now syncing your transactions…</p>

      <div className="mt-6 flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
            className="h-2.5 w-2.5 rounded-full bg-emerald-300"
          />
        ))}
      </div>
    </motion.section>
  );
}

function DoneScreen({
  institution,
  sync,
  onContinue,
  onAddAnother,
}: {
  institution: string;
  sync: SyncResult;
  onContinue: () => void;
  onAddAnother: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 14 }}
          className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-400/20 ring-1 ring-emerald-300/40"
        >
          <Sparkles className="h-8 w-8 text-emerald-200" />
        </motion.div>
        <h2 className="mt-5 text-2xl font-bold">All set! 🎉</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Synced{" "}
          <span className="font-semibold text-foreground">{sync.count.toLocaleString()}</span>{" "}
          transactions from {institution}. We found{" "}
          <span className="font-semibold text-emerald-300">{sync.total_carbon_kg} kg</span> of
          carbon in your spending.
        </p>
      </div>

      {sync.top_transactions.length > 0 && (
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Top carbon transactions
          </p>
          <ul className="mt-3 divide-y divide-white/5">
            {sync.top_transactions.map((t, i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-base">
                  {t.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{t.merchant}</p>
                  <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">
                    {t.category} · ${t.amount.toFixed(2)}
                  </p>
                </div>
                <span className="text-sm font-semibold text-rose-300">{t.carbon_kg} kg</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onContinue}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-4 text-base font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-105"
      >
        View Your Carbon Dashboard <ArrowRight className="h-4 w-4" />
      </button>
      <button
        onClick={onAddAnother}
        className="mt-3 block w-full text-center text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        Connect another bank
      </button>
    </motion.section>
  );
}

function ErrorScreen({
  message,
  onRetry,
  onSkip,
}: {
  message: string;
  onRetry: () => void;
  onSkip: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="text-center"
    >
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-rose-400/15 ring-1 ring-rose-300/30">
        <AlertTriangle className="h-7 w-7 text-rose-300" />
      </div>
      <h2 className="mt-5 text-lg font-semibold">Couldn't complete the connection</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex gap-2">
        <button
          onClick={onRetry}
          className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-3 text-sm font-semibold text-emerald-950"
        >
          Try Again
        </button>
        <button
          onClick={onSkip}
          className="flex-1 rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-semibold"
        >
          Skip
        </button>
      </div>
    </motion.section>
  );
}

// Mock Plaid Link UI shown when no real PLAID_* keys are configured. Keeps
// the entire flow demoable end-to-end without external creds.
function MockBankPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (inst: { id: string; name: string; emoji: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = MOCK_INSTITUTIONS.filter((i) =>
    i.name.toLowerCase().includes(query.toLowerCase()),
  );

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
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-t-3xl border border-white/10 bg-[oklch(0.22_0.035_180)] p-6 sm:rounded-3xl"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-300" />
          <h3 className="text-base font-semibold">Select your bank</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Sandbox mode — pick any institution to simulate a connection.
        </p>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 12,000+ institutions"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-300/50"
          />
        </div>

        <ul className="mt-4 max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {filtered.map((i) => (
            <li key={i.id}>
              <button
                onClick={() => onPick(i)}
                className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-emerald-300/40 hover:bg-white/[0.07]"
              >
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-base">
                  {i.emoji}
                </div>
                <span className="flex-1 text-sm font-semibold">{i.name}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="py-8 text-center text-xs text-muted-foreground">
              No match for "{query}"
            </li>
          )}
        </ul>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3" /> Encrypted by Plaid · 256-bit
        </p>
      </motion.div>
    </motion.div>
  );
}
