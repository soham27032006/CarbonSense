import { createFileRoute } from "@tanstack/react-router";
import { joinTeamByInvite } from "@/lib/teams/store.server";

export const Route = createFileRoute("/api/teams/join/$inviteCode")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const code = (params.inviteCode ?? "").trim();
        if (!code) return Response.json({ error: "Code required" }, { status: 400 });
        const t = joinTeamByInvite(code);
        if (!t) return Response.json({ error: "Invalid invite code" }, { status: 404 });
        return Response.json({ id: t.id, name: t.name });
      },
    },
  },
});
