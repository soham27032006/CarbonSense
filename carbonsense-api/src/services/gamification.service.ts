/**
 * Service layer for CarbonSense domain logic. Keeps persistence, third-party API calls, and calculations behind controller-safe functions.
 */
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

/**
 * Runs the getLevelForXp service workflow for CarbonSense domain data.
 * @param xp - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
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

/**
 * Runs the getXpToNextLevel service workflow for CarbonSense domain data.
 * @param xp - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export function getXpToNextLevel(xp: number): number {
  const nextThreshold = LEVEL_THRESHOLDS.find((threshold) => threshold > xp);
  return nextThreshold ? nextThreshold - xp : 0;
}

/**
 * Runs the addXP service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function addXP(
  userId: string,
  amount: number
): Promise<AddXpResult> {
  return await addXPWorkflow(userId, amount);
}

/**
 * Executes the extracted addXP service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `addXP`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
type UserXpState = { xp: number; level: number };

type XpUpdate = {
  newXp: number;
  nextLevel: LevelResult;
  levelUp: boolean;
};

async function addXPWorkflow(userId: string, amount: number): Promise<AddXpResult> {
  const update = calculateXpUpdate(await loadUserXpState(userId), amount);
  await saveUserXpState(userId, update);
  return buildAddXpResult(update);
}

/**
 * Loads the current XP and level for an XP update.
 * @returns Current XP state for the user.
 * @throws When the user XP row cannot be loaded.
 */
async function loadUserXpState(userId: string): Promise<UserXpState> {
  const { data: user, error } = await supabaseAdmin.from("users").select("xp,level").eq("id", userId).single<UserXpState>();
  if (error || !user) throw new Error("Unable to load user XP");
  return user;
}

/**
 * Calculates the next XP, level, and level-up flag.
 * @returns Computed XP update values.
 */
function calculateXpUpdate(user: UserXpState, amount: number): XpUpdate {
  const newXp = user.xp + amount;
  const nextLevel = getLevelForXp(newXp);
  return { newXp, nextLevel, levelUp: nextLevel.level > user.level };
}

/**
 * Persists the calculated XP update to the user row.
 * @throws When the XP update cannot be saved.
 */
async function saveUserXpState(userId: string, update: XpUpdate): Promise<void> {
  const { error } = await supabaseAdmin.from("users").update({ xp: update.newXp, level: update.nextLevel.level, level_name: update.nextLevel.level_name }).eq("id", userId);
  if (error) throw new Error("Unable to update user XP");
}

/**
 * Shapes the XP update result for callers.
 * @returns Public XP update result.
 */
function buildAddXpResult(update: XpUpdate): AddXpResult {
  return { new_xp: update.newXp, new_level: update.nextLevel.level, level_name: update.nextLevel.level_name, xp_to_next_level: getXpToNextLevel(update.newXp), level_up: update.levelUp };
}

/**
 * Runs the checkAchievements service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function checkAchievements(userId: string): Promise<Achievement[]> {
  return await checkAchievementsWorkflow(userId);
}

/**
 * Executes the extracted checkAchievements service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `checkAchievements`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
type AchievementInputs = {
  userState: { streak_count: number; level: number };
  completedCount: number;
  carbonSavedKg: number;
  achievements: Achievement[];
  earnedIds: Set<string>;
};

async function checkAchievementsWorkflow(userId: string): Promise<Achievement[]> {
  const newlyEarned = getNewlyEarnedAchievements(await loadAchievementInputs(userId));
  if (newlyEarned.length === 0) return [];

  await saveEarnedAchievements(userId, newlyEarned);
  await awardAchievementBonusXp(userId, newlyEarned);
  return newlyEarned;
}

/**
 * Loads the user state and achievement catalogs needed for eligibility checks.
 * @returns Achievement evaluation inputs.
 */
async function loadAchievementInputs(userId: string): Promise<AchievementInputs> {
  const [userState, completedCount, carbonSavedKg, achievements, earnedIds] = await Promise.all([
    getUserAchievementState(userId),
    getCompletedChallengeCount(userId),
    getCompletedCarbonSaved(userId),
    getAllEarnableAchievements(),
    getEarnedAchievementIds(userId)
  ]);
  return { userState, completedCount, carbonSavedKg, achievements, earnedIds };
}

