import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { CopilotPanel } from "./CopilotPanel";
import { CopilotFab } from "./CopilotFab";

interface CopilotCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

const Ctx = createContext<CopilotCtx | null>(null);

export function useCopilot() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCopilot must be used inside <CopilotProvider>");
  return c;
}

/** Like `useCopilot`, but returns null when no provider is mounted. Lets
 *  shared UI (e.g. the header sparkle button) degrade gracefully on routes
 *  that render outside <CopilotProvider> rather than crashing. */
export function useCopilotSafe() {
  return useContext(Ctx);
}

export function CopilotProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  return (
    <Ctx.Provider value={{ open, setOpen, toggle }}>
      {children}
      {enabled && <CopilotFab open={open} onToggle={toggle} hasInsight />}
      <AnimatePresence>
        {enabled && open && <CopilotPanel onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
