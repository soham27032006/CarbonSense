import { createFileRoute } from "@tanstack/react-router";

const MERCHANTS = [
  { merchant: "Delta Airlines", category: "travel", amount: 412.5, carbon_kg: 380.4, emoji: "✈️" },
  { merchant: "Shell Gas Station", category: "transport", amount: 62.3, carbon_kg: 48.1, emoji: "⛽" },
  { merchant: "Uber Eats", category: "food", amount: 38.4, carbon_kg: 12.9, emoji: "🍔" },
  { merchant: "Pacific Gas & Electric", category: "home", amount: 184.1, carbon_kg: 86.7, emoji: "⚡" },
  { merchant: "Amazon", category: "shopping", amount: 124.99, carbon_kg: 22.4, emoji: "📦" },
  { merchant: "Whole Foods", category: "food", amount: 88.42, carbon_kg: 18.1, emoji: "🥬" },
  { merchant: "Lyft", category: "transport", amount: 18.6, carbon_kg: 6.2, emoji: "🚗" },
  { merchant: "Costco", category: "shopping", amount: 213.4, carbon_kg: 41.7, emoji: "🛒" },
];

export const Route = createFileRoute("/api/plaid/sync-transactions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { connection_id?: string };
        if (!body?.connection_id) {
          return Response.json({ error: "Missing connection_id." }, { status: 400 });
        }

        // Simulate a short processing pause.
        await new Promise((r) => setTimeout(r, 600));

        const count = 124;
        const transactions = MERCHANTS
          .slice()
          .sort((a, b) => b.carbon_kg - a.carbon_kg)
          .slice(0, 3);

        const total_carbon =
          Math.round(MERCHANTS.reduce((s, m) => s + m.carbon_kg * 6, 0) * 10) / 10;

        return Response.json({
          connection_id: body.connection_id,
          count,
          total_carbon_kg: total_carbon,
          top_transactions: transactions,
        });
      },
    },
  },
});
