/**
 * Controller layer for authenticated CarbonSense API requests. Validates request context, delegates business work to services, and returns stable response envelopes.
 */
import type { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middleware/errorHandler";
import { todayIndia } from "../utils/date";
import {
  calculateCarbonAge,
  calculateCarbonFromOnboarding,
  defaultBiologicalAge,
  getCategoryBreakdown,
  getHighestCarbonCategory,
  getPercentile,
  toChallengeCategory
} from "../services/carbon.service";
import type { Challenge } from "../types";

const bootstrapChallenges: Array<{
  title: string;
  description: string;
  category: "food" | "transport" | "home" | "shopping" | "lifestyle";
  difficulty: "easy" | "medium" | "hard";
  carbon_save_kg: number;
  xp_reward: number;
  tips: string[];
  icon: string;
}> = [
  {
    title: "Plant-Based Lunch",
    description: "Try a vegetarian or vegan lunch today",
    category: "food",
    difficulty: "easy",
    carbon_save_kg: 2.5,
    xp_reward: 15,
    tips: ["Choose a veggie bowl or lentil dish", "Keep it simple and filling"],
    icon: "food"
  },
  {
    title: "Walk or Bike Today",
    description: "Use human power for your commute or errands",
    category: "transport",
    difficulty: "easy",
    carbon_save_kg: 4.2,
    xp_reward: 20,
    tips: ["Swap one short trip", "Pick the easiest route first"],
    icon: "transport"
  },
  {
    title: "Thermostat Adjust",
    description: "Lower heating by 1C or raise cooling by 1C",
    category: "home",
    difficulty: "easy",
    carbon_save_kg: 3.0,
    xp_reward: 15,
    tips: ["Change it for the evening", "Pair it with a fan or extra layer"],
    icon: "home"
  },
  {
    title: "No-Buy Day",
    description: "Don't purchase anything non-essential today",
    category: "shopping",
    difficulty: "easy",
    carbon_save_kg: 3.5,
    xp_reward: 15,
    tips: ["Delay impulse buys by 24 hours", "Use what you already have"],
    icon: "shopping"
  },
  {
    title: "Learn Your Impact",
    description: "Read one article about carbon footprint reduction",
    category: "lifestyle",
    difficulty: "easy",
    carbon_save_kg: 0,
    xp_reward: 10,
    tips: ["Spend 10 minutes learning", "Write down one action you'll try"],
    icon: "lifestyle"
  }
];

const onboardingQuizSchema = z.object({
  transport_mode: z.enum(["car", "public_transit", "bike", "wfh", "mixed"]),
  meat_frequency: z.enum(["daily", "few_times_week", "rarely", "never"]),
  monthly_spending: z.enum(["under_2k", "2k_to_5k", "5k_to_10k", "over_10k"]),
  flight_frequency: z.enum(["never", "1_2_yearly", "monthly", "weekly"]),
  motivation: z.enum([
    "save_money",
    "reduce_anxiety",
    "family_values",
    "community"
  ]),
  household_size: z.number().int().min(1).max(10),
  country: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase())
    .default("US"),
  biological_age: z.number().int().min(1).max(120).default(defaultBiologicalAge)
});

const completeOnboardingSchema = z.object({
  selected_track: z
    .enum(["food_first", "commute_conscious", "surprise_me"])
    .optional()
});

type OnboardingQuizData = z.infer<typeof onboardingQuizSchema>;
type SelectedTrack = z.infer<typeof completeOnboardingSchema>["selected_track"];

type OnboardingSummary = {
  estimatedAnnualTons: number;
  carbonAge: number;
  percentile: number;
  categoryBreakdown: ReturnType<typeof getCategoryBreakdown>;
  onboardingData: OnboardingQuizData & {
    estimated_annual_tons: number;
    percentile: number;
    category_breakdown: ReturnType<typeof getCategoryBreakdown>;
    highest_carbon_category: string;
  };
};

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  return req.user.id;
}

function buildOnboardingSummary(quizData: OnboardingQuizData): OnboardingSummary {
  const categoryBreakdown = getCategoryBreakdown(quizData);
  const estimatedAnnualTons = calculateCarbonFromOnboarding(quizData);
  const carbonAge = calculateCarbonAge(quizData.biological_age, estimatedAnnualTons, quizData.country);
  const percentile = getPercentile(estimatedAnnualTons, quizData.country);
  const highestCategory = getHighestCarbonCategory(categoryBreakdown);

  return {
    estimatedAnnualTons,
    carbonAge,
    percentile,
    categoryBreakdown,
    onboardingData: {
      ...quizData,
      estimated_annual_tons: estimatedAnnualTons,
      percentile,
      category_breakdown: categoryBreakdown,
      highest_carbon_category: highestCategory
    }
  };
}

