import { createFileRoute } from "@tanstack/react-router";

type Category = "food" | "transport" | "home" | "shopping" | "travel" | "other";

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MERCHANTS: Record<Category, string[]> = {
  food: ["Whole Foods", "Chipotle", "Starbucks", "Trader Joe's", "Blue Bottle", "Sweetgreen"],
  transport: ["Shell", "Uber", "Lyft", "Chevron", "Metro Transit", "BP"],
  home: ["PG&E", "Comcast", "Duke Energy", "Con Edison", "AT&T"],
  shopping: ["Amazon", "Target", "Nike", "Zara", "Best Buy", "IKEA"],
  travel: ["Delta Air", "United", "Airbnb", "Marriott", "Expedia"],
  other: ["Venmo", "Pharmacy", "Pet Supplies", "Hardware Store"],
};

// Approx kg CO₂ per dollar spent, per category.
const FACTOR: Record<Category, number> = {
  food: 0.018,
  transport: 0.05,
  home: 0.022,
  shopping: 0.014,
  travel: 0.09,
  other: 0.01,
};

const CATEGORIES: Category[] = ["food", "transport", "home", "shopping", "travel", "other"];

function buildLedger(): {
  id: string;
  merchant: string;
  category: Category;
  amount: number;
  currency: string;
  carbon_kg: number;
  occurred_at: string;
}[] {
  const rng = mulberry32(987654);
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const out = [];
  const COUNT = 96;
  for (let i = 0; i < COUNT; i++) {
    const cat = CATEGORIES[Math.floor(rng() * CATEGORIES.length)];
    const merchants = MERCHANTS[cat];
    const merchant = merchants[Math.floor(rng() * merchants.length)];
    const amount = Math.round((6 + rng() * 130) * 100) / 100;
    const carbon =
      Math.round(amount * FACTOR[cat] * (0.7 + rng() * 0.9) * 10) / 10;
    const occurred = now - Math.floor(i * 0.55 * day + rng() * day);
    out.push({
      id: `tx_${i}_${Math.floor(rng() * 1e6).toString(36)}`,
      merchant,
      category: cat,
      amount,
      currency: "USD",
      carbon_kg: Math.max(0.1, carbon),
      occurred_at: new Date(occurred).toISOString(),
    });
  }
  return out.sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at));
}

export const Route = createFileRoute("/api/carbon/transactions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
        const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? 15) || 15));
        const category = (url.searchParams.get("category") ?? "all").toLowerCase();

        let ledger = buildLedger();
        if (category !== "all" && CATEGORIES.includes(category as Category)) {
          ledger = ledger.filter((t) => t.category === category);
        }

        const total = ledger.length;
        const start = (page - 1) * limit;
        const transactions = ledger.slice(start, start + limit);

        return Response.json({
          transactions,
          page,
          limit,
          total,
          total_pages: Math.max(1, Math.ceil(total / limit)),
          has_more: start + limit < total,
        });
      },
    },
  },
});
