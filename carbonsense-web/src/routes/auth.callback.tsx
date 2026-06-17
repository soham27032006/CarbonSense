import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = Route.useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function completeOAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        if (!cancelled) {
          toast.error("Google sign-in could not be completed");
          navigate({ to: "/login", replace: true });
        }
        return;
      }

      const email = session.user.email ?? "";
      const name =
        (session.user.user_metadata?.full_name as string | undefined) ??
        (session.user.user_metadata?.name as string | undefined) ??
        email.split("@")[0] ??
        "CarbonSense User";

      try {
        const { data } = await api.post<{
          profile?: { onboarding_complete?: boolean | null };
        }>("/auth/signup", { email, name });

        if (cancelled) {
          return;
        }

        if (data.profile?.onboarding_complete) {
          navigate({ to: "/home", replace: true });
          return;
        }

        navigate({ to: "/onboarding", replace: true });
      } catch (error) {
        if (!cancelled) {
          toast.error("Google sign-in succeeded, but profile setup failed");
          navigate({ to: "/login", replace: true });
        }
      }
    }

    void completeOAuth();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-foreground">Finishing sign-in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We&apos;re connecting your account and preparing CarbonSense.
        </p>
      </div>
    </div>
  );
}
