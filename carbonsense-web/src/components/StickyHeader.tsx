import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Sparkles } from "lucide-react";
import { useMobileNav } from "@/components/MobileNavContext";
import { useAuthStore } from "@/stores/authStore";
import { useCopilotSafe } from "@/components/copilot/CopilotProvider";

function resolveFirstLetter(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed.slice(0, 1).toUpperCase() : "";
}

interface StickyHeaderProps {
  avatarName?: string;
  streak?: number;
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}

function MobileLogoTrigger({
  onOpen,
  iconOnly = false,
}: {
  onOpen: () => void;
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open navigation"
      className={[
        "flex items-center gap-2 text-sm font-bold transition hover:opacity-80 active:scale-95 lg:hidden",
        iconOnly ? "shrink-0" : "",
      ].join(" ")}
    >
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-300 text-emerald-950">
        ✦
      </span>
      {!iconOnly && <span className="tracking-tight hidden sm:inline">CarbonSense</span>}
    </button>
  );
}

function DefaultLeft({ onMobileOpen }: { onMobileOpen?: () => void }) {
  return (
    <>
      {onMobileOpen ? <MobileLogoTrigger onOpen={onMobileOpen} /> : null}
      <Link to="/home" className="hidden items-center gap-2 text-sm font-bold lg:flex">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-300 text-emerald-950">
          ✦
        </span>
        <span className="tracking-tight">CarbonSense</span>
      </Link>
    </>
  );
}

function StreakChip({ streak }: { streak: number }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1.5">
      <motion.span
        aria-hidden
        animate={{ scale: [1, 1.18, 0.95, 1.1, 1], rotate: [0, -6, 5, -3, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        className="text-base leading-none"
      >
        🔥
      </motion.span>
      <span className="text-sm font-semibold tabular-nums text-amber-200">{streak}</span>
    </div>
  );
}

function NotificationBell({
  count,
  showNotifications,
  onToggle,
  onClose,
  onJump,
  notifRef,
}: {
  count: number;
  showNotifications: boolean;
  onToggle: () => void;
  onClose: () => void;
  onJump: () => void;
  notifRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={notifRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={showNotifications}
        onClick={onToggle}
        className="relative grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 transition hover:bg-white/10"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-300" />
        )}
      </button>
      <AnimatePresence>
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute right-0 top-12 w-80 origin-top-right rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
              {count > 0 && (
                <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
                  {count} new
                </span>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onJump();
                }}
                className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition hover:bg-white/5"
              >
                <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
                  ✨
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Today's challenge is ready
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    A small swap can save a few kg of CO₂ — tap to see what today's action is.
                  </p>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function StickyHeader({ avatarName, streak, left, center, right }: StickyHeaderProps) {
  const navigate = useNavigate();
  const mobileNav = useMobileNav();
  const user = useAuthStore((s) => s.user);
  const copilot = useCopilotSafe();
  const avatarLetter = useMemo(() => {
    const explicit = resolveFirstLetter(avatarName);
    if (explicit) return explicit;
    const fromAuth = resolveFirstLetter(user?.full_name);
    if (fromAuth) return fromAuth;
    const fromEmail = resolveFirstLetter(user?.email);
    if (fromEmail) return fromEmail;
    return "?";
  }, [avatarName, user?.full_name, user?.email]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const unreadCount = 0;

  // Prefer an explicitly passed streak (live from a page query) so it stays
  // fresh after actions like accepting a challenge; otherwise fall back to the
  // auth store value hydrated on sign-in by useAuthListener.
  const effectiveStreak =
    typeof streak === "number"
      ? streak
      : typeof user?.streak === "number"
      ? user.streak
      : undefined;

  useEffect(() => {
    if (!showNotifications) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowNotifications(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showNotifications]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-[var(--header-height)] border-b border-white/5 bg-background/70 backdrop-blur-xl lg:left-[var(--sidebar-width)]">
      <div className="mx-auto flex h-full w-full max-w-2xl items-center justify-between gap-3 px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-2">
          {left ? (
            <>
              {mobileNav ? <MobileLogoTrigger onOpen={mobileNav.openMobileNav} iconOnly /> : null}
              {left}
            </>
          ) : (
            <DefaultLeft onMobileOpen={mobileNav?.openMobileNav} />
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
          {typeof effectiveStreak === "number" && (
            <StreakChip streak={effectiveStreak} />
          )}
          {center}
        </div>
        <div className="flex items-center gap-2">
          {right}
          {copilot && (
            <button
              type="button"
              aria-label={copilot.open ? "Close AI Copilot" : "Open AI Copilot"}
              aria-expanded={copilot.open}
              onClick={copilot.toggle}
              className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-emerald-950 transition hover:opacity-85 active:scale-95"
            >
              <Sparkles className="h-4 w-4" />
            </button>
          )}
          <NotificationBell
            count={unreadCount}
            showNotifications={showNotifications}
            onToggle={() => setShowNotifications((prev) => !prev)}
            onClose={() => setShowNotifications(false)}
            onJump={() => navigate({ to: "/challenges" })}
            notifRef={notifRef}
          />
          <button
            type="button"
            aria-label="Open profile"
            onClick={() => navigate({ to: "/profile" })}
            className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-xs font-bold uppercase text-emerald-950 transition hover:opacity-80 active:scale-95"
          >
            {avatarLetter}
          </button>
        </div>
      </div>
    </header>
  );
}
