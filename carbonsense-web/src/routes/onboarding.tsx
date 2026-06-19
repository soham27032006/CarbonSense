import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import { ArrowLeft, ArrowRight, Leaf, Loader2, Lock, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({ meta: [{ title: "Onboarding — CarbonSense" }] }),
  component: OnboardingPage,
});

// ---------- types ----------

type Transport = "car" | "public_transit" | "bike" | "wfh" | "mixed";
type Diet = "daily" | "few_times_week" | "rarely" | "never";
type Spending = "under_2k" | "2k_to_5k" | "5k_to_10k" | "over_10k";
type Travel = "never" | "1_2_yearly" | "monthly" | "weekly";
type Motivation = "save_money" | "reduce_anxiety" | "family_values" | "community";

interface Answers {
  transport?: Transport;
  diet?: Diet;
  spending?: Spending;
  travel?: Travel;
  motivation?: Motivation;
}

interface QuizResult {
  carbon_age: number;
  annual_co2: number;
  us_average: number;
  paris_target: number;
  percentile: number;
  top_category: "food" | "transport" | "travel" | "consumption";
  message: string;
}

interface OptionDef<V extends string> {
  value: V;
  emoji: string;
  label: string;
  hint?: string;
}

// ---------- option data ----------

const TRANSPORT: OptionDef<Transport>[] = [
  { value: "car", emoji: "🚗", label: "I drive" },
  { value: "public_transit", emoji: "🚌", label: "Public transit" },
  { value: "bike", emoji: "🚲", label: "Bike or walk" },
  { value: "wfh", emoji: "🏠", label: "Work from home" },
  { value: "mixed", emoji: "🔄", label: "Mix of everything" },
];

const DIET: OptionDef<Diet>[] = [
  { value: "daily", emoji: "🥩", label: "Every day" },
  { value: "few_times_week", emoji: "🍗", label: "A few times a week" },
  { value: "rarely", emoji: "🥗", label: "Rarely" },
  { value: "never", emoji: "🌱", label: "Never — I'm plant-based" },
];

const SPENDING: OptionDef<Spending>[] = [
  { value: "under_2k", emoji: "💵", label: "Under $2,000" },
  { value: "2k_to_5k", emoji: "💰", label: "Between $2K–$5K" },
  { value: "5k_to_10k", emoji: "💳", label: "$5K–$10K" },
  { value: "over_10k", emoji: "💎", label: "Over $10K" },
];

const TRAVEL: OptionDef<Travel>[] = [
  { value: "never", emoji: "🚫", label: "Never" },
  { value: "1_2_yearly", emoji: "✈️", label: "Once or twice a year" },
  { value: "monthly", emoji: "🛫", label: "Monthly" },
  { value: "weekly", emoji: "🌍", label: "Weekly" },
];

const MOTIVATION: OptionDef<Motivation>[] = [
  { value: "save_money", emoji: "💰", label: "Save money while saving the planet" },
  { value: "reduce_anxiety", emoji: "😌", label: "Reduce my climate anxiety" },
  { value: "family_values", emoji: "👨‍👩‍👧", label: "Set an example for my family" },
  { value: "community", emoji: "🤝", label: "Be part of a community" },
];

const TOTAL_STEPS = 6;

// ---------- page ----------

