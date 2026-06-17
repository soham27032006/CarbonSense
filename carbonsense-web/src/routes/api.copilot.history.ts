import { createFileRoute } from "@tanstack/react-router";

// Mock prior conversation. In production, fetch from DB scoped to user.
export const Route = createFileRoute("/api/copilot/history")({
  server: {
    handlers: {
      GET: async () => {
        const now = Date.now();
        return Response.json({
          messages: [
            {
              id: "m_h1",
              role: "user" as const,
              content: "What's been my biggest carbon source this month?",
              created_at: new Date(now - 1000 * 60 * 60 * 26).toISOString(),
            },
            {
              id: "m_h2",
              role: "assistant" as const,
              content:
                "**Food** is your largest category this month — about **42%** of your footprint.\n\nThe biggest drivers were:\n1. Red meat purchases (3 trips)\n2. Imported produce in week 2\n3. A few takeout meals on busy nights\n\nWant a quick plan to bring it down next week?",
              created_at: new Date(now - 1000 * 60 * 60 * 26 + 4000).toISOString(),
            },
          ],
        });
      },
    },
  },
});
