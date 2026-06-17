import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/success")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Bank Connected - CarbonSense" }],
  }),
  component: SuccessPage,
});

function SuccessPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => navigate({ to: "/profile" }), 2000);
    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-5 text-center text-foreground">
      <div className="mb-5 grid h-20 w-20 place-items-center rounded-full bg-emerald-400/15 ring-1 ring-emerald-300/30">
        <CheckCircle2 className="h-11 w-11 text-emerald-300" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-white">Bank Connected!</h1>
      <p className="mt-2 text-sm text-muted-foreground">Redirecting to your profile...</p>
    </main>
  );
}
