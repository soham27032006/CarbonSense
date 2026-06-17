import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { calculateFootprint } from "@/lib/onboarding/calculator";

const Schema = z.object({
  transport: z.enum(["car", "public_transit", "bike", "wfh", "mixed"]),
  diet: z.enum(["daily", "few_times_week", "rarely", "never"]),
  spending: z.enum(["under_2k", "2k_to_5k", "5k_to_10k", "over_10k"]),
  travel: z.enum(["never", "1_2_yearly", "monthly", "weekly"]),
  motivation: z.enum(["save_money", "reduce_anxiety", "family_values", "community"]),
  household_size: z.number().int().min(1).max(20).default(1),
  country: z.string().min(2).max(3).default("US"),
});

export const Route = createFileRoute("/api/onboarding/quiz")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
        }
        const result = calculateFootprint(parsed.data);
        return Response.json(result);
      },
    },
  },
});
