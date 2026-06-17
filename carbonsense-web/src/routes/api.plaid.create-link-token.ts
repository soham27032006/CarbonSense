import { createFileRoute } from "@tanstack/react-router";

// Mock Plaid Link token endpoint. In production this would call Plaid's API
// via the server SDK using PLAID_CLIENT_ID and PLAID_SECRET.
export const Route = createFileRoute("/api/plaid/create-link-token")({
  server: {
    handlers: {
      POST: async () => {
        const link_token = `mock-link-${Math.random().toString(36).slice(2, 12)}`;
        return Response.json({
          link_token,
          expiration: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
          mock: true,
        });
      },
    },
  },
});
