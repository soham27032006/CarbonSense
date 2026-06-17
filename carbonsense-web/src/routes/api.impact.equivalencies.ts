import { createFileRoute } from "@tanstack/react-router";

// Conversion factors are intentionally rough but defensible for UI copy.
// 1 mature tree absorbs ~22 kg CO2 / year.
// Avg gas car emits ~0.404 kg CO2 / mile.
// Charging a smartphone ~ 0.00822 kg CO2.
// Cross-country US flight ~ 1100 kg CO2 per passenger.
// Hot shower ~ 0.18 kg CO2 / minute.

export const Route = createFileRoute("/api/impact/equivalencies")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const kg = Number(url.searchParams.get("kg")) || 287.4;

        return Response.json({
          carbon_saved_kg: kg,
          items: [
            {
              id: "trees",
              emoji: "🌳",
              value: Math.round(kg / 22),
              unit: "trees",
              description: "trees absorbing CO₂ for a year",
            },
            {
              id: "miles",
              emoji: "🚗",
              value: Math.round(kg / 0.404),
              unit: "miles",
              description: "of gas-car driving avoided",
            },
            {
              id: "phones",
              emoji: "📱",
              value: Math.round(kg / 0.00822),
              unit: "phones",
              description: "smartphones fully charged",
            },
            {
              id: "flights",
              emoji: "✈️",
              value: +(kg / 1100).toFixed(2),
              unit: "flights",
              description: "cross-country flights saved",
            },
            {
              id: "showers",
              emoji: "🚿",
              value: Math.round(kg / 0.18),
              unit: "minutes",
              description: "of hot showers saved",
            },
            {
              id: "burgers",
              emoji: "🍔",
              value: Math.round(kg / 2.5),
              unit: "burgers",
              description: "beef burgers' worth of carbon avoided",
            },
          ],
        });
      },
    },
  },
});
