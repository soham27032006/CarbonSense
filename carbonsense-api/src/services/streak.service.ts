/**
 * Service layer for CarbonSense domain logic. Keeps persistence, third-party API calls, and calculations behind controller-safe functions.
 */
import { supabaseAdmin } from "../config/supabase";
import { todayIndia, yesterdayIndia } from "../utils/date";
import { addXP } from "./gamification.service";

export type IncrementStreakResult = {
  streak_count: number;
  streak_max: number;
  is_milestone: boolean;
  milestone_bonus_xp: number;
};

export type StreakResetResult =
  | { streak_safe: true; already_checked: boolean }
  | { streak_saved: true; freeze_used: true }
  | { streak_reset: true; previous_streak: number };

const streakMilestoneBonusXp = new Map<number, number>([
  [7, 50],
  [14, 100],
  [30, 200],
  [60, 300],
  [100, 500],
  [365, 1000]
]);

/**
 * Runs the incrementStreak service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function incrementStreak(
  userId: string
): Promise<IncrementStreakResult> {
  return await incrementStreakWorkflow(userId);
}

/**
 * Executes the extracted incrementStreak service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `incrementStreak`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
type StreakState = { streak_count: number; streak_max: number };

type NextStreakState = {
  nextStreak: number;
  nextMax: number;
  milestoneBonusXp: number;
};

async function incrementStreakWorkflow(userId: string): Promise<IncrementStreakResult> {
  const today = todayIndia();
  const user = await loadStreakState(userId);
  if ((await countCompletedChallengesForDate(userId, today)) > 1) return buildUnchangedStreakResult(user);

  const next = getNextStreakState(user);
  await saveIncrementedStreak(userId, today, next);
  if (next.milestoneBonusXp > 0) await addXP(userId, next.milestoneBonusXp);
  return buildIncrementStreakResult(next);
}

/**
 * Loads the current streak counters for a user.
 * @returns Current streak state.
 * @throws When streak state cannot be loaded.
 */
async function loadStreakState(userId: string): Promise<StreakState> {
  const { data: user, error } = await supabaseAdmin.from("users").select("streak_count,streak_max").eq("id", userId).single<StreakState>();
  if (error || !user) throw new Error("Unable to load streak state");
  return user;
}

/**
 * Counts completed challenges assigned on a specific date.
 * @returns Completed challenge count.
 * @throws When completion count cannot be checked.
 */
async function countCompletedChallengesForDate(userId: string, date: string): Promise<number> {
  const { count, error } = await supabaseAdmin.from("user_challenges").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed").eq("date_assigned", date);
  if (error) throw new Error("Unable to check today's streak completion");
  return count ?? 0;
}

/**
 * Calculates next streak counters and milestone bonus.
 * @returns Next streak state.
 */
function getNextStreakState(user: StreakState): NextStreakState {
  const nextStreak = user.streak_count + 1;
  return { nextStreak, nextMax: Math.max(user.streak_max, nextStreak), milestoneBonusXp: streakMilestoneBonusXp.get(nextStreak) ?? 0 };
}

/**
 * Persists incremented streak counters.
 * @throws When streak counters cannot be saved.
 */
async function saveIncrementedStreak(userId: string, today: string, next: NextStreakState): Promise<void> {
  const { error } = await supabaseAdmin.from("users").update({ streak_count: next.nextStreak, streak_max: next.nextMax, streak_last_checked_date: today }).eq("id", userId);
  if (error) throw new Error("Unable to update streak");
}

/**
 * Builds a result when the streak should not increment again.
 * @returns Current streak result with no milestone bonus.
 */
function buildUnchangedStreakResult(user: StreakState): IncrementStreakResult {
  return { streak_count: user.streak_count, streak_max: user.streak_max, is_milestone: false, milestone_bonus_xp: 0 };
}

/**
 * Builds the incremented streak result.
 * @returns Incremented streak payload.
 */
function buildIncrementStreakResult(next: NextStreakState): IncrementStreakResult {
  return { streak_count: next.nextStreak, streak_max: next.nextMax, is_milestone: next.milestoneBonusXp > 0, milestone_bonus_xp: next.milestoneBonusXp };
}

/**
 * Runs the checkAndResetStreak service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function checkAndResetStreak(
  userId: string
): Promise<StreakResetResult> {
  return await checkAndResetStreakWorkflow(userId);
}

/**
 * Executes the extracted checkAndResetStreak service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `checkAndResetStreak`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
type StreakResetState = {
  streak_count: number;
  streak_freeze_available: boolean;
  streak_last_checked_date: string | null;
};

async function checkAndResetStreakWorkflow(userId: string): Promise<StreakResetResult> {
  const today = todayIndia();
  const user = await loadStreakResetState(userId);
  if (user.streak_last_checked_date === today) return { streak_safe: true, already_checked: true };
  if ((await countCompletedChallengesForDate(userId, yesterdayIndia())) > 0 || user.streak_count === 0) return markSafeStreak(userId, today);
  if (user.streak_freeze_available) return useAvailableStreakFreeze(userId, today);
  return resetExpiredStreak(userId, today, user.streak_count);
}

/**
 * Loads streak reset state for a user.
 * @returns State needed to determine streak reset behavior.
 * @throws When streak state cannot be loaded.
 */
