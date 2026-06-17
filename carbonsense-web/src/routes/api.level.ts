import { createFileRoute } from "@tanstack/react-router";

const LEVELS = [
  { level: 1, name: "Seedling", xp_required: 0, icon: "🌱" },
  { level: 2, name: "Sprout", xp_required: 100, icon: "🌿" },
  { level: 3, name: "Sapling", xp_required: 250, icon: "🪴" },
  { level: 4, name: "Grower", xp_required: 500, icon: "🌳" },
  { level: 5, name: "Carbon Champion", xp_required: 1000, icon: "🏅" },
  { level: 6, name: "Climate Ally", xp_required: 1500, icon: "🌍" },
  { level: 7, name: "Forest Guardian", xp_required: 2200, icon: "🦌" },
  { level: 8, name: "Eco Strategist", xp_required: 3000, icon: "🧭" },
  { level: 9, name: "Planet Steward", xp_required: 4000, icon: "🛡️" },
  { level: 10, name: "CarbonSense Sage", xp_required: 5500, icon: "✨" },
];

export const Route = createFileRoute("/api/level")({
  server: {
    handlers: {
      GET: async () => {
        const xp = 1280;
        const current = [...LEVELS].reverse().find((l) => xp >= l.xp_required) ?? LEVELS[0];
        const next = LEVELS.find((l) => l.level === current.level + 1);
        return Response.json({
          xp,
          current,
          next,
          xp_into_current: xp - current.xp_required,
          xp_to_next: next ? next.xp_required - current.xp_required : 0,
          levels: LEVELS,
        });
      },
    },
  },
});
