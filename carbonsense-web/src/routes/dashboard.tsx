import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
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
import { convertCO2, formatCO2, getCO2Label, type UnitSystem } from "@/utils/units";

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
type Category = "food" | "transport" | "home" | "shopping" | "travel" | "other";
type Period = "weekly" | "monthly" | "yearly";

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
  };
}

interface Trends {
  period: Period;
  range: number;
  unit: string;
  points: { label: string; value: number; previous: number }[];
  change_percent: number;
  total: number;
  average: number;
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
  message: string;
}

const CATEGORY_COLOR: Record<Category, string> = {
  food: "#fb923c",
  transport: "#3b82f6",
  home: "#eab308",
  shopping: "#a855f7",
  travel: "#ef4444",
  other: "#9ca3af",
};
const CATEGORY_LABEL: Record<Category, string> = {
  food: "Food",
  transport: "Transport",
  home: "Home",
  shopping: "Shopping",
  travel: "Travel",
  other: "Other",
};
const CATEGORY_EMOJI: Record<Category, string> = {
  food: "🍔",
  transport: "🚗",
  home: "🏠",
  shopping: "🛍",
  travel: "✈️",
  other: "💳",
};

const COUNTRY_LABELS: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  AU: "Australia",
  DE: "Germany",
  FR: "France",
  IN: "India",
};

const PERIOD_TABS: { key: Period; label: string; range: number }[] = [
  { key: "weekly", label: "Week", range: 12 },
  { key: "monthly", label: "Month", range: 12 },
  { key: "yearly", label: "Year", range: 5 },
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
  const dashboard = (dashboardQuery.data as Dashboard | null) ?? null;
  const transactions =
    ((transactionsQuery.data as { transactions?: Transaction[] } | null)?.transactions ?? []);
  const compare = (compareQuery.data as Compare | null) ?? null;
  const trends = (trendsQuery.data as Trends | null) ?? null;
  const countryCode = String((profileQuery.data as any)?.settings?.country ?? "US").toUpperCase();
  const countryLabel = COUNTRY_LABELS[countryCode] ?? countryCode;

  useEffect(() => {
    if (dashboardQuery.isError || transactionsQuery.isError || compareQuery.isError) {
      toast.error("Couldn't load your analytics.");
    }
  }, [dashboardQuery.isError, transactionsQuery.isError, compareQuery.isError]);

  useEffect(() => {
    if (trendsQuery.isError) toast.error("Couldn't load trends.");
  }, [trendsQuery.isError]);

  const loading =
    dashboardQuery.isLoading || transactionsQuery.isLoading || compareQuery.isLoading;
  const trendLoading = trendsQuery.isLoading || trendsQuery.isFetching;
  const ready = Boolean(dashboard && compare);

  // Donut data scaled to the active period from the weekly breakdown shape.
  const donut = useMemo(() => {
    if (!dashboard) return [];
    const scale = period === "weekly" ? 1 : period === "monthly" ? 4.3 : 52;
    const base = dashboard.this_week.category_breakdown;
    const totals = new Map<Category, number>();
    (Object.entries(base) as [Category, number][]).forEach(([key, value]) => {
      const category = key in CATEGORY_LABEL ? key : "other";
      const scaled = Math.round(Number(value ?? 0) * scale * 10) / 10;
      totals.set(category, Math.round(((totals.get(category) ?? 0) + scaled) * 10) / 10);
    });
    return Array.from(totals.entries())
      .map(([key, value]) => ({ key, value }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [dashboard, period]);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <Ambient />
      <Header />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-28 pt-6 sm:px-8"
      >
        {loading || !ready ? (
          <DashboardSkeleton />
        ) : (
          <>
            <CarbonAgeHero
              dashboard={dashboard!}
              onExplain={() => setAgeModal(true)}
            />

            <PeriodSelector value={period} onChange={setPeriod} />

            <TrendChart trends={trends} loading={trendLoading} period={period} unitSystem={unitSystem} />

            <CategoryBreakdown data={donut} unitSystem={unitSystem} />

            <TopTransactions transactions={transactions} unitSystem={unitSystem} />

            <ComparisonCard compare={compare!} unitSystem={unitSystem} countryLabel={countryLabel} />
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
function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-5 sm:px-8">
        <Link
          to="/home"
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Home
        </Link>
        <span className="text-sm font-bold tracking-tight">Carbon Dashboard</span>
        <span className="w-12" />
      </div>
    </header>
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

// ---------- section 3: trend chart ----------
function TrendTooltip({ active, payload, label, unitSystem = "metric" }: any & { unitSystem?: UnitSystem }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.dataKey === "value" ? "This period" : "Previous"}:{" "}
          <span className="font-semibold text-foreground">
            {formatCO2(Number(p.value ?? 0), unitSystem)}
          </span>
        </p>
      ))}
    </div>
  );
}

function TrendChart({
  trends,
  loading,
  period,
  unitSystem,
}: {
  trends: Trends | null;
  loading: boolean;
  period: Period;
  unitSystem: UnitSystem;
}) {
  const change = trends?.change_percent ?? 0;
  const down = change < 0;
  const periodWord = period === "weekly" ? "last week" : period === "monthly" ? "last month" : "last year";

  return (
    <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Footprint trend</h2>
          <p className="text-xs text-muted-foreground">{getCO2Label(unitSystem)} over time</p>
        </div>
        {trends && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Avg</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatCO2(trends.average, unitSystem)}
            </p>
          </div>
        )}
      </div>

      <div className="chart-wrap relative mt-4">
        {loading && (
          <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-background/40 backdrop-blur-sm">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={period}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="h-full w-full"
          >
            {trends && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trends.points} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={18}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                    tickFormatter={(value) => String(Math.round(convertCO2(Number(value), unitSystem)))}
                  />
                  <Tooltip content={<TrendTooltip unitSystem={unitSystem} />} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
                  <Line
                    type="monotone"
                    dataKey="previous"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={false}
                    isAnimationActive
                    animationDuration={900}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#34d399"
                    strokeWidth={2.5}
                    fill="url(#trendFill)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#34d399", stroke: "#0b1f1a", strokeWidth: 2 }}
                    isAnimationActive
                    animationDuration={1100}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {trends && (
        <div className="mt-3 flex items-center justify-between">
          <span
            className={[
              "inline-flex items-center gap-1.5 text-sm font-semibold",
              down ? "text-emerald-300" : "text-red-300",
            ].join(" ")}
          >
            {down ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
            {Math.abs(change)}% vs {periodWord}
          </span>
          <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-full bg-emerald-400" /> Now
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0 w-3 border-t-2 border-dashed border-slate-400" />{" "}
              Previous
            </span>
          </span>
        </div>
      )}
    </section>
  );
}

