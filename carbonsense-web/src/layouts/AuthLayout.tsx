import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Logo } from "@/components/Logo";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-x-hidden">
      {/* Animated aurora orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-primary/25 blur-3xl animate-aurora" />
        <div className="absolute top-1/3 -right-32 h-[480px] w-[480px] rounded-full bg-accent/25 blur-3xl animate-aurora" />
        <div className="absolute -bottom-40 left-1/4 h-[360px] w-[360px] rounded-full bg-warm/15 blur-3xl animate-aurora" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-5 py-10">
        <Logo size="lg" showTagline />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5, ease: "easeOut" }}
          className="glass-strong mt-10 w-full rounded-3xl p-6 sm:p-8"
        >
          {children}
        </motion.div>
        <p className="mt-6 text-xs text-muted-foreground/70">
          By continuing you agree to our Terms & Privacy.
        </p>
      </div>
    </main>
  );
}
