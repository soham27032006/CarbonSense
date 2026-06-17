import { createFileRoute } from "@tanstack/react-router";
import { listMyTeams } from "@/lib/teams/store.server";

export const Route = createFileRoute("/api/teams/my-teams")({
  server: {
    handlers: {
      GET: async () => Response.json({ teams: listMyTeams() }),
    },
  },
});
