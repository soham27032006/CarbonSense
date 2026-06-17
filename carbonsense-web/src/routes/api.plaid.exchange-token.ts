import { createFileRoute } from "@tanstack/react-router";
import { addBank, listBanks } from "@/lib/profile/store.server";

const FREE_TIER_LIMIT = 3;

export const Route = createFileRoute("/api/plaid/exchange-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          public_token?: string;
          institution?: { id?: string; name?: string; logo_emoji?: string };
        };

        if (!body?.public_token) {
          return Response.json({ error: "Missing public_token." }, { status: 400 });
        }

        if (listBanks().length >= FREE_TIER_LIMIT) {
          return Response.json(
            {
              error: "limit_reached",
              message: "Free tier supports up to 3 bank connections.",
            },
            { status: 402 },
          );
        }

        const bank = addBank({
          institution: body.institution?.name ?? "Connected Bank",
          logo_emoji: body.institution?.logo_emoji,
        });

        return Response.json({
          connection_id: bank.id,
          institution: { id: body.institution?.id ?? bank.id, name: bank.institution },
          access_token: "mock-access-***",
        });
      },
    },
  },
});
