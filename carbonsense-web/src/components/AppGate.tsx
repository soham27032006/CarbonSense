import { useEffect, type ReactNode } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";

const PUBLIC_PATHS = new Set(["/login", "/signup", "/auth/callback"]);
const ONBOARDING_PATH = "/onboarding";

/**
 * Global splash + onboarding gate.
 * - While auth is resolving, show a centered logo splash.
 * - Once resolved, if the user is authenticated but onboarding is not
 *   complete, force them to /onboarding (except on public auth pages).
 */
export function AppGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      if (!PUBLIC_PATHS.has(pathname)) {
        router.navigate({ to: "/login", replace: true });
      }
      return;
    }
    if (pathname === "/login" || pathname === "/signup") {
      router.navigate({
        to: user.onboarding_complete ? "/home" : ONBOARDING_PATH,
        replace: true,
      });
      return;
    }
    if (user.onboarding_complete) {
      if (pathname === ONBOARDING_PATH) {
        router.navigate({ to: "/home", replace: true });
      }
      return;
    }
    if (pathname === ONBOARDING_PATH) return;
    if (PUBLIC_PATHS.has(pathname)) return;
    router.navigate({ to: ONBOARDING_PATH, replace: true });
  }, [isLoading, isAuthenticated, user, pathname, router]);

  if (isLoading) {
    return <SplashScreen />;
  }

  return <>{children}</>;
}

function SplashScreen() {
  return (
    <div
      role="status"
      aria-label="Loading CarbonSense"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
      style={{
        background:
          "radial-gradient(ellipse at center, oklch(0.22 0.04 175) 0%, oklch(0.13 0.03 200) 70%)",
      }}
    >
      <div className="flex flex-col items-center gap-4 animate-pulse">
        <div className="text-3xl font-extrabold tracking-tight text-foreground">
          <span className="text-primary">✦</span> CarbonSense
        </div>
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Sense the change
        </div>
      </div>
    </div>
  );
}
