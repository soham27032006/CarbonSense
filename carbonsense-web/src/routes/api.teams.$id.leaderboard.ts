import { createFileRoute } from "@tanstack/react-router";
import { getTeam } from "@/lib/teams/store.server";

export const Route = createFileRoute("/api/teams/$id/leaderboard")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const t = getTeam(params.id);
        if (!t) return new Response("Not found", { status: 404 });
        const url = new URL(request.url);
        const period = url.searchParams.get("period") ?? "week";
        const key =
          period === "month"
            ? "carbon_saved_month"
            : period === "all"
              ? "carbon_saved_all"
              : "carbon_saved_week";
        const chKey =
          period === "month"
            ? "challenges_month"
            : period === "all"
              ? "challenges_all"
              : "challenges_week";
        const ranked = [...t.members]
          .sort((a, b) => (b[key] as number) - (a[key] as number))
          .map((m, i) => ({
            rank: i + 1,
            id: m.id,
            display_name: m.display_name,
            carbon_saved: m[key] as number,
            challenges: m[chKey] as number,
            streak: m.streak,
            is_me: !!m.is_me,
          }));
        return Response.json({ period, entries: ranked });
      },
    },
  },
});