/**
 * Filters achievements that satisfy their condition and are not already earned.
 * @returns Newly earned achievements only.
 */
function getNewlyEarnedAchievements(input: AchievementInputs): Achievement[] {
  return input.achievements.filter((achievement) => isAchievementNewlyEarned(achievement, input));
}

/**
 * Checks one achievement against the current user progress.
 * @returns Whether the achievement should be awarded.
 */
function isAchievementNewlyEarned(achievement: Achievement, input: AchievementInputs): boolean {
  if (input.earnedIds.has(achievement.id)) return false;
  if (achievement.condition_type === "streak") return input.userState.streak_count >= achievement.threshold;
  if (achievement.condition_type === "challenges_completed") return input.completedCount >= achievement.threshold;
  if (achievement.condition_type === "carbon_saved") return input.carbonSavedKg >= achievement.threshold;
  if (achievement.condition_type === "level") return input.userState.level >= achievement.threshold;
  return false;
}

/**
 * Saves newly earned achievements for a user.
 * @throws When earned achievements cannot be persisted.
 */
async function saveEarnedAchievements(userId: string, achievements: Achievement[]): Promise<void> {
  const { error } = await supabaseAdmin.from("user_achievements").insert(achievements.map((achievement) => ({ user_id: userId, achievement_id: achievement.id })));
  if (error) throw new Error("Unable to save earned achievements");
}

/**
 * Applies bonus XP for newly earned achievements.
 */
async function awardAchievementBonusXp(userId: string, achievements: Achievement[]): Promise<void> {
  const bonusXp = achievements.reduce((total, achievement) => total + achievement.xp_reward, 0);
  if (bonusXp > 0) await addXP(userId, bonusXp);
}

/**
 * Runs the getProgress service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getProgress(userId: string) {
  return await getProgressWorkflow(userId);
}

/**
 * Executes the extracted getProgress service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getProgress`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
type ProgressInputs = {
  user: {
    level: number;
    level_name: string;
    xp: number;
    streak_count: number;
    streak_max: number;
    streak_freeze_available: boolean;
  };
  completedCount: number;
  carbonSavedKg: number;
  totalAchievements: number;
  achievementsEarned: number;
};

async function getProgressWorkflow(userId: string) {
  return buildProgressResponse(await loadProgressInputs(userId));
}

/**
 * Loads all counters needed for gamification progress.
 * @returns Progress response inputs.
 * @throws When the user progress row cannot be loaded.
 */
async function loadProgressInputs(userId: string): Promise<ProgressInputs> {
  const [{ data: user, error: userError }, completedCount, carbonSavedKg, { count: totalAchievements }, { count: achievementsEarned }] = await Promise.all([
    supabaseAdmin.from("users").select("level,level_name,xp,streak_count,streak_max,streak_freeze_available").eq("id", userId).single<ProgressInputs["user"]>(),
    getCompletedChallengeCount(userId),
    getCompletedCarbonSaved(userId),
    supabaseAdmin.from("achievements").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("user_achievements").select("id", { count: "exact", head: true }).eq("user_id", userId)
  ]);
  if (userError || !user) throw new Error("Unable to load gamification progress");
  return { user, completedCount, carbonSavedKg, totalAchievements: totalAchievements ?? 0, achievementsEarned: achievementsEarned ?? 0 };
}

/**
 * Shapes loaded counters into the public progress response.
 * @returns Gamification progress payload.
 */
function buildProgressResponse(input: ProgressInputs) {
  return { level: input.user.level, level_name: input.user.level_name, xp: input.user.xp, xp_to_next: getXpToNextLevel(input.user.xp), streak: input.user.streak_count, streak_max: input.user.streak_max, freeze_available: input.user.streak_freeze_available, achievements_earned: input.achievementsEarned, total_achievements: input.totalAchievements, challenges_completed: input.completedCount, total_carbon_saved_kg: Math.round(input.carbonSavedKg * 100) / 100 };
}

/**
 * Runs the getAllAchievementsWithUserProgress service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
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
