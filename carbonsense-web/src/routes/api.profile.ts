import { createFileRoute } from "@tanstack/react-router";
import { getProfile, updateProfile } from "@/lib/profile/store.server";

export const Route = createFileRoute("/api/profile")({
  server: {
    handlers: {
      GET: async () => Response.json(getProfile()),
      PATCH: async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        const updated = updateProfile(body ?? {});
        return Response.json(updated);
      },
      DELETE: async () =>
        Response.json({ ok: true, message: "Account scheduled for deletion." }),
    },
  },
});
