import { supabaseAdmin } from "../config/supabase";
import { refreshCarbonSummaries } from "../services/carbon.service";
import {
  checkAndResetStreak,
  regenerateStreakFreeze
} from "../services/streak.service";

type DailyJobResult = {
  checked_streaks: number;
  refreshed_freezes: number;
  generated_summaries: number;
};

function yesterdayIso(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export async function checkAllStreaks(): Promise<number> {
  const { data: users, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .gt("streak_count", 0);

  if (error || !users) {
    throw new Error("Unable to load users for streak checks");
  }

  await Promise.all(users.map((user) => checkAndResetStreak(user.id)));
  return users.length;
}

export async function refreshAllStreakFreezes(): Promise<number> {
  const { data: users, error } = await supabaseAdmin.from("users").select("id");

  if (error || !users) {
    throw new Error("Unable to load users for streak freeze refresh");
  }

  await Promise.all(users.map((user) => regenerateStreakFreeze(user.id)));
  return users.length;
}

export async function generateDailySummaries(): Promise<number> {
  const summaryDate = yesterdayIso();
  const { data: users, error } = await supabaseAdmin.from("users").select("id");

  if (error || !users) {
    throw new Error("Unable to load users for daily summaries");
  }

  await Promise.all(
    users.map((user) => refreshCarbonSummaries(user.id, summaryDate))
  );
  return users.length;
}

export async function runDailyJobs(): Promise<DailyJobResult> {
  const [checkedStreaks, refreshedFreezes, generatedSummaries] =
    await Promise.all([
      checkAllStreaks(),
      refreshAllStreakFreezes(),
      generateDailySummaries()
    ]);

  return {
    checked_streaks: checkedStreaks,
    refreshed_freezes: refreshedFreezes,
    generated_summaries: generatedSummaries
  };
}