async function loadStreakResetState(userId: string): Promise<StreakResetState> {
  const { data: user, error } = await supabaseAdmin.from("users").select("streak_count,streak_freeze_available,streak_last_checked_date").eq("id", userId).single<StreakResetState>();
  if (error || !user) throw new Error("Unable to load streak state");
  return user;
}

/**
 * Marks a streak as checked and safe for today.
 * @returns Safe streak result.
 */
async function markSafeStreak(userId: string, today: string): Promise<StreakResetResult> {
  await markStreakChecked(userId, today);
  return { streak_safe: true, already_checked: false };
}

/**
 * Consumes an available streak freeze.
 * @returns Freeze-saved streak result.
 * @throws When the freeze cannot be saved.
 */
async function useAvailableStreakFreeze(userId: string, today: string): Promise<StreakResetResult> {
  const { error } = await supabaseAdmin.from("users").update({ streak_freeze_available: false, streak_last_checked_date: today }).eq("id", userId);
  if (error) throw new Error("Unable to use streak freeze");
  return { streak_saved: true, freeze_used: true };
}

/**
 * Resets an expired streak.
 * @returns Reset streak result with the previous count.
 * @throws When the reset cannot be saved.
 */
async function resetExpiredStreak(userId: string, today: string, previousStreak: number): Promise<StreakResetResult> {
  const { error } = await supabaseAdmin.from("users").update({ streak_count: 0, streak_last_checked_date: today }).eq("id", userId);
  if (error) throw new Error("Unable to reset streak");
  return { streak_reset: true, previous_streak: previousStreak };
}

/**
 * Runs the regenerateStreakFreeze service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function regenerateStreakFreeze(userId: string): Promise<{
  success: true;
  freeze_available: boolean;
}> {
  return await regenerateStreakFreezeWorkflow(userId);
}

/**
 * Executes the extracted regenerateStreakFreeze service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `regenerateStreakFreeze`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
type StreakFreezeState = { created_at: string; streak_freeze_available: boolean };

async function regenerateStreakFreezeWorkflow(userId: string): Promise<{
  success: true;
  freeze_available: boolean;
}> {
  const user = await loadStreakFreezeState(userId);
  if (!user.streak_freeze_available && shouldRegenerateStreakFreeze(user.created_at)) return enableStreakFreeze(userId);
  return { success: true, freeze_available: user.streak_freeze_available };
}

/**
 * Loads state needed to determine streak freeze regeneration.
 * @returns Current freeze state.
 * @throws When freeze state cannot be loaded.
 */
async function loadStreakFreezeState(userId: string): Promise<StreakFreezeState> {
  const { data: user, error } = await supabaseAdmin.from("users").select("created_at,streak_freeze_available").eq("id", userId).single<StreakFreezeState>();
  if (error || !user) throw new Error("Unable to load streak freeze state");
  return user;
}

/**
 * Determines whether account age hits the weekly regeneration cadence.
 * @returns Whether a freeze should regenerate today.
 */
function shouldRegenerateStreakFreeze(createdAt: string): boolean {
  const ageDays = Math.floor((Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000));
  return ageDays > 0 && ageDays % 7 === 0;
}

/**
 * Enables a regenerated streak freeze.
 * @returns Enabled freeze result.
 * @throws When the freeze flag cannot be saved.
 */
async function enableStreakFreeze(userId: string): Promise<{ success: true; freeze_available: boolean }> {
  const { error } = await supabaseAdmin.from("users").update({ streak_freeze_available: true }).eq("id", userId);
  if (error) throw new Error("Unable to regenerate streak freeze");
  return { success: true, freeze_available: true };
}

/**
 * Runs the useStreakFreeze service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function useStreakFreeze(userId: string): Promise<{
  success: true;
  remaining_freezes: 0;
}> {
  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("streak_freeze_available")
    .eq("id", userId)
    .single<{ streak_freeze_available: boolean }>();

  if (userError || !user) {
    throw new Error("Unable to load streak freeze state");
  }

  if (!user.streak_freeze_available) {
    throw new Error("No streak freeze available");
  }

  const { error } = await supabaseAdmin
    .from("users")
    .update({ streak_freeze_available: false })
    .eq("id", userId);

  if (error) {
    throw new Error("Unable to use streak freeze");
  }

  return { success: true, remaining_freezes: 0 };
}

/**
 * Runs the getStreakInfo service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getStreakInfo(userId: string) {
  await regenerateStreakFreeze(userId);
  const streakStatus = await checkAndResetStreak(userId);
  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("streak_count,streak_max,streak_freeze_available")
    .eq("id", userId)
    .single<{
      streak_count: number;
      streak_max: number;
      streak_freeze_available: boolean;
    }>();

  if (error || !user) {
    throw new Error("Unable to load streak info");
  }

  return {
    current: user.streak_count,
    max: user.streak_max,
    freeze_available: user.streak_freeze_available,
    status: streakStatus
  };
}

async function markStreakChecked(userId: string, today: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ streak_last_checked_date: today })
    .eq("id", userId);

  if (error) {
    throw new Error("Unable to mark streak checked");
  }
}
