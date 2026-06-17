import { supabaseAdmin } from "../config/supabase";
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

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

export async function incrementStreak(
  userId: string
): Promise<IncrementStreakResult> {
  const today = formatDate(new Date());

  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("streak_count,streak_max")
    .eq("id", userId)
    .single<{ streak_count: number; streak_max: number }>();

  if (userError || !user) {
    throw new Error("Unable to load streak state");
  }

  const { count: completedToday, error: completedTodayError } = await supabaseAdmin
    .from("user_challenges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "completed")
    .eq("date_assigned", today);

  if (completedTodayError) {
    throw new Error("Unable to check today's streak completion");
  }

  if ((completedToday ?? 0) > 1) {
    return {
      streak_count: user.streak_count,
      streak_max: user.streak_max,
      is_milestone: false,
      milestone_bonus_xp: 0
    };
  }

  const nextStreak = user.streak_count + 1;
  const nextMax = Math.max(user.streak_max, nextStreak);
  const milestoneBonusXp = streakMilestoneBonusXp.get(nextStreak) ?? 0;

  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({
      streak_count: nextStreak,
      streak_max: nextMax,
      streak_last_checked_date: today
    })
    .eq("id", userId);

  if (updateError) {
    throw new Error("Unable to update streak");
  }

  if (milestoneBonusXp > 0) {
    await addXP(userId, milestoneBonusXp);
  }

  return {
    streak_count: nextStreak,
    streak_max: nextMax,
    is_milestone: milestoneBonusXp > 0,
    milestone_bonus_xp: milestoneBonusXp
  };
}

export async function checkAndResetStreak(
  userId: string
): Promise<StreakResetResult> {
  const today = formatDate(new Date());
  const yesterday = formatDate(addDays(new Date(), -1));

  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("streak_count,streak_freeze_available,streak_last_checked_date")
    .eq("id", userId)
    .single<{
      streak_count: number;
      streak_freeze_available: boolean;
      streak_last_checked_date: string | null;
    }>();

  if (userError || !user) {
    throw new Error("Unable to load streak state");
  }

  if (user.streak_last_checked_date === today) {
    return { streak_safe: true, already_checked: true };
  }

  const { count: completedYesterday, error: completionError } =
    await supabaseAdmin
      .from("user_challenges")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed")
      .eq("date_assigned", yesterday);

  if (completionError) {
    throw new Error("Unable to check streak history");
  }

  if ((completedYesterday ?? 0) > 0 || user.streak_count === 0) {
    await markStreakChecked(userId, today);
    return { streak_safe: true, already_checked: false };
  }

  if (user.streak_freeze_available) {
    const { error } = await supabaseAdmin
      .from("users")
      .update({
        streak_freeze_available: false,
        streak_last_checked_date: today
      })
      .eq("id", userId);

    if (error) {
      throw new Error("Unable to use streak freeze");
    }

    return { streak_saved: true, freeze_used: true };
  }

  const previousStreak = user.streak_count;
  const { error } = await supabaseAdmin
    .from("users")
    .update({
      streak_count: 0,
      streak_last_checked_date: today
    })
    .eq("id", userId);

  if (error) {
    throw new Error("Unable to reset streak");
  }

  return { streak_reset: true, previous_streak: previousStreak };
}

export async function regenerateStreakFreeze(userId: string): Promise<{
  success: true;
  freeze_available: boolean;
}> {
  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("created_at,streak_freeze_available")
    .eq("id", userId)
    .single<{ created_at: string; streak_freeze_available: boolean }>();

  if (userError || !user) {
    throw new Error("Unable to load streak freeze state");
  }

  const ageDays = Math.floor(
    (Date.now() - new Date(user.created_at).getTime()) / (24 * 60 * 60 * 1000)
  );
  const shouldRegenerate = ageDays > 0 && ageDays % 7 === 0;

  if (!user.streak_freeze_available && shouldRegenerate) {
    const { error } = await supabaseAdmin
      .from("users")
      .update({ streak_freeze_available: true })
      .eq("id", userId);

    if (error) {
      throw new Error("Unable to regenerate streak freeze");
    }

    return { success: true, freeze_available: true };
  }

  return { success: true, freeze_available: user.streak_freeze_available };
}

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
