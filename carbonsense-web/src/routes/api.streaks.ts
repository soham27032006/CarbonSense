import { createFileRoute } from "@tanstack/react-router";
import { getStreakDetail } from "@/lib/profile/store.server";

export const Route = createFileRoute("/api/streaks")({
  server: {
    handlers: {
      GET: async () => Response.json(getStreakDetail()),
    },
  },
});
