import { createFileRoute } from "@tanstack/react-router";

type Category = "food" | "transport" | "home" | "shopping" | "lifestyle";
type Status = "completed" | "skipped" | "missed";

const ITEMS = [
  { title: "Plant-Based Lunch", emoji: "🍽", category: "food" as Category, xp: 15, kg: 2.5 },
  { title: "Leave the Car Behind", emoji: "🚗", category: "transport" as Category, xp: 20, kg: 3.8 },
  { title: "Dial It Down", emoji: "🏠", category: "home" as Category, xp: 10, kg: 1.6 },
  { title: "Buy Nothing New", emoji: "🛍", category: "shopping" as Category, xp: 25, kg: 4.2 },
  { title: "Mindful Mile", emoji: "🧘", category: "lifestyle" as Category, xp: 10, kg: 1.1 },
  { title: "Meatless Dinner", emoji: "🥗", category: "food" as Category, xp: 15, kg: 2.2 },
  { title: "Cold Wash Day", emoji: "🧺", category: "home" as Category, xp: 10, kg: 0.9 },
  { title: "Bike Commute", emoji: "🚲", category: "transport" as Category, xp: 20, kg: 3.1 },
];

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDay(offset: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/api/challenges/history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
        const limit = Math.min(50, Number(url.searchParams.get("limit") ?? "20") || 20);

        const total = 65;
        const start = (page - 1) * limit;
        const items = [];
        for (let i = start; i < Math.min(start + limit, total); i++) {
          const rng = mulberry32(1000 + i * 97);
          const base = ITEMS[i % ITEMS.length];
          const roll = rng();
          const status: Status = roll < 0.72 ? "completed" : roll < 0.88 ? "skipped" : "missed";
          items.push({
            id: `uc_${i}`,
            title: base.title,
            emoji: base.emoji,
            category: base.category,
            date: isoDay(i + 1),
            status,
            xp_earned: status === "completed" ? base.xp : 0,
            carbon_saved_kg: status === "completed" ? base.kg : 0,
          });
        }

        return Response.json({
          page,
          limit,
          total,
          has_more: start + limit < total,
          summary: {
            total_completed: 47,
            total_carbon_saved_kg: 112,
            total_xp_earned: 890,
            completion_rate: 72,
          },
          items,
        });
      },
    },
  },
});
