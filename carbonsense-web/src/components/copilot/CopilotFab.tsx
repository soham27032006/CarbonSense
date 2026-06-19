import { motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";

interface Props {
  open: boolean;
  onToggle: () => void;
  hasInsight?: boolean;
}

export function CopilotFab({ open, onToggle, hasInsight }: Props) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-label={open ? "Close AI Copilot" : "Open AI Copilot"}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 24, delay: 0.2 }}
      whileTap={{ scale: 0.92 }}
      className="copilot-fab fixed z-[60] grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-emerald-950 shadow-[0_18px_45px_-12px_rgba(16,185,129,0.7)] outline-none ring-0 transition-transform focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-16 sm:w-16"
    >
      {/* pulsing glow */}
      {!open && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-emerald-400/50"
          animate={{ scale: [1, 1.35, 1], opacity: [0.55, 0, 0.55] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
        />
      )}

      <motion.span
        key={open ? "close" : "spark"}
        initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="relative grid place-items-center"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </motion.span>

      {!open && hasInsight && (
        <span className="absolute right-1.5 top-1.5 h-3 w-3 rounded-full bg-amber-300 ring-2 ring-background" />
      )}
    </motion.button>
  );
}