function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    if (user?.onboarding_complete) {
      void navigate({ to: "/home", replace: true });
      return;
    }

    api
      .get<{ profile?: { onboarding_complete?: boolean | null } }>("/auth/me")
      .then(({ data }) => {
        if (data.profile?.onboarding_complete) {
          if (user) {
            setUser({ ...user, onboarding_complete: true });
          }
          void navigate({ to: "/home", replace: true });
        }
      })
      .catch(() => {
        void navigate({ to: "/login", replace: true });
      });
  }, [navigate, setUser, user]);

  const goNext = () => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };
  const goBack = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  const submitQuiz = async () => {
    setLoadingResult(true);
    setDirection(1);
    setStep(TOTAL_STEPS); // reveal screen
    try {
      const { data } = await api.post<QuizResult>("/onboarding/quiz", {
        transport_mode: answers.transport,
        meat_frequency: answers.diet,
        monthly_spending: answers.spending,
        flight_frequency: answers.travel,
        motivation: answers.motivation,
        household_size: 1,
        country: "US",
      });
      // tiny dramatic delay so the spinner is felt
      await new Promise((r) => setTimeout(r, 1100));
      setResult(data);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't calculate your footprint. Try again.");
      setStep(5);
    } finally {
      setLoadingResult(false);
    }
  };

  const chooseTrack = async (track: "food_first" | "commute_conscious" | "surprise_me") => {
    try {
      await api.post("/onboarding/complete", {
        selected_track: track,
        transport_mode: answers.transport,
        meat_frequency: answers.diet,
        monthly_spending: answers.spending,
        flight_frequency: answers.travel,
        motivation: answers.motivation,
        household_size: 1,
        country: "US",
      });
      toast.success("You're all set! Here's your first challenge 🌱");
      if (user) {
        setUser({
          ...user,
          onboarding_complete: true,
        });
      }
      navigate({ to: "/home" });
    } catch (e) {
      console.error(e);
      toast.error("Couldn't save your selection. Try again.");
    }
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <AmbientBackdrop />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 pb-12 pt-6 sm:px-8 lg:px-10">
        <TopBar
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={step > 0 && step < TOTAL_STEPS ? goBack : undefined}
        />

        <div className="relative mt-8 flex-1">
          <AnimatePresence mode="wait" custom={direction}>
            {step === 0 && (
              <Slide key="welcome" direction={direction}>
                <WelcomeStep onStart={goNext} />
              </Slide>
            )}
            {step === 1 && (
              <Slide key="transport" direction={direction}>
                <QuestionStep
                  index={1}
                  title="How do you usually get around?"
                  options={TRANSPORT}
                  value={answers.transport}
                  onChange={(v) => setAnswers((a) => ({ ...a, transport: v }))}
                  onNext={goNext}
                />
              </Slide>
            )}
            {step === 2 && (
              <Slide key="diet" direction={direction}>
                <QuestionStep
                  index={2}
                  title="How often do you eat meat?"
                  options={DIET}
                  value={answers.diet}
                  onChange={(v) => setAnswers((a) => ({ ...a, diet: v }))}
                  onNext={goNext}
                />
              </Slide>
            )}
            {step === 3 && (
              <Slide key="spending" direction={direction}>
                <QuestionStep
                  index={3}
                  title="What's your rough monthly spending?"
                  subtitle="This helps us estimate your consumption footprint"
                  footer={
                    <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <Lock className="h-3.5 w-3.5" />
                      We never see your actual bank balance
                    </div>
                  }
                  options={SPENDING}
                  value={answers.spending}
                  onChange={(v) => setAnswers((a) => ({ ...a, spending: v }))}
                  onNext={goNext}
                />
              </Slide>
            )}
            {step === 4 && (
              <Slide key="travel" direction={direction}>
                <QuestionStep
                  index={4}
                  title="How often do you fly?"
                  options={TRAVEL}
                  value={answers.travel}
                  onChange={(v) => setAnswers((a) => ({ ...a, travel: v }))}
                  onNext={goNext}
                />
              </Slide>
            )}
            {step === 5 && (
              <Slide key="motivation" direction={direction}>
                <QuestionStep
                  index={5}
                  title="What motivates you most?"
                  options={MOTIVATION}
                  value={answers.motivation}
                  onChange={(v) => setAnswers((a) => ({ ...a, motivation: v }))}
                  onNext={submitQuiz}
                  nextLabel="See my result"
                />
              </Slide>
            )}
            {step === TOTAL_STEPS && (
              <Slide key="reveal" direction={direction}>
                <RevealStep loading={loadingResult} result={result} onChooseTrack={chooseTrack} />
              </Slide>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}

// ---------- top bar / progress ----------

function TopBar({
  step,
  totalSteps,
  onBack,
}: {
  step: number;
  totalSteps: number;
  onBack?: () => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onBack}
        disabled={!onBack}
        aria-label="Back"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-foreground/80 transition hover:bg-white/10 disabled:opacity-0"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="flex flex-1 items-center gap-1.5">
        {Array.from({ length: totalSteps }).map((_, i) => {
          const filled = i < Math.min(step, totalSteps);
          const active = i === step;
          return (
            <div
              key={i}
              className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/8"
            >
              <motion.div
                initial={false}
                animate={{ width: filled ? "100%" : active ? "30%" : "0%" }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 to-teal-300"
              />
            </div>
          );
        })}
      </div>
      <div className="w-9" />
    </div>
  );
}

// ---------- slide wrapper ----------

function Slide({ children, direction }: { children: React.ReactNode; direction: 1 | -1 }) {
  return (
    <motion.div
      custom={direction}
      initial={{ opacity: 0, x: direction === 1 ? 60 : -60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: direction === 1 ? -60 : 60 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-0"
    >
      {children}
    </motion.div>
  );
}

// ---------- welcome ----------

function WelcomeStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative mb-10"
      >
        <motion.div
          aria-hidden
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 60, ease: "linear", repeat: Infinity }}
          className="absolute -inset-10 rounded-full bg-[conic-gradient(from_0deg,theme(colors.emerald.400/0.35),theme(colors.teal.300/0.15),theme(colors.sky.400/0.3),theme(colors.emerald.400/0.35))] blur-2xl"
        />
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="relative grid h-44 w-44 place-items-center rounded-full bg-gradient-to-br from-emerald-400 via-teal-400 to-sky-500 shadow-[0_30px_80px_-20px_rgba(16,185,129,0.55)]"
        >
          <div className="absolute inset-3 rounded-full bg-gradient-to-br from-emerald-500/60 to-teal-700/60 backdrop-blur-md" />
          <Leaf className="relative h-20 w-20 text-white drop-shadow-lg" strokeWidth={1.5} />
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              aria-hidden
              className="absolute inset-0 rounded-full border border-white/30"
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{ scale: 1.4 + i * 0.1, opacity: 0 }}
              transition={{ duration: 3, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
            />
          ))}
        </motion.div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="max-w-md text-balance text-4xl font-bold leading-tight sm:text-5xl"
      >
        Let's learn about your <span className="text-gradient">carbon footprint</span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
        className="mt-4 max-w-sm text-balance text-base text-muted-foreground"
      >
        5 quick questions to personalize your experience. Under 2 minutes.
      </motion.p>

      <motion.button
        type="button"
        onClick={onStart}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: [16, -6, 0] }}
        transition={{ delay: 0.55, duration: 0.7, times: [0, 0.6, 1] }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        className="mt-10 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 px-8 py-4 text-base font-semibold text-emerald-950 shadow-[0_20px_50px_-15px_rgba(45,212,191,0.7)] transition hover:shadow-[0_25px_60px_-15px_rgba(45,212,191,0.9)]"
      >
        Let's Go
        <ArrowRight className="h-5 w-5" />
      </motion.button>
    </div>
  );
}

