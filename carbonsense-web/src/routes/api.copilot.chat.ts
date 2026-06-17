import { createFileRoute } from "@tanstack/react-router";

interface ChatBody {
  message?: unknown;
}

// Naive keyword-based mock responses so the chat feels alive without a model.
function generate(message: string): { response: string; suggestions: string[] } {
  const m = message.toLowerCase();

  if (m.includes("biggest") || m.includes("category")) {
    return {
      response:
        "Your biggest category right now is **Food** — roughly **42%** of your monthly footprint.\n\nTop contributors:\n1. Red meat (beef especially)\n2. Imported, out-of-season produce\n3. Frequent takeout / delivery\n\nSwapping just 2 beef meals a week for plant-based ones would cut around **6 kg CO₂** weekly.",
      suggestions: [
        "Show me easy plant-based swaps",
        "How much would 2 veggie days save?",
        "What's a low-carbon grocery list?",
      ],
    };
  }

  if (m.includes("compare") || m.includes("average")) {
    return {
      response:
        "You're at **6.8 kg CO₂/day**, while the average in your region is **9.4 kg/day** — you're about **28% below average**. 🎉\n\nMost of that lead comes from your low transport footprint. The opportunity sits in **food** and **shopping**.",
      suggestions: [
        "Where can I improve most?",
        "What's the goal for a climate-safe lifestyle?",
        "How does this rank vs my friends?",
      ],
    };
  }

  if (m.includes("food")) {
    return {
      response:
        "Here are 3 high-impact food tips for you:\n\n1. **Beans before beef** — swap red meat for legumes twice a week.\n2. **Seasonal & local** — shop the outer ring of the store, skip imported berries in winter.\n3. **Use what you buy** — food waste is ~8% of global emissions. Plan 4 meals, not 7.\n\nWant me to draft a 7-day meal plan?",
      suggestions: [
        "Draft a 7-day low-carbon meal plan",
        "What about dairy?",
        "Is plant-based meat actually better?",
      ],
    };
  }

  if (m.includes("organic")) {
    return {
      response:
        "**Short answer:** sometimes.\n\nOrganic typically uses fewer synthetic inputs (good for soil & water) but the **carbon** picture is mixed — yields are lower, so per-kilo emissions can be similar or higher.\n\nFor climate impact, *what* you eat matters far more than *how* it was grown. A conventional lentil beats organic beef every time.",
      suggestions: [
        "Then what should I prioritize?",
        "Is local always better?",
        "What about packaging?",
      ],
    };
  }

  if (m.includes("plan") || m.includes("week")) {
    return {
      response:
        "Here's a starter **low-carbon week**:\n\n- **Mon** — Meatless Monday + walk one errand\n- **Tue** — Batch-cook lentil chili\n- **Wed** — Transit or bike commute\n- **Thu** — No-new-stuff day\n- **Fri** — Cold-wash laundry + line dry\n- **Sat** — Farmer's market run\n- **Sun** — Plan next week's meals\n\nEstimated savings: **~14 kg CO₂**.",
      suggestions: [
        "Turn this into daily challenges",
        "What if I travel midweek?",
        "Show me the math",
      ],
    };
  }

  if (m.includes("carbon age")) {
    return {
      response:
        "Your **Carbon Age** translates your footprint into a single, intuitive number — like a fitness age.\n\n- Lower = your lifestyle aligns with a climate-safe future.\n- Higher = your habits look like an older, higher-emission baseline.\n\nYou're currently **27**, against a chronological average of **34** — nicely ahead.",
      suggestions: [
        "How is Carbon Age calculated?",
        "What lowers it fastest?",
        "Can I share my Carbon Age?",
      ],
    };
  }

  return {
    response: `Good question. Based on your recent activity, the highest-leverage move is usually in **food** and **transport** — they account for most of your weekly variation.\n\nTell me a bit more and I'll get specific: are you optimizing for *easy wins*, *biggest cuts*, or *building a habit*?`,
    suggestions: [
      "Easy wins this week",
      "Biggest possible cuts",
      "Help me build a habit",
    ],
  };
}

export const Route = createFileRoute("/api/copilot/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: ChatBody = {};
        try {
          body = (await request.json()) as ChatBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const message = typeof body.message === "string" ? body.message.trim() : "";
        if (!message) return new Response("message is required", { status: 400 });
        if (message.length > 2000) return new Response("message too long", { status: 400 });

        // Simulate model latency.
        await new Promise((r) => setTimeout(r, 450));

        return Response.json(generate(message));
      },
    },
  },
});
