/**
 * Lazy-loaded recharts-using components for the dashboard. Split out of `dashboard.tsx`
 * so the recharts bundle (~150KB gzipped) is fetched only after the main route loads.
 */
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Info, Loader2 } from "lucide-react";
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
import { convertCO2, formatCO2, getCO2Label, type UnitSystem } from "@/utils/units";
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  type Category,
  type Period,
  type Trends,
} from "./dashboardShared";

export type { Category, Period, Trends } from "./dashboardShared";

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
  const rounded = Math.round(value);
  return (
    <span className={className} style={style}>
      <motion.span className="tabular-nums">{rounded}</motion.span>
      {suffix}
    </span>
  );
}

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

export function TrendChart({
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
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Footprint trend</h2>
            {trends?.is_estimated && (
              <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-200">
                Estimated
              </span>
            )}
          </div>
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
                <ComposedChart data={trends.points} margin={{ top: 8, right: 6, left: -8, bottom: 0 }}>
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
                    width={56}
                    tickMargin={6}
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

export function CategoryBreakdown({
  data,
  unitSystem,
  periodLabel,
}: {
  data: { key: Category; value: number }[];
  unitSystem: UnitSystem;
  periodLabel: string;
}) {
  const navigate = useNavigate();
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const hasData = data.length > 0;

  return (
    <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-sm font-semibold">Category breakdown</h2>
      <p className="text-xs text-muted-foreground">
        {hasData ? "Tap a slice to see those transactions" : "No spending recorded for this period yet"}
      </p>

      <div className="mt-2 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="chart-wrap relative w-full max-w-[16rem] flex-none sm:max-w-[14rem] lg:max-w-[18rem]">
          {hasData ? (
            <>
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
                  <p className="mt-0.5 text-[10px] text-muted-foreground/70">{periodLabel} estimate</p>
                </div>
              </div>
            </>
          ) : (
            <div className="grid h-[200px] place-items-center text-center text-sm text-muted-foreground">
              <div>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/5">
                  <Info className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="mt-3 max-w-[14rem]">
                  Connect a bank or log a transaction to see your category breakdown.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-1">
          {hasData ? (
            data.map((d, i) => {
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
            })
          ) : (
            <p className="col-span-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-center text-xs text-muted-foreground sm:col-span-1">
              No category data yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
