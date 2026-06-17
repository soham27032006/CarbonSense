import { createFileRoute } from "@tanstack/react-router";
import { createTeam, type TeamType } from "@/lib/teams/store.server";

const TYPES: TeamType[] = ["Neighborhood", "Employer", "Friends", "Custom"];

export const Route = createFileRoute("/api/teams/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { name?: string; type?: string; description?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const name = (body.name ?? "").trim();
        if (!name || name.length > 60) {
          return Response.json({ error: "Name is required" }, { status: 400 });
        }
        const type = (TYPES as string[]).includes(body.type ?? "")
          ? (body.type as TeamType)
          : "Custom";
        const description = (body.description ?? "").slice(0, 200) || undefined;
        const team = createTeam({ name, type, description });
        return Response.json({
          id: team.id,
          name: team.name,
          type: team.type,
          invite_code: team.invite_code,
        });
      },
    },
  },
});
