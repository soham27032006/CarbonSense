// Rough carbon footprint estimation for the onboarding quiz.
// Returns tons CO2 / year, derived "carbon age", percentile vs US average,
// and the user's highest-impact category for track suggestion.

export type Transport = "car" | "public_transit" | "bike" | "wfh" | "mixed";
export type Diet = "daily" | "few_times_week" | "rarely" | "never";
export type Spending = "under_2k" | "2k_to_5k" | "5k_to_10k" | "over_10k";
export type Travel = "never" | "1_2_yearly" | "monthly" | "weekly";
export type Motivation = "save_money" | "reduce_anxiety" | "family_values" | "community";

export interface QuizAnswers {
  transport: Transport;
  diet: Diet;
  spending: Spending;
  travel: Travel;
  motivation: Motivation;
  household_size?: number;
  country?: string;
}

export interface QuizResult {
  carbon_age: number;
  annual_co2: number; // tons
  us_average: number;
  paris_target: number;
  percentile: number; // % of US population they're better than
  top_category: "food" | "transport" | "travel" | "consumption";
  message: string;
  category_breakdown: Record<"transport" | "food" | "travel" | "consumption", number>;
}

const TRANSPORT_TONS: Record<Transport, number> = {
  car: 4.6,
  mixed: 2.8,
  public_transit: 1.6,
  bike: 0.4,
  wfh: 0.6,
};

const DIET_TONS: Record<Diet, number> = {
  daily: 3.3,
  few_times_week: 2.1,
  rarely: 1.2,
  never: 0.9,
};

const SPENDING_TONS: Record<Spending, number> = {
  under_2k: 1.8,
  "2k_to_5k": 3.4,
  "5k_to_10k": 5.6,
  over_10k: 8.2,
};

const TRAVEL_TONS: Record<Travel, number> = {
  never: 0,
  "1_2_yearly": 1.4,
  monthly: 6.8,
  weekly: 18.0,
};

export function calculateFootprint(a: QuizAnswers): QuizResult {
  const transport = TRANSPORT_TONS[a.transport];
  const food = DIET_TONS[a.diet];
  const consumption = SPENDING_TONS[a.spending];
  const travel = TRAVEL_TONS[a.travel];

  const household = Math.max(1, a.household_size ?? 1);
  // shared household consumption only partially shared
  const annual = transport + food + travel + consumption / Math.sqrt(household);
  const rounded = Math.round(annual * 10) / 10;

  const us_average = 16;
  const paris_target = 4;

  // Carbon age: 25 baseline at Paris target, +1 per ~0.6 tons over.
  const carbon_age = Math.max(18, Math.min(85, Math.round(25 + (annual - paris_target) / 0.6)));

  // Percentile: roughly normal around 16 (sd ~6). Higher = greener.
  const z = (us_average - annual) / 6;
  const percentile = Math.max(1, Math.min(99, Math.round(50 + z * 25)));

  const breakdown = { transport, food, travel, consumption };
  const top_category = (Object.entries(breakdown).sort((x, y) => y[1] - x[1])[0][0]) as QuizResult["top_category"];

  let message: string;
  if (annual < paris_target) {
    message = "Incredible — you're already living below the Paris target.";
  } else if (annual < us_average * 0.75) {
    message = "Great start — you're well below the US average.";
  } else if (annual < us_average) {
    message = "You're around the average. Small shifts add up fast.";
  } else {
    message = "Don't worry — small changes make a big difference.";
  }

  return {
    carbon_age,
    annual_co2: rounded,
    us_average,
    paris_target,
    percentile,
    top_category,
    message,
    category_breakdown: breakdown,
  };
}