async function saveOnboardingSummary(userId: string, summary: OnboardingSummary): Promise<void> {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ onboarding_data: summary.onboardingData, carbon_age: summary.carbonAge })
    .eq("id", userId);

  if (error) throw new AppError(error.message, 500, "ONBOARDING_SAVE_FAILED");
}

async function getHighestSavedCategory(userId: string): Promise<string | undefined> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("onboarding_data")
    .eq("id", userId)
    .single<{ onboarding_data: { highest_carbon_category?: string } }>();

  if (error) throw new AppError(error.message, 404, "PROFILE_NOT_FOUND");
  return data.onboarding_data.highest_carbon_category;
}

function resolveChallengeCategory(selectedTrack: SelectedTrack, highestCategory: string | undefined) {
  const fallbackCategory = ["food", "transport", "home", "shopping", "travel"].includes(highestCategory ?? "")
    ? highestCategory
    : "shopping";
  const inferredCategory = toChallengeCategory(fallbackCategory as "food" | "transport" | "home" | "shopping" | "travel");

  if (selectedTrack === "food_first") return "food";
  if (selectedTrack === "commute_conscious") return "transport";
  return inferredCategory;
}

async function getChallengeForCategory(category: Challenge["category"]): Promise<Challenge | null> {
  const { data, error } = await supabaseAdmin
    .from("challenges")
    .select("*")
    .eq("is_active", true)
    .eq("category", category)
    .order("difficulty", { ascending: true })
    .limit(1)
    .maybeSingle<Challenge>();

  if (error) throw new AppError(error.message, 500, "CHALLENGE_LOOKUP_FAILED");
  return data;
}

async function assignFirstChallenge(userId: string, challengeId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("user_challenges").insert({
    user_id: userId,
    challenge_id: challengeId,
    date_assigned: todayIndia(),
    status: "pending"
  });

  if (error) throw new AppError(error.message, 500, "FIRST_CHALLENGE_ASSIGN_FAILED");
}

async function markOnboardingComplete(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ onboarding_complete: true })
    .eq("id", userId);

  if (error) throw new AppError(error.message, 500, "ONBOARDING_COMPLETE_FAILED");
}

/**
 * Handles the submitOnboardingQuiz API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function submitOnboardingQuiz(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const summary = buildOnboardingSummary(onboardingQuizSchema.parse(req.body));
  await saveOnboardingSummary(userId, summary);

  res.status(200).json({
    success: true,
    estimated_annual_tons: summary.estimatedAnnualTons,
    carbon_age: summary.carbonAge,
    percentile: summary.percentile,
    category_breakdown: summary.categoryBreakdown
  });
}

/**
 * Handles the completeOnboarding API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function completeOnboarding(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { selected_track: selectedTrack } = completeOnboardingSchema.parse(req.body ?? {});
  await ensureChallengesSeeded();

  const category = resolveChallengeCategory(selectedTrack, await getHighestSavedCategory(userId));
  const firstChallenge = (await getChallengeForCategory(category)) ?? (await getFallbackChallenge());
  if (!firstChallenge) throw new AppError("No active challenges available", 404, "CHALLENGE_NOT_FOUND");

  await assignFirstChallenge(userId, firstChallenge.id);
  await markOnboardingComplete(userId);
  res.status(200).json({ success: true, first_challenge: firstChallenge });
}

async function getFallbackChallenge(): Promise<Challenge | null> {
  const { data, error } = await supabaseAdmin
    .from("challenges")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle<Challenge>();

  if (error) {
    throw new AppError(error.message, 500, "CHALLENGE_LOOKUP_FAILED");
  }

  return data;
}

async function ensureChallengesSeeded(): Promise<void> {
  const { count, error } = await supabaseAdmin
    .from("challenges")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  if (error) {
    throw new AppError(error.message, 500, "CHALLENGE_LOOKUP_FAILED");
  }

  if ((count ?? 0) > 0) {
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from("challenges")
    .insert(bootstrapChallenges);

  if (insertError) {
    throw new AppError(insertError.message, 500, "CHALLENGE_BOOTSTRAP_FAILED");
  }
}