// ---------- section 4: category breakdown ----------
function CategoryBreakdown({ data, unitSystem }: { data: { key: Category; value: number }[]; unitSystem: UnitSystem }) {
  const navigate = useNavigate();
  const total = data.reduce((a, d) => a + d.value, 0) || 1;

  return (
    <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-sm font-semibold">Category breakdown</h2>
      <p className="text-xs text-muted-foreground">Tap a slice to see those transactions</p>

      <div className="mt-2 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="chart-wrap relative w-full max-w-[16rem] flex-none sm:max-w-[14rem] lg:max-w-[18rem]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="key"
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={88}
                paddingAngle={2}
                stroke="none"
                animationDuration={900}
                onClick={(d: any) =>
                  navigate({ to: "/transactions", search: { category: d.key as Category } })
                }
              >
                {data.map((d) => (
                  <Cell
                    key={d.key}
                    fill={CATEGORY_COLOR[d.key]}
                    className="cursor-pointer outline-none transition-opacity hover:opacity-80"
                  />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }: any) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border border-white/10 bg-popover/95 px-2.5 py-1.5 text-xs shadow-xl backdrop-blur">
                      <span className="font-medium">
                        {CATEGORY_LABEL[payload[0].payload.key as Category]}
                      </span>
                      : {formatCO2(Number(payload[0].value ?? 0), unitSystem)}
                    </div>
                  ) : null
                }
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <CountUp value={Math.round(convertCO2(total, unitSystem))} className="text-2xl font-bold tabular-nums" />
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{getCO2Label(unitSystem)}</p>
            </div>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-1">
          {data.map((d, i) => {
            const pct = Math.round((d.value / total) * 100);
            return (
              <motion.button
                key={d.key}
                type="button"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.07 }}
                onClick={() =>
                  navigate({ to: "/transactions", search: { category: d.key } })
                }
                className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/5"
              >
                <span className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: CATEGORY_COLOR[d.key] }}
                  />
                  {CATEGORY_LABEL[d.key]}
                </span>
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  {pct}%
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
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
          ${t.amount.toFixed(2)}
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
      <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-0.5">
        {transactions.map((t, i) => (
          <TransactionRow key={t.id} t={t} index={i} unitSystem={unitSystem} />
        ))}
      </div>
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
  const max = compare.national_avg_kg * 1.05;
  const pos = (v: number) => `${Math.min(100, (v / max) * 100)}%`;

  return (
    <section className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/12 via-teal-500/8 to-sky-500/12 p-5">
      <h2 className="text-sm font-semibold">How you compare</h2>
      <p className="mt-1 text-xs text-muted-foreground">Monthly footprint vs benchmarks</p>

      <div className="relative mt-8 h-2 rounded-full bg-white/10">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: pos(compare.user_monthly_kg) }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 to-teal-300"
        />

        {/* user marker */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, left: pos(compare.user_monthly_kg) }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="absolute -top-1.5 z-20 -translate-x-1/2"
        >
          <span className="grid h-5 w-5 -translate-y-px place-items-center rounded-full border-2 border-emerald-950 bg-emerald-300 text-[9px] font-bold text-emerald-950 shadow-lg">
            ★
          </span>
          <span className="absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-emerald-200">
            You · {formatCO2(compare.user_monthly_kg, unitSystem)}
          </span>
        </motion.div>

        {/* paris target marker */}
        <Marker left={pos(compare.paris_target_kg)} color="#5eead4" label={`Paris ${formatCO2(compare.paris_target_kg, unitSystem)}`} up />
        {/* national marker */}
        <Marker left={pos(compare.national_avg_kg)} color="#f87171" label={`${countryLabel} avg ${formatCO2(compare.national_avg_kg, unitSystem)}`} />
      </div>

      <div className="mt-14 rounded-2xl bg-emerald-950/20 p-3">
        <p className="text-sm font-semibold text-emerald-100">
          You're in the top {compare.top_percent}% in {countryLabel}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-emerald-50/80">{compare.message}</p>
      </div>
    </section>
  );
}

function Marker({
  left,
  color,
  label,
  up,
}: {
  left: string;
  color: string;
  label: string;
  up?: boolean;
}) {
  return (
    <div className="absolute z-10 -translate-x-1/2" style={{ left, top: up ? -10 : 8 }}>
      <span className="block h-4 w-0.5" style={{ background: color }} />
      <span
        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-medium"
        style={{ color, top: up ? -14 : 18 }}
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
