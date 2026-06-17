import { createFileRoute } from "@tanstack/react-router";

const POOL = [
  {
    id: "ch_lunch_plant",
    category: "food",
    emoji: "🍽",
    title: "Plant-Based Lunch",
    description: "Try a vegetarian or vegan lunch today.",
    savings_kg: 2.5,
    xp_reward: 15,
    difficulty: "Easy" as const,
    why: "Based on your spending, food is your biggest carbon area.",
    tips: [
      "Swap meat for beans, lentils, or tofu as your protein.",
      "Load up on seasonal veggies — they travel less.",
      "Skip cheese-heavy dishes; dairy carries a big footprint.",
    ],
  },
  {
    id: "ch_transit",
    category: "transport",
    emoji: "🚗",
    title: "Leave the Car Behind",
    description: "Take transit, bike, or walk for any trip today.",
    savings_kg: 3.8,
    xp_reward: 20,
    difficulty: "Easy" as const,
    why: "Your transport emissions spiked 18% this week — small trips add up.",
    tips: [
      "Combine errands into one walk or ride.",
      "Check transit times the night before to plan ahead.",
      "For longer trips, see if a colleague can carpool.",
    ],
  },
  {
    id: "ch_thermo",
    category: "home",
    emoji: "🏠",
    title: "Dial It Down",
    description: "Drop your thermostat by 2°C for the evening.",
    savings_kg: 1.6,
    xp_reward: 10,
    difficulty: "Easy" as const,
    why: "Home energy is your third-largest category — heating is the lever.",
    tips: [
      "Layer up with a sweater before reaching for the dial.",
      "Close doors to rooms you're not using.",
      "Let in afternoon sun, then draw curtains at dusk.",
    ],
  },
  {
    id: "ch_secondhand",
    category: "shopping",
    emoji: "🛍",
    title: "Buy Nothing New",
    description: "Skip one online purchase or buy it secondhand instead.",
    savings_kg: 4.2,
    xp_reward: 25,
    difficulty: "Medium" as const,
    why: "New goods carry hidden manufacturing carbon you can sidestep.",
    tips: [
      "Add items to a wishlist and revisit in 48 hours.",
      "Check local resale apps before buying new.",
      "Borrow tools or gear you'll only use once.",
    ],
  },
  {
    id: "ch_mindful",
    category: "travel",
    emoji: "🧘",
    title: "Mindful Mile",
    description: "Walk for one of your usual short drives.",
    savings_kg: 1.1,
    xp_reward: 10,
    difficulty: "Easy" as const,
    why: "Short drives are the easiest emissions to swap for footsteps.",
    tips: [
      "Pick a trip under 1.5 km to walk instead.",
      "Make it a phone-call walk to double up the time.",
      "Track how it feels — most people repeat it.",
    ],
  },
];

function dayIndex(d: Date) {
  return (d.getUTCFullYear() + d.getUTCMonth() + d.getUTCDate()) % POOL.length;
}

// Equivalency phrasing scaled to the carbon saved.
function equivalency(kg: number): string {
  if (kg >= 4) return "driving 17 km less in a gas car";
  if (kg >= 3) return "charging 460 smartphones";
  if (kg >= 2) return "planting a small tree and letting it grow a month";
  if (kg >= 1.4) return "skipping 6 km of city driving";
  return "running your laptop for two full weeks";
}

// Deterministic 14-day streak history: filled = completed, false = missed.
function streakHistory(d: Date): boolean[] {
  const out: boolean[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - i));
    const n = day.getUTCFullYear() + day.getUTCMonth() * 31 + day.getUTCDate() * 7;
    out.push(n % 5 !== 0); // ~80% completed
  }
  return out;
}

export const Route = createFileRoute("/api/challenges/today")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const d = new Date();
        const url = new URL(request.url);
        // `alt` lets the skip flow request a different challenge.
        const offset = Number(url.searchParams.get("alt") ?? "0") || 0;
        const idx = (dayIndex(d) + offset) % POOL.length;
        const ch = POOL[idx];
        const participants = 80 + ((d.getUTCDate() * 13) % 120);
        return Response.json({
          ...ch,
          participants_today: participants,
          equivalency: equivalency(ch.savings_kg),
          streak_last_14: streakHistory(d),
        });
      },
    },
  },
});
