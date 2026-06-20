/**
 * TanStack route module for CarbonSense web screens. Defines route metadata and page-level UI composition.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  Info,
  Loader2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  useComparison,
  useDashboard,
  useProfile,
  useTransactions,
  useTrends,
} from "@/hooks/useApi";
import { useUnits } from "@/contexts/UnitsContext";
import { StickyHeader } from "@/components/StickyHeader";
import { convertCO2, formatCO2, getCO2Label, type UnitSystem } from "@/utils/units";
import {
  CATEGORY_COLOR,
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
  type Category,
  type Period,
  type Trends,
} from "./dashboardShared";

const TrendChart = lazy(() =>
  import("./dashboardCharts").then((module) => ({ default: module.TrendChart }))
);
const CategoryBreakdown = lazy(() =>
  import("./dashboardCharts").then((module) => ({ default: module.CategoryBreakdown }))
);

function ChartFallback() {
  return (
    <section className="mt-5 grid h-[260px] place-items-center rounded-3xl border border-white/10 bg-white/[0.04]">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </section>
  );
}

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Carbon Dashboard — CarbonSense" },
      {
        name: "description",
        content: "Your deep carbon analytics: trends, category breakdown, and how you compare.",
      },
    ],
  }),
  component: DashboardPage,
});

// ---------- types ----------
interface Dashboard {
  carbon_age: number;
  real_age: number;
  target_age: number;
  this_week: {
    total_carbon_kg: number;
    vs_last_week_percent: number;
    category_breakdown: Record<Exclude<Category, "other">, number>;
  };
  this_month: {
    total_carbon_kg: number;
    vs_last_month_percent: number;
    daily_average_kg: number;
    category_breakdown?: Record<Exclude<Category, "other">, number>;
  };
  this_year?: {
    total_carbon_kg: number;
    category_breakdown: Record<Exclude<Category, "other">, number>;
  };
}

interface Transaction {
  id: string;
  merchant: string;
  category: Category;
  amount: number;
  currency: string;
  carbon_kg: number;
  occurred_at: string;
}

interface Compare {
  user_monthly_kg: number;
  national_avg_kg: number;
  paris_target_kg: number;
  better_than_percent: number;
  top_percent: number;
  vs_last_month_percent: number;
  improving: boolean;
  message?: string;
  ranking_text?: string;
  country?: string;
}

const COUNTRY_LABELS: Record<string, string> = {
  US: "United States",
  USA: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  UK: "United Kingdom",
  AU: "Australia",
  DE: "Germany",
  FR: "France",
  IN: "India",
  India: "India",
};

const PERIOD_TABS: { key: Period; label: string; range: number }[] = [
  { key: "weekly", label: "Week", range: 12 },
  { key: "monthly", label: "Month", range: 12 },
];

// ---------- page ----------
function DashboardPage() {
  const [period, setPeriod] = useState<Period>("weekly");
  const [ageModal, setAgeModal] = useState(false);
  const { unitSystem } = useUnits();
  const tab = PERIOD_TABS.find((t) => t.key === period)!;
  const dashboardQuery = useDashboard();
  const transactionsQuery = useTransactions({ page: 1, limit: 10 });
  const compareQuery = useComparison();
  const trendsQuery = useTrends(period, tab.range);
  const profileQuery = useProfile();
  const profile = (profileQuery.data as any) ?? null;
  const dashboard = (dashboardQuery.data as Dashboard | null) ?? null;
  const transactions =
    ((transactionsQuery.data as { transactions?: Transaction[] } | null)?.transactions ?? []);
  const compare = (compareQuery.data as Compare | null) ?? null;
  const trends = (trendsQuery.data as Trends | null) ?? null;
  const countryCode = String(profile?.settings?.country ?? "US").toUpperCase();
  const countryLabel = compare?.country ?? COUNTRY_LABELS[countryCode] ?? countryCode;

  useEffect(() => {
    if (dashboardQuery.isError || transactionsQuery.isError || compareQuery.isError || trendsQuery.isError) {
      toast.error("Some analytics are still syncing. Showing available data.", {
        id: "dashboard-partial-data",
      });
    }
  }, [dashboardQuery.isError, transactionsQuery.isError, compareQuery.isError, trendsQuery.isError]);

  const loading = dashboardQuery.isLoading && !dashboard;
  const dashboardError = dashboardQuery.isError && !dashboard;
  const trendLoading = trendsQuery.isLoading || trendsQuery.isFetching;
  const ready = Boolean(dashboard);
  const refetchDashboardPage = () => {
    dashboardQuery.refetch();
    transactionsQuery.refetch();
    compareQuery.refetch();
    trendsQuery.refetch();
    profileQuery.refetch();
  };

  // Donut data comes from real per-period category breakdowns the backend
  // returns for each of week / month / year — never scaled or fabricated.
  const donut = useMemo(() => {
    if (!dashboard) return [];
    const base =
      period === "weekly"
        ? dashboard.this_week?.category_breakdown ?? {}
        : period === "monthly"
          ? dashboard.this_month?.category_breakdown ?? {}
          : dashboard.this_year?.category_breakdown ?? {};
    const totals = new Map<Category, number>();
    (Object.entries(base) as [Category, number][]).forEach(([key, value]) => {
      const category = key in CATEGORY_LABEL ? key : "other";
      const rounded = Math.round(Number(value ?? 0) * 10) / 10;
      totals.set(category, Math.round(((totals.get(category) ?? 0) + rounded) * 10) / 10);
    });
    return Array.from(totals.entries())
      .map(([key, value]) => ({ key, value }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [dashboard, period]);

  const donutPeriodLabel =
    period === "weekly"
      ? "This week"
      : period === "monthly"
        ? "This month"
        : "This year";

  return (
    <main className="relative overflow-x-hidden bg-background text-foreground">
      <Ambient />
      <StickyHeader left={<DashboardHeaderLeft />} center={<span className="text-sm font-bold tracking-tight">Carbon Dashboard</span>} />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-28 pt-6 sm:px-8"
      >
        {loading ? (
          <DashboardSkeleton />
        ) : dashboardError ? (
          <DashboardErrorState onRetry={refetchDashboardPage} />
        ) : !ready ? (
          <DashboardEmptyState onRetry={refetchDashboardPage} />
        ) : (
          <>
            <CarbonAgeHero
              dashboard={dashboard!}
              onExplain={() => setAgeModal(true)}
            />

            <PeriodSelector value={period} onChange={setPeriod} />

            <Suspense fallback={<ChartFallback />}>
              <TrendChart trends={trends} loading={trendLoading} period={period} unitSystem={unitSystem} />
            </Suspense>

            <Suspense fallback={<ChartFallback />}>
              <CategoryBreakdown data={donut} unitSystem={unitSystem} periodLabel={donutPeriodLabel} />
            </Suspense>

            <TopTransactions transactions={transactions} unitSystem={unitSystem} />

            {compare && (
              <ComparisonCard compare={compare} unitSystem={unitSystem} countryLabel={countryLabel} />
            )}
          </>
        )}
      </motion.div>

      <AnimatePresence>
        {ageModal && dashboard && (
          <CarbonAgeModal dashboard={dashboard} onClose={() => setAgeModal(false)} />
        )}
      </AnimatePresence>
    </main>
  );
}

// ---------- header ----------
const DashboardHeaderLeft = () => (
  <Link
    to="/home"
    className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
  >
    <ArrowLeft className="h-4 w-4" />
    Home
  </Link>
);

function DashboardErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-3xl border border-rose-300/20 bg-rose-400/10 p-6 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-400/15 text-rose-200">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Couldn't load your dashboard.</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The analytics API did not respond. Retry once the backend is reachable.
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

function DashboardEmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/5 text-emerald-200">
        <Info className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">No dashboard data yet.</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Complete onboarding, finish a challenge, or connect a bank to start analytics.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-foreground hover:bg-white/10"
      >
        Refresh
      </button>
    </div>
  );
}

// ---------- section 1: carbon age hero ----------
function ageStatus(carbonAge: number, realAge: number) {
  const diff = carbonAge - realAge;
  if (diff <= 0) return { color: "#34d399", glow: "rgba(52,211,153,0.45)", tone: "Ahead of your years" };
  if (diff <= 5) return { color: "#fbbf24", glow: "rgba(251,191,36,0.4)", tone: "A little above" };
  return { color: "#f87171", glow: "rgba(248,113,113,0.4)", tone: "Room to improve" };
}

function CarbonAgeHero({
  dashboard,
  onExplain,
}: {
  dashboard: Dashboard;
  onExplain: () => void;
}) {
  const { carbon_age, real_age, target_age } = dashboard;
  const status = ageStatus(carbon_age, real_age);

  // Ring fill = how close carbon age is to the target (lower is better).
  const span = Math.max(8, carbon_age - target_age + 8);
  const progress = Math.max(0.06, Math.min(1, (span - (carbon_age - target_age)) / span));

  const R = 70;
  const C = 2 * Math.PI * R;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04, duration: 0.5 }}
    >
      <button
        type="button"
        onClick={onExplain}
        className="group relative flex w-full flex-col items-center overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-7 text-center transition hover:border-white/20"
      >
        <div
          className="absolute -top-16 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: status.glow }}
        />

        <div className="relative grid h-[184px] w-[184px] place-items-center">
          <svg className="absolute inset-0 -rotate-90" width="184" height="184" viewBox="0 0 184 184">
            <circle cx="92" cy="92" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
            <motion.circle
              cx="92"
              cy="92"
              r={R}
              fill="none"
              stroke={status.color}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={C}
              initial={{ strokeDashoffset: C }}
              animate={{ strokeDashoffset: C * (1 - progress) }}
              transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              style={{ filter: `drop-shadow(0 0 10px ${status.glow})` }}
            />
          </svg>
          <div className="flex flex-col items-center">
            <CountUp
              value={carbon_age}
              className="text-6xl font-bold tabular-nums leading-none"
              style={{ color: status.color }}
            />
            <span className="mt-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              yrs
            </span>
          </div>
        </div>

        <p className="relative mt-4 text-base font-semibold">Your Carbon Age</p>
        <p className="relative mt-1 text-xs text-muted-foreground">
          Real age: {real_age} · Target: {target_age}
        </p>
        <span
          className="relative mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
          style={{ background: `${status.color}1f`, color: status.color }}
        >
          {status.tone}
          <Info className="h-3 w-3 opacity-70 transition group-hover:opacity-100" />
        </span>
      </button>
    </motion.section>
  );
}

function CarbonAgeModal({
  dashboard,
  onClose,
}: {
  dashboard: Dashboard;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-5 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="modal-sheet relative max-w-md border border-white/10 bg-popover p-6"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/5 hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 className="text-lg font-bold">How Carbon Age works</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your <span className="font-medium text-foreground">Carbon Age</span> translates your
          yearly footprint into a single, intuitive number. We estimate your annual CO₂ from your
          habits and spending, then map it onto the lifestyle of an average person at that emissions
          level.
        </p>
        <ul className="mt-4 space-y-2.5 text-sm">
          <li className="flex gap-2.5">
            <span className="mt-0.5">🌍</span>
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">Lower than your real age</span> means
              you're living lighter than most people your age.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-0.5">🎯</span>
            <span className="text-muted-foreground">
              Your <span className="font-medium text-foreground">target</span> ({dashboard.target_age}
              ) is a Paris-aligned footprint — hit it to be climate-neutral on lifestyle.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-0.5">📉</span>
            <span className="text-muted-foreground">
              Every completed challenge and reduced category nudges this number down.
            </span>
          </li>
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-full gradient-primary py-3 text-sm font-semibold text-primary-foreground"
        >
          Got it
        </button>
      </motion.div>
    </motion.div>
  );
}

// ---------- section 2: period selector ----------
function PeriodSelector({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div className="mt-5 flex rounded-2xl border border-white/10 bg-white/[0.04] p-1">
      {PERIOD_TABS.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className="relative flex-1 rounded-xl px-4 py-2 text-sm font-medium transition"
          >
            {active && (
              <motion.span
                layoutId="period-pill"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="absolute inset-0 rounded-xl gradient-primary shadow-glow"
              />
            )}
            <span
              className={[
                "relative",
                active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- section 5: top transactions ----------
function carbonDot(kg: number) {
  if (kg < 1) return "#34d399";
  if (kg <= 3) return "#fbbf24";
  return "#f87171";
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function TransactionRow({ t, index, unitSystem }: { t: Transaction; index: number; unitSystem: UnitSystem }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3"
    >
      <span
        className="grid h-10 w-10 flex-none place-items-center rounded-full text-sm font-bold"
        style={{ background: `${CATEGORY_COLOR[t.category]}22`, color: CATEGORY_COLOR[t.category] }}
      >
        {t.merchant.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{t.merchant}</p>
        <p className="text-xs text-muted-foreground">
          {CATEGORY_EMOJI[t.category]} {fmtDate(t.occurred_at)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">
          {t.currency} {t.amount.toFixed(2)}
        </p>
        <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-muted-foreground">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: carbonDot(t.carbon_kg) }}
          />
          <span className="tabular-nums">{formatCO2(t.carbon_kg, unitSystem)}</span>
        </p>
      </div>
    </motion.div>
  );
}

function TopTransactions({ transactions, unitSystem }: { transactions: Transaction[]; unitSystem: UnitSystem }) {
  const hasData = transactions.length > 0;
  return (
    <section className="mt-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Recent transactions</h2>
        <Link
          to="/transactions"
          search={{ category: "all" }}
          className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
        >
          See all <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {hasData ? (
        <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-0.5">
          {transactions.map((t, i) => (
            <TransactionRow key={t.id} t={t} index={i} unitSystem={unitSystem} />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white/5">
            <Info className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium">No transactions yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect a bank or log a transaction to see them here.
          </p>
          <Link
            to="/connect-bank"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-2 text-xs font-semibold text-emerald-950"
          >
            Connect a bank
          </Link>
        </div>
      )}
    </section>
  );
}

// ---------- section 6: comparison ----------
function ComparisonCard({
  compare,
  unitSystem,
  countryLabel,
}: {
  compare: Compare;
  unitSystem: UnitSystem;
  countryLabel: string;
}) {
  const userVal = compare.user_monthly_kg;
  const parisVal = compare.paris_target_kg;
  const nationalVal = compare.national_avg_kg;

  const maxVal =
    Math.max(userVal, parisVal, nationalVal, 1) * 1.12;
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / maxVal) * 100))}%`;

  const userPercent = (userVal / maxVal) * 100;
  const parisPercent = (parisVal / maxVal) * 100;
  const nationalPercent = (nationalVal / maxVal) * 100;
  const tooClose = Math.abs(userPercent - nationalPercent) < 15;
  const userAboveParis = userPercent - parisPercent < 15 && userPercent - parisPercent > -15;

  let userTone: "green" | "yellow" | "red";
  if (userVal <= parisVal) userTone = "green";
  else if (userVal <= nationalVal) userTone = "yellow";
  else userTone = "red";

  const userColor =
    userTone === "green"
      ? "#34d399"
      : userTone === "yellow"
        ? "#fbbf24"
        : "#f87171";

  const userLabelTop = tooClose || userAboveParis ? "-30px" : "28px";

  return (
    <section className="mt-5 rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/12 via-teal-500/8 to-sky-500/12 px-3 py-5 sm:px-5">
      <div className="px-2">
        <h2 className="text-sm font-semibold">How you compare</h2>
        <p className="mt-1 text-xs text-muted-foreground">Monthly footprint vs benchmarks</p>
      </div>

      <div className="relative mt-12 px-12 pb-20">
        {/* bar track */}
        <div className="relative h-2 rounded-full bg-white/10">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: pos(userVal) }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 to-teal-300"
          />

          {/* paris target marker */}
          <Marker
            left={pos(parisVal)}
            color="#5eead4"
            label={`Paris ${formatCO2(parisVal, unitSystem)}`}
            up
            anchor={parisPercent < 8 ? "left" : parisPercent > 92 ? "right" : "center"}
          />

          {/* national avg marker */}
          <Marker
            left={pos(nationalVal)}
            color="#fb7185"
            label={`${countryLabel} avg ${formatCO2(nationalVal, unitSystem)}`}
            anchor={nationalPercent < 8 ? "left" : nationalPercent > 92 ? "right" : "center"}
          />

          {/* user marker */}
          <div
            className="absolute z-20 -translate-x-1/2"
            style={{ left: pos(userVal), top: -10 }}
          >
            <span
              className="grid h-5 w-5 place-items-center rounded-full border-2 text-[9px] font-bold shadow-lg"
              style={{
                borderColor: userColor,
                background: userColor,
                color: "#0b1f1a"
              }}
            >
              ★
            </span>
            <span
              className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur"
              style={{ color: userColor, top: userLabelTop }}
            >
              You · {formatCO2(userVal, unitSystem)}
            </span>
          </div>
        </div>

        {userTone === "red" && (
          <p className="mt-4 text-center text-[11px] font-medium text-rose-200/90">
            You're above the {countryLabel} average — small swaps add up fast.
          </p>
        )}
        {userTone === "yellow" && (
          <p className="mt-4 text-center text-[11px] font-medium text-amber-200/90">
            You're tracking near the {countryLabel} average — a few wins would beat it.
          </p>
        )}
        {userTone === "green" && (
          <p className="mt-4 text-center text-[11px] font-medium text-emerald-200/90">
            Below Paris target — keep stacking wins.
          </p>
        )}
      </div>

      <div className="mt-2 rounded-2xl bg-emerald-950/20 p-3">
        <p className="text-sm font-semibold text-emerald-100">
          {compare.ranking_text ?? `You're in the top ${compare.top_percent}% in ${countryLabel}`}
        </p>
      </div>
    </section>
  );
}

