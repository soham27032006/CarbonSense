import { Leaf } from "lucide-react";
import { motion } from "framer-motion";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
}

export function Logo({ size = "md", showTagline = false }: LogoProps) {
  const sizes = {
    sm: { icon: "h-5 w-5", text: "text-lg", wrap: "gap-2" },
    md: { icon: "h-7 w-7", text: "text-2xl", wrap: "gap-2.5" },
    lg: { icon: "h-10 w-10", text: "text-4xl", wrap: "gap-3" },
  } as const;
  const s = sizes[size];

  return (
    <div className="flex flex-col items-center">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`flex items-center ${s.wrap}`}
      >
        <span className="grid place-items-center rounded-2xl gradient-primary p-2 shadow-glow">
          <Leaf className={`${s.icon} text-primary-foreground`} strokeWidth={2.4} />
        </span>
        <span className={`${s.text} font-bold tracking-tight text-gradient`}>
          CarbonSense
        </span>
      </motion.div>
      {showTagline && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mt-3 text-sm text-muted-foreground tracking-wide"
        >
          Sense the change. Make it count.
        </motion.p>
      )}
    </div>
  );
}
