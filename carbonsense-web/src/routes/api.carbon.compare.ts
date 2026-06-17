import { createFileRoute } from "@tanstack/react-router";

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const Route = createFileRoute("/api/carbon/compare")({
  server: {
    handlers: {
      GET: async () => {
        const rng = mulberry32(424242);

        const national_avg_kg = 1333; // US monthly average
        const paris_target_kg = 333; // per-capita Paris-aligned target
        const global_avg_kg = 396;

        const user_monthly_kg = Math.round((150 + rng() * 110) * 10) / 10;

        // Better than this % of the US population (lower footprint = better).
        const better_than_percent = Math.max(
          1,
          Math.min(99, Math.round(100 - (user_monthly_kg / national_avg_kg) * 100)),
        );
        const top_percent = Math.max(1, 100 - better_than_percent);

        const vs_national_percent = Math.round(
          ((user_monthly_kg - national_avg_kg) / national_avg_kg) * 100,
        );
        const vs_last_month_percent = Math.round((rng() * 18 - 12) * 10) / 10;

        const improving = vs_last_month_percent < 0;
        const message = improving
          ? `You cut ${Math.abs(vs_last_month_percent)}% since last month — that's real momentum. Keep going to reach the Paris target.`
          : `You're already living lighter than ${better_than_percent}% of the US. A few daily swaps will edge you toward the Paris target.`;

        return Response.json({
          user_monthly_kg,
          national_avg_kg,
          global_avg_kg,
          paris_target_kg,
          better_than_percent,
          top_percent,
          vs_national_percent,
          vs_last_month_percent,
          improving,
          message,
        });
      },
    },
  },
});
