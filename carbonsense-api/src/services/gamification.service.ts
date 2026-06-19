import { supabaseAdmin } from "../config/supabase";
import type { Achievement } from "../types";

export type LevelResult = {
  level: number;
  level_name: string;
};

export type AddXpResult = {
  new_xp: number;
  new_level: number;
  level_name: string;
  xp_to_next_level: number;
  level_up: boolean;
};

export const LEVEL_THRESHOLDS = [
  0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500
] as const;

export const LEVEL_NAMES = [
  "Carbon Curious",
  "Carbon Aware",
  "Carbon Conscious",
  "Carbon Reducer",
  "Carbon Champion",
  "Carbon Hero",
  "Carbon Warrior",
  "Carbon Legend",
  "Carbon Neutral Star",
  "Climate Guardian"
] as const;

export function getLevelForXp(xp: number): LevelResult {
  let thresholdIndex = 0;

  for (let index = 0; index < LEVEL_THRESHOLDS.length; index += 1) {
    if (xp >= LEVEL_THRESHOLDS[index]) {
      thresholdIndex = index;
    }
  }

  return {
    level: thresholdIndex + 1,
    level_name: LEVEL_NAMES[thresholdIndex]
  };
}

export function getXpToNextLevel(xp: number): number {
  const nextThreshold = LEVEL_THRESHOLDS.find((threshold) => threshold > xp);
  return nextThreshold ? nextThreshold - xp : 0;
}

export async function addXP(
  userId: string,
  amount: number
): Promise<AddXpResult> {
  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("xp,level")
    .eq("id", userId)
    .single<{ xp: number; level: number }>();

  if (userError || !user) {
    throw new Error("Unable to load user XP");
  }

  const newXp = user.xp + amount;
  const nextLevel = getLevelForXp(newXp);
  const levelUp = nextLevel.level > user.level;

  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({
      xp: newXp,
      level: nextLevel.level,
      level_name: nextLevel.level_name
    })
    .eq("id", userId);

  if (updateError) {
    throw new Error("Unable to update user XP");
  }

  return {
    new_xp: newXp,
    new_level: nextLevel.level,
    level_name: nextLevel.level_name,
    xp_to_next_level: getXpToNextLevel(newXp),
    level_up: levelUp
  };
}

export async function checkAchievements(userId: string): Promise<Achievement[]> {
  const [userState, completedCount, carbonSavedKg, achievements, earnedIds] =
    await Promise.all([
      getUserAchievementState(userId),
      getCompletedChallengeCount(userId),
      getCompletedCarbonSaved(userId),
      getAllEarnableAchievements(),
      getEarnedAchievementIds(userId)
    ]);

  const newlyEarned = achievements.filter((achievement) => {
    if (earnedIds.has(achievement.id)) {
      return false;
    }

    if (achievement.condition_type === "streak") {
      return userState.streak_count >= achievement.threshold;
    }

    if (achievement.condition_type === "challenges_completed") {
      return completedCount >= achievement.threshold;
    }

    if (achievement.condition_type === "carbon_saved") {
      return carbonSavedKg >= achievement.threshold;
    }

    if (achievement.condition_type === "level") {
      return userState.level >= achievement.threshold;
    }

    return false;
  });

  if (newlyEarned.length === 0) {
    return [];
  }

  const { error: insertError } = await supabaseAdmin
    .from("user_achievements")
    .insert(
      newlyEarned.map((achievement) => ({
        user_id: userId,
        achievement_id: achievement.id
      }))
    );

  if (insertError) {
    throw new Error("Unable to save earned achievements");
  }

  const bonusXp = newlyEarned.reduce(
    (total, achievement) => total + achievement.xp_reward,
    0
  );

  if (bonusXp > 0) {
    await addXP(userId, bonusXp);
  }

  return newlyEarned;
}

export async function getProgress(userId: string) {
  const [
    { data: user, error: userError },
    completedCount,
    carbonSavedKg,
    { count: totalAchievements },
    { count: achievementsEarned }
  ] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select("level,level_name,xp,streak_count,streak_max,streak_freeze_available")
      .eq("id", userId)
      .single<{
        level: number;
        level_name: string;
        xp: number;
        streak_count: number;
        streak_max: number;
        streak_freeze_available: boolean;
      }>(),
    getCompletedChallengeCount(userId),
    getCompletedCarbonSaved(userId),
    supabaseAdmin
      .from("achievements")
      .select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("user_achievements")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
  ]);

  if (userError || !user) {
    throw new Error("Unable to load gamification progress");
  }

  return {
    level: user.level,
    level_name: user.level_name,
    xp: user.xp,
    xp_to_next: getXpToNextLevel(user.xp),
    streak: user.streak_count,
    streak_max: user.streak_max,
    freeze_available: user.streak_freeze_available,
    achievements_earned: achievementsEarned ?? 0,
    total_achievements: totalAchievements ?? 0,
    challenges_completed: completedCount,
    total_carbon_saved_kg: Math.round(carbonSavedKg * 100) / 100
  };
}

export async function getAllAchievementsWithUserProgress(userId: string) {
  const [{ data: achievements, error }, earnedIds] = await Promise.all([
    supabaseAdmin.from("achievements").select("*").order("threshold", {
      ascending: true
    }),
    getEarnedAchievementIds(userId)
  ]);

  if (error || !achievements) {
    throw new Error("Unable to load achievements");
  }

  return {
    achievements: (achievements as Achievement[]).map((achievement) => ({
      ...achievement,
      earned: earnedIds.has(achievement.id)
    })),
    earned_count: earnedIds.size,
    total_count: achievements.length
  };
}

async function getUserAchievementState(userId: string): Promise<{
  streak_count: number;
  level: number;
}> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("streak_count,level")
    .eq("id", userId)
    .single<{ streak_count: number; level: number }>();

  if (error || !data) {
    throw new Error("Unable to load achievement state");
  }

  return data;
}

async function getAllEarnableAchievements(): Promise<Achievement[]> {
  const { data, error } = await supabaseAdmin
    .from("achievements")
    .select("*")
    .in("condition_type", [
      "streak",
      "challenges_completed",
      "carbon_saved",
      "level"
    ]);

  if (error || !data) {
    throw new Error("Unable to load achievements");
  }

  return data as Achievement[];
}

async function getEarnedAchievementIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("user_achievements")
    .select("achievement_id")
    .eq("user_id", userId);

  if (error) {
    throw new Error("Unable to load earned achievements");
  }

  return new Set((data ?? []).map((row) => row.achievement_id));
}

async function getCompletedChallengeCount(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("user_challenges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "completed");

  if (error) {
    throw new Error("Unable to count completed challenges");
  }

  return count ?? 0;
}

async function getCompletedCarbonSaved(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("user_challenges")
    .select("challenge_id")
    .eq("user_id", userId)
    .eq("status", "completed");

  if (error || !data || data.length === 0) {
    return 0;
  }

  const challengeIds = data.map((row) => row.challenge_id);
  const { data: challenges, error: challengesError } = await supabaseAdmin
    .from("challenges")
    .select("carbon_save_kg")
    .in("id", challengeIds);

  if (challengesError || !challenges) {
    throw new Error("Unable to load completed challenge savings");
  }

  return challenges.reduce(
    (total, challenge) => total + Number(challenge.carbon_save_kg),
    0
  );
}
