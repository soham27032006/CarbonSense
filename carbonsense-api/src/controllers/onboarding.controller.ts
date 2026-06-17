import type { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middleware/errorHandler";
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

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  return req.user.id;
}

export async function submitOnboardingQuiz(
  req: Request,
  res: Response
): Promise<void> {
  const userId = requireUserId(req);
  const quizData = onboardingQuizSchema.parse(req.body);
  const categoryBreakdown = getCategoryBreakdown(quizData);
  const estimatedAnnualTons = calculateCarbonFromOnboarding(quizData);
  const carbonAge = calculateCarbonAge(
    quizData.biological_age,
    estimatedAnnualTons,
    quizData.country
  );
  const percentile = getPercentile(estimatedAnnualTons, quizData.country);
  const highestCategory = getHighestCarbonCategory(categoryBreakdown);
  const onboardingData = {
    ...quizData,
    estimated_annual_tons: estimatedAnnualTons,
    percentile,
    category_breakdown: categoryBreakdown,
    highest_carbon_category: highestCategory
  };

  const { error } = await supabaseAdmin
    .from("users")
    .update({
      onboarding_data: onboardingData,
      carbon_age: carbonAge
    })
    .eq("id", userId);

  if (error) {
    throw new AppError(error.message, 500, "ONBOARDING_SAVE_FAILED");
  }

  res.status(200).json({
    success: true,
    estimated_annual_tons: estimatedAnnualTons,
    carbon_age: carbonAge,
    percentile,
    category_breakdown: categoryBreakdown
  });
}

export async function completeOnboarding(
  req: Request,
  res: Response
): Promise<void> {
  const userId = requireUserId(req);
  const { selected_track: selectedTrack } = completeOnboardingSchema.parse(req.body ?? {});
  await ensureChallengesSeeded();
  const { data: userProfile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("onboarding_data")
    .eq("id", userId)
    .single<{ onboarding_data: { highest_carbon_category?: string } }>();

  if (profileError) {
    throw new AppError(profileError.message, 404, "PROFILE_NOT_FOUND");
  }

  const highestCategory = userProfile.onboarding_data.highest_carbon_category;
  const inferredCategory = toChallengeCategory(
    highestCategory === "food" ||
      highestCategory === "transport" ||
      highestCategory === "home" ||
      highestCategory === "shopping" ||
      highestCategory === "travel"
      ? highestCategory
      : "shopping"
  );
  const challengeCategory =
    selectedTrack === "food_first"
      ? "food"
      : selectedTrack === "commute_conscious"
      ? "transport"
      : inferredCategory;

  const { data: categoryChallenge, error: challengeError } = await supabaseAdmin
    .from("challenges")
    .select("*")
    .eq("is_active", true)
    .eq("category", challengeCategory)
    .order("difficulty", { ascending: true })
    .limit(1)
    .maybeSingle<Challenge>();

  if (challengeError) {
    throw new AppError(challengeError.message, 500, "CHALLENGE_LOOKUP_FAILED");
  }

  const firstChallenge = categoryChallenge
    ? categoryChallenge
    : await getFallbackChallenge();

  if (!firstChallenge) {
    throw new AppError("No active challenges available", 404, "CHALLENGE_NOT_FOUND");
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error: assignmentError } = await supabaseAdmin
    .from("user_challenges")
    .insert({
      user_id: userId,
      challenge_id: firstChallenge.id,
      date_assigned: today,
      status: "pending"
    });

  if (assignmentError) {
    throw new AppError(
      assignmentError.message,
      500,
      "FIRST_CHALLENGE_ASSIGN_FAILED"
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({ onboarding_complete: true })
    .eq("id", userId);

  if (updateError) {
    throw new AppError(updateError.message, 500, "ONBOARDING_COMPLETE_FAILED");
  }

  res.status(200).json({
    success: true,
    first_challenge: firstChallenge
  });
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