// ---------- question ----------

function QuestionStep<V extends string>({
  index,
  title,
  subtitle,
  options,
  value,
  onChange,
  onNext,
  nextLabel = "Next",
  footer,
}: {
  index: number;
  title: string;
  subtitle?: string;
  options: OptionDef<V>[];
  value: V | undefined;
  onChange: (v: V) => void;
  onNext: () => void;
  nextLabel?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05 }}
        className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-300/80"
      >
        Question {index} of 5
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-2 text-balance text-3xl font-bold leading-tight sm:text-4xl"
      >
        {title}
      </motion.h2>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-3 text-sm text-muted-foreground"
        >
          {subtitle}
        </motion.p>
      )}

      <div className="onboarding-options mt-8">
        {options.map((opt, i) => {
          const selected = value === opt.value;
          return (
            <motion.button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 + i * 0.05, duration: 0.35 }}
              whileTap={{ scale: 0.985 }}
              className={[
                "onboarding-option-card group relative flex items-center gap-4 overflow-hidden rounded-2xl border px-5 py-4 text-left transition",
                selected
                  ? "border-emerald-300/70 bg-emerald-400/10 shadow-[0_15px_40px_-15px_rgba(45,212,191,0.5)]"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]",
              ].join(" ")}
            >
              <span
                className={[
                  "grid h-12 w-12 flex-none place-items-center rounded-xl text-2xl transition",
                  selected ? "bg-emerald-400/20" : "bg-white/5",
                ].join(" ")}
              >
                {opt.emoji}
              </span>
              <span className="flex-1 text-base font-medium">{opt.label}</span>
              <motion.span
                aria-hidden
                initial={false}
                animate={{
                  scale: selected ? 1 : 0,
                  opacity: selected ? 1 : 0,
                }}
                transition={{ type: "spring", stiffness: 380, damping: 22 }}
                className="grid h-7 w-7 flex-none place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-teal-400 text-emerald-950"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <path
                    d="M5 10.5l3 3 7-7.5"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.span>
            </motion.button>
          );
        })}
      </div>

      {footer}

      <AnimatePresence>
        {value && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.25 }}
            className="mt-8"
          >
            <button
              type="button"
              onClick={onNext}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 px-6 py-4 text-base font-semibold text-emerald-950 shadow-[0_20px_50px_-15px_rgba(45,212,191,0.7)] transition hover:scale-[1.01] active:scale-[0.99]"
            >
              {nextLabel}
              <ArrowRight className="h-5 w-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- reveal ----------

function RevealStep({
  loading,
  result,
  onChooseTrack,
}: {
  loading: boolean;
  result: QuizResult | null;
  onChooseTrack: (t: "food_first" | "commute_conscious" | "surprise_me") => void;
}) {
  if (loading || !result) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-emerald-400/30 to-teal-300/10"
        >
          <Loader2 className="h-10 w-10 animate-spin text-emerald-300" />
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-6 text-lg font-medium"
        >
          Calculating your carbon footprint…
        </motion.p>
        <p className="mt-1 text-sm text-muted-foreground">
          Crunching transport, diet, travel and consumption.
        </p>
      </div>
    );
  }

  return <RevealResult result={result} onChooseTrack={onChooseTrack} />;
}

