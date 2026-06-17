import { createFileRoute } from "@tanstack/react-router";

type Period = "weekly" | "monthly" | "yearly";

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function labelFor(period: Period, stepsAgo: number, now: Date): string {
  const d = new Date(now);
  if (period === "weekly") {
    d.setUTCDate(d.getUTCDate() - stepsAgo * 7);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  if (period === "monthly") {
    d.setUTCMonth(d.getUTCMonth() - stepsAgo);
    return MONTHS[d.getUTCMonth()];
  }
  return String(d.getUTCFullYear() - stepsAgo);
}

export const Route = createFileRoute("/api/carbon/trends")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const period = (url.searchParams.get("period") ?? "weekly") as Period;
        const range = Math.max(
          2,
          Math.min(52, Number(url.searchParams.get("range") ?? 12) || 12),
        );

        const seed = period === "weekly" ? 1101 : period === "monthly" ? 2202 : 3303;
        const rng = mulberry32(seed);
        const base = period === "weekly" ? 42 : period === "monthly" ? 168 : 2100;

        const now = new Date();
        const points: { label: string; value: number; previous: number }[] = [];

        // Gentle downward trend with noise so reductions feel earned.
        for (let i = range - 1; i >= 0; i--) {
          const progress = (range - 1 - i) / Math.max(1, range - 1); // 0 → 1 over time
          const trend = base * (1 - progress * 0.22);
          const noise = (rng() - 0.5) * base * 0.16;
          const value = Math.max(1, Math.round((trend + noise) * 10) / 10);
          const previous =
            Math.round((value * (1.1 + rng() * 0.18) + (rng() - 0.5) * base * 0.1) * 10) / 10;
          points.push({ label: labelFor(period, i, now), value, previous });
        }

        const last = points[points.length - 1]?.value ?? 0;
        const prev = points[points.length - 2]?.value ?? last;
        const change_percent =
          prev > 0 ? Math.round(((last - prev) / prev) * 1000) / 10 : 0;

        const total = Math.round(points.reduce((a, p) => a + p.value, 0) * 10) / 10;
        const average = Math.round((total / points.length) * 10) / 10;

        return Response.json({
          period,
          range,
          unit: "kg",
          points,
          change_percent,
          total,
          average,
        });
      },
    },
  },
});
