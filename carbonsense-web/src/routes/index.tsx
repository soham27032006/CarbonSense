import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  // Auth/routing for the root path is handled by AppGate in __root.tsx so the
  // session can hydrate from Supabase storage before any redirect decision.
  // This component intentionally renders nothing — the redirect happens via
  // AppGate once the auth state is confirmed.
  beforeLoad: () => {
    throw redirect({ to: "/home" });
  },
  component: () => null,
});