function Marker({
  left,
  color,
  label,
  up,
  anchor = "center",
}: {
  left: string;
  color: string;
  label: string;
  up?: boolean;
  anchor?: "left" | "center" | "right";
}) {
  const labelTransform =
    anchor === "left"
      ? "translate-x-0"
      : anchor === "right"
        ? "-translate-x-full"
        : "-translate-x-1/2";

  return (
    <div className="absolute z-10 -translate-x-1/2" style={{ left, top: up ? -10 : 8 }}>
      <span className="block h-4 w-0.5" style={{ background: color }} />
      <span
        className={`absolute left-1/2 whitespace-nowrap rounded-md bg-black/40 px-1.5 py-0.5 text-[9px] font-medium backdrop-blur ${labelTransform}`}
        style={{ color, top: up ? -16 : 18 }}
      >
        {label}
      </span>
    </div>
  );
}

// ---------- shared bits ----------
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
      <div className="h-72 animate-pulse rounded-3xl bg-white/5" />
      <div className="h-11 animate-pulse rounded-2xl bg-white/5" />
      <div className="h-72 animate-pulse rounded-3xl bg-white/5" />
      <div className="h-64 animate-pulse rounded-3xl bg-white/5" />
      <div className="h-48 animate-pulse rounded-3xl bg-white/5" />
    </div>
  );
}

function CountUp({
  value,
  suffix,
  className,
  style,
}: {
  value: number;
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const mv = useMotionValue(0);
  const integer = Number.isInteger(value);
  const rounded = useTransform(mv, (v) => (integer ? Math.round(v).toString() : v.toFixed(1)));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 1.2, ease: [0.22, 1, 0.36, 1] });
    return controls.stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span className={className} style={style}>
      <motion.span className="tabular-nums">{rounded}</motion.span>
      {suffix}
    </span>
  );
}
