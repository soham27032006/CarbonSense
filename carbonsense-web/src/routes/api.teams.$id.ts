import { createFileRoute } from "@tanstack/react-router";
import { getTeam, teamStats } from "@/lib/teams/store.server";

export const Route = createFileRoute("/api/teams/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const t = getTeam(params.id);
        if (!t) return new Response("Not found", { status: 404 });
        const stats = teamStats(t);
        return Response.json({
          id: t.id,
          name: t.name,
          type: t.type,
          description: t.description,
          invite_code: t.invite_code,
          created_at: t.created_at,
          is_admin: t.members.find((m) => m.is_me)?.is_admin ?? false,
          ...stats,
          activity: buildActivity(t),
        });
      },
    },
  },
});

function buildActivity(t: ReturnType<typeof getTeam>) {
  if (!t) return [];
  const items: { id: string; text: string; ts: string }[] = [];
  const now = Date.now();
  const top = [...t.members].sort((a, b) => b.streak - a.streak).slice(0, 3);
  top.forEach((m, i) => {
    items.push({
      id: `act_streak_${m.id}`,
      text: `${m.display_name} hit a ${m.streak}-day streak! 🔥`,
      ts: new Date(now - (i + 1) * 1000 * 60 * 60 * 3).toISOString(),
    });
  });
  const recent = [...t.members]
    .sort((a, b) => b.carbon_saved_week - a.carbon_saved_week)
    .slice(0, 3);
  recent.forEach((m, i) => {
    items.push({
      id: `act_done_${m.id}`,
      text: `${m.display_name} completed a challenge! 🌿`,
      ts: new Date(now - (i + 1) * 1000 * 60 * 60 * 8).toISOString(),
    });
  });
  const total = t.members.reduce((s, m) => s + m.carbon_saved_all, 0);
  const milestone = Math.floor(total / 250) * 250;
  if (milestone >= 250) {
    items.push({
      id: `act_milestone_${milestone}`,
      text: `Team milestone: ${milestone} kg CO₂ saved! 🎉`,
      ts: new Date(now - 1000 * 60 * 60 * 26).toISOString(),
    });
  }
  return items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
}
