import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
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

export function CopilotProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <Ctx.Provider value={{ open, setOpen, toggle }}>
      {children}
      <CopilotFab open={open} onToggle={toggle} hasInsight />
      <AnimatePresence>
        {open && <CopilotPanel onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
