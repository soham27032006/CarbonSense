/**
 * TanStack route module for CarbonSense web screens. Defines route metadata and page-level UI composition.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { StickyHeader } from "@/components/StickyHeader";

type Category = "food" | "transport" | "home" | "shopping" | "travel" | "other";
type Filter = "all" | Category;

interface Transaction {
  id: string;
  merchant: string;
  category: Category;
  amount: number;
  currency: string;
  carbon_kg: number;
  occurred_at: string;
}

const CATEGORY_COLOR: Record<Category, string> = {
  food: "#fb923c",
  transport: "#3b82f6",
  home: "#eab308",
  shopping: "#a855f7",
  travel: "#ef4444",
  other: "#9ca3af",
};
const CATEGORY_EMOJI: Record<Category, string> = {
  food: "🍔",
  transport: "🚗",
  home: "🏠",
  shopping: "🛍",
  travel: "✈️",
  other: "💳",
};
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "food", label: "Food" },
  { key: "transport", label: "Transport" },
  { key: "home", label: "Home" },
  { key: "shopping", label: "Shopping" },
  { key: "travel", label: "Travel" },
  { key: "other", label: "Other" },
];
const DATE_RANGES: { key: string; label: string; days: number }[] = [
  { key: "all", label: "All time", days: 0 },
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
];

const LIMIT = 15;

export const Route = createFileRoute("/transactions")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { category: Filter } => {
    const c = String(search.category ?? "all").toLowerCase();
    const valid = FILTERS.some((f) => f.key === c);
    return { category: (valid ? c : "all") as Filter };
  },
  head: () => ({ meta: [{ title: "Transactions — CarbonSense" }] }),
  component: TransactionsPage,
});

function carbonDot(kg: number) {
  if (kg < 1) return "#34d399";
  if (kg <= 3) return "#fbbf24";
  return "#f87171";
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function TransactionsPage() {
  const { category } = Route.useSearch();
  const navigate = useNavigate();

  const [items, setItems] = useState<Transaction[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState("all");

  const fetchPage = useCallback(
    async (pageNum: number, replace: boolean) => {
      const res = await api.get<{ transactions: Transaction[]; has_more: boolean }>(
        "/carbon/transactions",
        { params: { page: pageNum, limit: LIMIT, category } },
      );
      setHasMore(res.data.has_more);
      setItems((prev) => (replace ? res.data.transactions : [...prev, ...res.data.transactions]));
    },
    [category],
  );

  // Reload when category changes.
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setPage(1);
      try {
        await fetchPage(1, true);
      } catch (e) {
        console.error(e);
        if (alive) toast.error("Couldn't load transactions.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchPage]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = page + 1;
      await fetchPage(next, false);
      setPage(next);
    } catch {
      toast.error("Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  };

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setPage(1);
      await fetchPage(1, true);
      toast.success("Up to date 🌿");
    } catch {
      toast.error("Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }, [fetchPage]);

  // Pull-to-refresh (touch).
  const pull = useRef({ startY: 0, active: false, dist: 0 });
  const [pullDist, setPullDist] = useState(0);
  const onTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0) {
      pull.current = { startY: e.touches[0].clientY, active: true, dist: 0 };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!pull.current.active) return;
    const d = e.touches[0].clientY - pull.current.startY;
    if (d > 0) {
      pull.current.dist = Math.min(90, d * 0.5);
      setPullDist(pull.current.dist);
    }
  };
  const onTouchEnd = () => {
    if (pull.current.active && pull.current.dist > 60 && !refreshing) refresh();
    pull.current = { startY: 0, active: false, dist: 0 };
    setPullDist(0);
  };

  const filtered = dateRange === "all"
    ? items
    : items.filter((t) => {
        const days = Number(dateRange);
        return +new Date(t.occurred_at) >= Date.now() - days * 86400000;
      });

  return (
    <main
      className="relative overflow-x-hidden bg-background text-foreground"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 -left-20 h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-[120px]" />
      </div>

      <StickyHeader
        left={
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        }
        center={<span className="text-sm font-bold tracking-tight">All Transactions</span>}
        right={
          <button
            type="button"
            onClick={refresh}
            aria-label="Refresh"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 transition hover:bg-white/10"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        }
      />

      {(pullDist > 0 || refreshing) && (
        <div
          className="flex items-center justify-center overflow-hidden text-muted-foreground"
          style={{ height: refreshing ? 44 : pullDist }}
        >
          <Loader2 className={`h-4 w-4 ${refreshing || pullDist > 60 ? "animate-spin" : ""}`} />
        </div>
      )}

      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-28 sm:px-8">
        {/* filter chips */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {FILTERS.map((f) => {
            const active = f.key === category;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => navigate({ to: "/transactions", search: { category: f.key } })}
                className={[
                  "flex-none rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
                  active
                    ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-200"
                    : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* date filter */}
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {loading ? "Loading…" : `${filtered.length} shown`}
          </p>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            aria-label="Filter transactions by date range"
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-foreground outline-none focus:border-emerald-300/40"
          >
            {DATE_RANGES.map((r) => (
              <option key={r.key} value={r.key} className="bg-popover">
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* list */}
        <div className="mt-4 space-y-2" aria-live="polite" aria-busy={loading}>
          {loading ? (
            <>
              <span className="sr-only">Loading transactions…</span>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/5" />
              ))}
            </>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-muted-foreground">
              No transactions for this filter.
            </div>
          ) : (
            filtered.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3"
              >
                <span
                  className="grid h-10 w-10 flex-none place-items-center rounded-full text-sm font-bold"
                  style={{
                    background: `${CATEGORY_COLOR[t.category]}22`,
                    color: CATEGORY_COLOR[t.category],
                  }}
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
                    {t.currency}{t.amount.toFixed(2)}
                  </p>
                  <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: carbonDot(t.carbon_kg) }} />
                    <span className="tabular-nums">{t.carbon_kg.toFixed(1)} kg</span>
                  </p>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* load more */}
        {!loading && hasMore && dateRange === "all" && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-3 text-sm font-medium transition hover:bg-white/[0.07] disabled:opacity-60"
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
          </button>
        )}
      </div>
    </main>
  );
}
