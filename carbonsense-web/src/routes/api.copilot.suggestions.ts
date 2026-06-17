import { createFileRoute } from "@tanstack/react-router";

const SUGGESTIONS = [
  "What's my biggest carbon category?",
  "How do I compare to the average?",
  "Give me tips to reduce food carbon",
  "Is organic really better?",
  "Plan me a low-carbon week",
  "What does my Carbon Age mean?",
];

export const Route = createFileRoute("/api/copilot/suggestions")({
  server: {
    handlers: {
      GET: async () => Response.json({ suggestions: SUGGESTIONS }),
    },
  },
});
