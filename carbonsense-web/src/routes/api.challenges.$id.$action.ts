import { createFileRoute } from "@tanstack/react-router";

// Mock endpoint — acknowledges accept / complete / skip without persistence.
export const Route = createFileRoute("/api/challenges/$id/$action")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const { id, action } = params;
        if (!["accept", "complete", "skip"].includes(action)) {
          return Response.json({ error: "Unknown action" }, { status: 404 });
        }
        let body: unknown = null;
        try {
          body = await request.json();
        } catch {
          /* no body is fine */
        }
        return Response.json({ ok: true, id, action, body });
      },
    },
  },
});
