/**
 * TanStack route module for CarbonSense web screens. Defines route metadata and page-level UI composition.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "react-hot-toast";
import { BarChart3, Home, Leaf, Trophy, UserCircle, X } from "lucide-react";

import appCss from "../styles.css?url";
import responsiveCss from "../styles/responsive.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { useAuthListener } from "@/hooks/useAuthListener";
import { CopilotProvider } from "@/components/copilot/CopilotProvider";
import { AppGate } from "@/components/AppGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MobileNavProvider } from "@/components/MobileNavContext";
import { UnitsProvider } from "@/contexts/UnitsContext";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { loadLevelsCatalog } from "@/lib/levels";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div
          aria-hidden="true"
          className="mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.5 0.15 160 / 0.25) 0%, transparent 70%)",
          }}
        >
          <span className="text-7xl animate-pulse">🌿</span>
        </div>
        <h1 className="text-6xl font-extrabold tracking-tight text-foreground">404</h1>
        <h2 className="mt-3 text-xl font-semibold text-foreground">
          Oops! This page wandered off
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The leaf you were looking for has drifted somewhere else. Let's get you back on track.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-all hover:scale-[1.03] hover:bg-primary/90 active:scale-[0.97]"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0d1f1c" },
      { title: "CarbonSense — Sense the change. Make it count." },
      {
        name: "description",
        content:
          "CarbonSense is the premium climate habit app. Auto-track your footprint and turn reduction into a daily streak.",
      },
      { property: "og:title", content: "CarbonSense" },
      {
        property: "og:description",
        content: "Sense the change. Make it count.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: responsiveCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
        >
          Skip to main content
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useAuthListener();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    loadLevelsCatalog().catch((error) => {
      console.warn("Levels catalog unavailable; level UI will use placeholders.", error);
    });
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useBodyScrollLock(mobileNavOpen);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileNavOpen]);

  const showAppNav = !["/", "/login", "/signup", "/onboarding", "/auth/callback"].includes(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      <UnitsProvider>
        <AppGate>
          <CopilotProvider enabled={showAppNav}>
            {showAppNav ? (
              <MobileNavProvider openMobileNav={() => setMobileNavOpen(true)}>
                <div className="app-layout">
                  <DesktopSidebarNav pathname={pathname} />
                  <div id="main-content" className="main-content app-shell-content">
                    <ErrorBoundary resetKey={pathname}>
                      <Outlet />
                    </ErrorBoundary>
                  </div>
                  <MobileNavDrawer
                    open={mobileNavOpen}
                    pathname={pathname}
                    onClose={() => setMobileNavOpen(false)}
                  />
                </div>
              </MobileNavProvider>
            ) : (
              <div id="main-content" className="main-content">
                <ErrorBoundary resetKey={pathname}>
                  <Outlet />
                </ErrorBoundary>
              </div>
            )}
          </CopilotProvider>
        </AppGate>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "oklch(0.22 0.035 180 / 0.9)",
              color: "oklch(0.97 0.01 150)",
              border: "1px solid oklch(1 0 0 / 0.1)",
              backdropFilter: "blur(20px)",
              borderRadius: "14px",
              fontFamily: "Plus Jakarta Sans, sans-serif",
              fontSize: "14px",
            },
          }}
        />
      </UnitsProvider>
    </QueryClientProvider>
  );
}

const APP_NAV_ITEMS = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/challenges", label: "Challenges", icon: Trophy },
  { to: "/impact", label: "Impact", icon: Leaf },
  { to: "/profile", label: "Profile", icon: UserCircle },
] as const;

function DesktopSidebarNav({ pathname }: { pathname: string }) {
  return (
    <aside className="sidebar-nav" aria-label="Primary navigation">
      <Link to="/home" className="mb-5 flex items-center gap-3 px-2 text-base font-bold">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-300 text-emerald-950">
          <Leaf className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="tracking-tight">CarbonSense</span>
      </Link>

      <nav className="flex flex-col gap-1.5">
        {APP_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={[
                "flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition",
                active
                  ? "bg-gradient-to-r from-emerald-400 to-teal-300 text-emerald-950 shadow-[0_16px_40px_-24px_rgba(45,212,191,0.9)]"
                  : "text-emerald-50/70 hover:bg-white/[0.06] hover:text-emerald-50",
              ].join(" ")}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function MobileNavDrawer({
  open,
  pathname,
  onClose,
}: {
  open: boolean;
  pathname: string;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="mobile-nav-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm lg:hidden"
            aria-hidden="true"
          />
          <motion.aside
            key="mobile-nav-drawer"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            role="dialog"
            aria-label="Primary navigation"
            className="fixed inset-y-0 left-0 z-[71] flex w-72 max-w-[85vw] flex-col gap-2 border-r border-white/10 bg-[oklch(0.18_0.03_180)] p-5 shadow-2xl lg:hidden"
          >
            <div className="mb-2 flex items-center justify-between">
              <Link
                to="/home"
                onClick={onClose}
                className="flex items-center gap-2 text-base font-bold"
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-300 text-emerald-950">
                  <Leaf className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="tracking-tight">CarbonSense</span>
              </Link>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close navigation"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-foreground transition hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="mt-2 flex flex-col gap-1.5">
              {APP_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition",
                      active
                        ? "bg-gradient-to-r from-emerald-400 to-teal-300 text-emerald-950 shadow-[0_16px_40px_-24px_rgba(45,212,191,0.9)]"
                        : "text-emerald-50/70 hover:bg-white/[0.06] hover:text-emerald-50",
                    ].join(" ")}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
