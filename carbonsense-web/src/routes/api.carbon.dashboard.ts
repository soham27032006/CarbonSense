import { createFileRoute } from "@tanstack/react-router";

type Category = "food" | "transport" | "home" | "shopping" | "travel";

function pseudoSeed(date = new Date()): number {
  const d = new Date(date);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const Route = createFileRoute("/api/carbon/dashboard")({
  server: {
    handlers: {
      GET: async () => {
        const seed = pseudoSeed();
        const rng = mulberry32(seed);

        const streakCurrent = 8 + Math.floor(rng() * 20);
        const xp = 240 + Math.floor(rng() * 360);
        const xp_to_next = 600;
        const todayKg = Math.round((6 + rng() * 12) * 10) / 10;
        const week = Math.round((24 + rng() * 30) * 10) / 10;
        const lastWeek = Math.round((26 + rng() * 30) * 10) / 10;
        const month = Math.round((105 + rng() * 80) * 10) / 10;
        const lastMonth = Math.round((110 + rng() * 80) * 10) / 10;

        const weights: Record<Category, number> = {
          food: 0.28 + rng() * 0.08,
          transport: 0.24 + rng() * 0.1,
          home: 0.16 + rng() * 0.06,
          shopping: 0.14 + rng() * 0.06,
          travel: 0.06 + rng() * 0.08,
        };
        const sumW = Object.values(weights).reduce((a, b) => a + b, 0);
        const breakdown = Object.fromEntries(
          (Object.keys(weights) as Category[]).map((k) => [
            k,
            Math.round(((weights[k] / sumW) * week) * 10) / 10,
          ]),
        ) as Record<Category, number>;

        return Response.json({
          carbon_age: 34,
          real_age: 28,
          target_age: 28,
          current_level: { level: 3, name: "Carbon Conscious", xp, xp_to_next },
          streak: {
            current: streakCurrent,
            max: streakCurrent + 4,
            freeze_available: 2,
          },
          today: {
            carbon_kg: todayKg,
            challenge_status: "pending" as "pending" | "accepted" | "completed" | null,
          },
          this_week: {
            total_carbon_kg: week,
            vs_last_week_percent: Math.round(((week - lastWeek) / lastWeek) * 1000) / 10,
            category_breakdown: breakdown,
          },
          this_month: {
            total_carbon_kg: month,
            vs_last_month_percent: Math.round(((month - lastMonth) / lastMonth) * 1000) / 10,
            daily_average_kg: Math.round((month / 30) * 10) / 10,
          },
          ai_insight:
            "You drove 18% less this week than last — keep it up and you'll beat your monthly target by Friday.",
        });
      },
    },
  },
});
