import { createFileRoute } from "@tanstack/react-router";
import { getCarbonAgeDetail } from "@/lib/profile/store.server";

export const Route = createFileRoute("/api/profile/carbon-age")({
  server: {
    handlers: {
      GET: async () => Response.json(getCarbonAgeDetail()),
    },
  },
});
