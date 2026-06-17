import { createFileRoute } from "@tanstack/react-router";
import { disconnectBank } from "@/lib/profile/store.server";

export const Route = createFileRoute("/api/plaid/disconnect/$id")({
  server: {
    handlers: {
      DELETE: async ({ params }) => {
        const ok = disconnectBank(params.id);
        if (!ok) return new Response("Bank not found", { status: 404 });
        return Response.json({ ok: true });
      },
    },
  },
});
