import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/onboarding/complete")({
  server: {
    handlers: {
      POST: async () =>
        Response.json(
          {
            error:
              "Frontend API routes are disabled. Use the Express backend at /api/onboarding/complete.",
          },
          { status: 410 },
        ),
    },
  },
});