function RevealResult({
  result,
  onChooseTrack,
}: {
  result: QuizResult;
  onChooseTrack: (t: "food_first" | "commute_conscious" | "surprise_me") => void;
}) {
  const tracks = useMemo(() => {
    const recommended: "food_first" | "commute_conscious" =
      result.top_category === "food"
        ? "food_first"
        : result.top_category === "transport" || result.top_category === "travel"
        ? "commute_conscious"
        : "food_first";
    return [
      {
        id: "food_first" as const,
        emoji: "🍽",
        label: "Food First",
        desc: "Swap meals, save tons.",
      },
      {
        id: "commute_conscious" as const,
        emoji: "🚗",
        label: "Commute Conscious",
        desc: "Greener miles, every day.",
      },
      {
        id: "surprise_me" as const,
        emoji: "🎲",
        label: "Surprise Me",
        desc: "We'll pick a great first challenge.",
      },
    ].map((t) => ({ ...t, recommended: t.id === recommended }));
  }, [result.top_category]);

  return (
    <div className="flex h-full flex-col">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="carbon-age-reveal relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl sm:p-8"
      >
        <div className="absolute -top-24 right-0 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-teal-300/15 blur-3xl" />

        <p className="relative text-xs font-medium uppercase tracking-[0.18em] text-emerald-300/80">
          Your result
        </p>
        <p className="relative mt-2 text-sm text-muted-foreground">Your Carbon Age</p>
        <div className="relative mt-1 flex items-baseline gap-3">
          <CountUp value={result.carbon_age} className="text-7xl font-bold text-gradient sm:text-8xl" />
          <Sparkles className="h-6 w-6 text-emerald-300" />
        </div>

        <p className="relative mt-4 text-base text-muted-foreground">
          Your estimated annual footprint:{" "}
          <span className="font-semibold text-foreground">{result.annual_co2} tons CO₂</span>
        </p>

        <ComparisonBar
          user={result.annual_co2}
          usAverage={result.us_average}
          parisTarget={result.paris_target}
        />

        <p className="relative mt-5 text-sm text-muted-foreground">
          You're greener than{" "}
          <span className="font-semibold text-emerald-300">{result.percentile}%</span> of people in the US.
        </p>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="relative mt-3 text-base font-medium"
        >
          {result.message}
        </motion.p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="mt-8"
      >
        <h3 className="text-xl font-bold">Choose your first challenge track</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          We'll start you somewhere you can win quickly.
        </p>

        <div className="onboarding-options track-grid mt-5">
          {tracks.map((t, i) => (
            <motion.button
              key={t.id}
              type="button"
              onClick={() => onChooseTrack(t.id)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 + i * 0.08 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.97 }}
              className={[
                "onboarding-option-card relative flex flex-col items-start gap-2 overflow-hidden rounded-2xl border p-5 text-left transition",
                t.recommended
                  ? "border-emerald-300/60 bg-emerald-400/10 shadow-[0_20px_50px_-20px_rgba(45,212,191,0.55)]"
                  : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]",
              ].join(" ")}
            >
              {t.recommended && (
                <span className="absolute right-3 top-3 rounded-full bg-emerald-300/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-950">
                  For you
                </span>
              )}
              <span className="text-3xl">{t.emoji}</span>
              <span className="text-base font-semibold">{t.label}</span>
              <span className="text-xs text-muted-foreground">{t.desc}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ---------- bits ----------

function ComparisonBar({
  user,
  usAverage,
  parisTarget,
}: {
  user: number;
  usAverage: number;
  parisTarget: number;
}) {
  const max = Math.max(user, usAverage) * 1.15;
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;

  return (
    <div className="relative mt-6">
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/8">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: pct(user) }}
          transition={{ duration: 1.1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 to-teal-300"
        />
        <div
          aria-hidden
          className="absolute inset-y-0 w-px bg-emerald-300"
          style={{ left: pct(parisTarget) }}
        />
        <div
          aria-hidden
          className="absolute inset-y-0 w-px bg-amber-300"
          style={{ left: pct(usAverage) }}
        />
      </div>
      <div className="mt-3 flex justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-300" /> Paris target {parisTarget}t
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-300" /> US avg {usAverage}t
        </span>
      </div>
    </div>
  );
}

function CountUp({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v).toString());
  useMemo(() => {
    const controls = animate(mv, value, { duration: 1.4, ease: [0.22, 1, 0.36, 1] });
    return controls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <motion.span className={className}>{rounded}</motion.span>;
}

function AmbientBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 -left-20 h-[28rem] w-[28rem] rounded-full bg-emerald-500/15 blur-[120px]" />
      <div className="absolute -bottom-40 right-0 h-[26rem] w-[26rem] rounded-full bg-teal-400/15 blur-[120px]" />
      <div className="absolute top-1/3 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-500/10 blur-[100px]" />
    </div>
  );
}
