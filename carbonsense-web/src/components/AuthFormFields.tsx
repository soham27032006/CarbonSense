import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
  error?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, icon, error, className = "", ...props }, ref) => {
    return (
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="relative block">
          {icon && (
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            {...props}
            className={`w-full rounded-2xl border border-white/10 bg-white/[0.04] py-3 ${
              icon ? "pl-11" : "pl-4"
            } pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-primary/60 focus:bg-white/[0.06] focus:ring-2 focus:ring-primary/30 ${className}`}
          />
        </span>
        {error && <span className="mt-1.5 block text-xs text-destructive">{error}</span>}
      </label>
    );
  },
);
Field.displayName = "Field";

export function PasswordStrength({ value }: { value: string }) {
  const score = computeStrength(value);
  const labels = ["Too weak", "Weak", "Okay", "Good", "Strong"];
  const colors = [
    "bg-destructive",
    "bg-destructive/80",
    "bg-warm",
    "bg-accent",
    "bg-primary",
  ];
  if (!value) return null;
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < score ? colors[score - 1] : "bg-white/10"
            }`}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{labels[Math.max(0, score - 1)]}</p>
    </div>
  );
}

function computeStrength(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(5, s);
}

export function GoogleButton({
  onClick,
  loading,
  label = "Continue with Google",
}: {
  onClick: () => void;
  loading?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] py-3 text-sm font-medium text-foreground transition hover:bg-white/[0.08] disabled:opacity-60"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="#EA4335"
          d="M12 10.2v3.96h5.52c-.24 1.44-1.68 4.2-5.52 4.2-3.32 0-6.04-2.76-6.04-6.16S8.68 6.04 12 6.04c1.88 0 3.16.8 3.88 1.48l2.64-2.56C16.84 3.4 14.64 2.4 12 2.4 6.72 2.4 2.4 6.72 2.4 12s4.32 9.6 9.6 9.6c5.56 0 9.24-3.92 9.24-9.44 0-.64-.08-1.12-.16-1.6L12 10.2z"
        />
      </svg>
      {label}
    </button>
  );
}

export function Divider({ text }: { text: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-white/10" />
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{text}</span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}
