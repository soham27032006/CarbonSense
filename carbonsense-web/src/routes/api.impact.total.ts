import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/impact/total")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          carbon_saved_kg: 287.4,
          challenges_completed: 64,
          best_streak: 23,
          days_active: 78,
          xp: 1280,
          achievements_earned: 9,
          total_achievements: 18,
          first_activity_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 78).toISOString(),
        });
      },
    },
  },
});
