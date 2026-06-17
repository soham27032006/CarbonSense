import { supabaseAdmin } from "../config/supabase";
import { addXP, checkAchievements } from "./gamification.service";
import { incrementStreak } from "./streak.service";
import { updateUserTeamStats } from "./team.service";
import type {
  Achievement,
  CarbonCategory,
  Challenge,
  ChallengeDifficulty,
  UserChallenge
} from "../types";

type ChallengeWithContext = Challenge & {
  emoji: string;
  assignment: UserChallenge;
  personalized_context: string;
};

type ChallengeCompletionResult = {
  xp_earned: number;
  new_total_xp: number;
  streak_count: number;
  level_up: boolean;
  achievements_earned: Achievement[];
};

const challengeEmojiByIcon: Record<string, string> = {
  food: "🍔",
  transport: "🚗",
  home: "🏠",
  shopping: "🛍",
  lifestyle: "🌱"
};

function getChallengeEmoji(challenge: Challenge): string {
  return challengeEmojiByIcon[challenge.icon] ?? challengeEmojiByIcon[challenge.category] ?? "○";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

export async function getTodayChallenge(
  userId: string
): Promise<ChallengeWithContext> {
  const today = todayIso();
  const existingAssignment = await getExistingTodayAssignment(userId, today);

  if (existingAssignment && existingAssignment.status !== "skipped") {
    return hydrateChallenge(existingAssignment, userId);
  }

  return assignBestChallenge(userId, today, existingAssignment?.challenge_id);
}

export async function acceptChallenge(
  userId: string,
  challengeId: string
): Promise<ChallengeWithContext> {
  const assignment = await resolveActionableAssignment(userId, challengeId);

  if (assignment.status !== "pending") {
    throw new Error("Challenge must be pending before it can be accepted");
  }

  const { data, error } = await supabaseAdmin
    .from("user_challenges")
    .update({ status: "accepted" })
    .eq("id", assignment.id)
    .select("*")
    .single<UserChallenge>();

  if (error || !data) {
    throw new Error("Unable to accept challenge");
  }

  return hydrateChallenge(data, userId);
}

export async function completeChallenge(
  userId: string,
  challengeId: string
): Promise<ChallengeCompletionResult> {
  const assignment = await resolveActionableAssignment(userId, challengeId);

  if (assignment.status !== "accepted") {
    throw new Error("Challenge must be accepted before it can be completed");
  }

  const challenge = await getChallengeById(assignment.challenge_id);

  const { error: assignmentError } = await supabaseAdmin
    .from("user_challenges")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      xp_earned: challenge.xp_reward
    })
    .eq("id", assignment.id);

  if (assignmentError) {
    throw new Error("Unable to complete challenge");
  }

  const xpResult = await addXP(userId, challenge.xp_reward);
  const streakResult = await incrementStreak(userId);
  await updateUserTeamStats(userId);
  const achievementsEarned = await checkAchievements(userId);
  const { data: updatedUser, error: updatedUserError } = await supabaseAdmin
    .from("users")
    .select("xp,level")
    .eq("id", userId)
    .single<{ xp: number; level: number }>();

  if (updatedUserError || !updatedUser) {
    throw new Error("Unable to load updated user XP");
  }

  return {
    xp_earned: challenge.xp_reward,
    new_total_xp: updatedUser.xp,
    streak_count: streakResult.streak_count,
    level_up: xpResult.level_up || updatedUser.level > xpResult.new_level,
    achievements_earned: achievementsEarned
  };
}

export async function skipChallenge(
  userId: string,
  challengeId: string,
  reason: string
): Promise<ChallengeWithContext> {
  const assignment = await resolveActionableAssignment(userId, challengeId);

  if (assignment.status === "completed") {
    throw new Error("Completed challenges cannot be skipped");
  }

  const { error } = await supabaseAdmin
    .from("user_challenges")
    .update({
      status: "skipped",
      skip_reason: reason
    })
    .eq("id", assignment.id);

  if (error) {
    throw new Error("Unable to skip challenge");
  }

  return assignBestChallenge(userId, todayIso(), assignment.challenge_id);
}

export async function getChallengeHistory(
  userId: string,
  page: number,
  limit: number
) {
  const safePage = Math.max(page, 1);
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  const { data, error, count } = await supabaseAdmin
    .from("user_challenges")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("date_assigned", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error("Unable to load challenge history");
  }

  const challengeIds = [...new Set((data ?? []).map((row) => row.challenge_id))];
  const challengesById = await getChallengesById(challengeIds);

  return {
    challenges: (data ?? []).map((assignment) => ({
      ...assignment,
      challenge: challengesById.get(assignment.challenge_id) ?? null
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / safeLimit)
    }
  };
}

export async function getChallengeLibrary() {
  const { data, error } = await supabaseAdmin
    .from("challenges")
    .select("*")
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("difficulty", { ascending: true });

  if (error || !data) {
    throw new Error("Unable to load challenge library");
  }

  return {
    items: (data as Challenge[]).map((challenge) => ({
      ...challenge,
      savings_kg: Number(challenge.carbon_save_kg),
      emoji: getChallengeEmoji(challenge),
      completion_rate: 0.72
    }))
  };
}

async function assignBestChallenge(
  userId: string,
  dateAssigned: string,
  excludedChallengeId?: string
): Promise<ChallengeWithContext> {
  const [
    highestCategory,
    recentHistory,
    difficultyPreference,
    { data: challenges, error: challengesError }
  ] = await Promise.all([
    getHighestCarbonArea(userId),
    getRecentChallengeHistory(userId),
    getDifficultyPreference(userId),
    supabaseAdmin.from("challenges").select("*").eq("is_active", true)
  ]);

  if (challengesError || !challenges || challenges.length === 0) {
    throw new Error("No active challenges available");
  }

  const scoredChallenges = challenges
    .filter((challenge) => challenge.id !== excludedChallengeId)
    .map((challenge) => ({
      challenge,
      score: scoreChallenge(
        challenge,
        highestCategory,
        difficultyPreference,
        recentHistory
      )
    }))
    .sort((left, right) => right.score - left.score);

  const selectedChallenge = scoredChallenges[0]?.challenge;

  if (!selectedChallenge) {
    throw new Error("No alternative challenges available");
  }

  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .from("user_challenges")
    .insert({
      user_id: userId,
      challenge_id: selectedChallenge.id,
      date_assigned: dateAssigned,
      status: "pending"
    })
    .select("*")
    .single<UserChallenge>();

  if (assignmentError || !assignment) {
    throw new Error("Unable to assign daily challenge");
  }

  return {
    ...selectedChallenge,
    emoji: getChallengeEmoji(selectedChallenge),
    assignment,
    personalized_context: buildPersonalizedContext(
      highestCategory,
      Number(selectedChallenge.carbon_save_kg)
    )
  };
}

function scoreChallenge(
  challenge: Challenge,
  highestCategory: CarbonCategory,
  difficultyPreference: ChallengeDifficulty,
  recentHistory: Array<UserChallenge & { challenge?: Challenge }>
): number {
  const lastSevenDays = todayMinusDays(7);
  const lastThreeDays = todayMinusDays(3);
  const wasCompletedRecently = recentHistory.some(
    (history) =>
      history.challenge_id === challenge.id &&
      history.status === "completed" &&
      history.date_assigned >= lastSevenDays
  );
  const categoryDoneRecently = recentHistory.some(
    (history) =>
      history.challenge?.category === challenge.category &&
      history.date_assigned >= lastThreeDays
  );

  return [
    challenge.category === toChallengeCategoryForScoring(highestCategory) ? 3 : 0,
    challenge.difficulty === difficultyPreference ? 2 : 0,
    wasCompletedRecently ? -5 : 0,
    categoryDoneRecently ? 0 : 1,
    Math.random() * 2
  ].reduce((total, value) => total + value, 0);
}

async function hydrateChallenge(
  assignment: UserChallenge,
  userId: string
): Promise<ChallengeWithContext> {
  const [challenge, highestCategory] = await Promise.all([
    getChallengeById(assignment.challenge_id),
    getHighestCarbonArea(userId)
  ]);

  return {
    ...challenge,
    emoji: getChallengeEmoji(challenge),
    assignment,
    personalized_context: buildPersonalizedContext(
      highestCategory,
      Number(challenge.carbon_save_kg)
    )
  };
}

async function getExistingTodayAssignment(
  userId: string,
  today: string
): Promise<UserChallenge | null> {
  const { data, error } = await supabaseAdmin
    .from("user_challenges")
    .select("*")
    .eq("user_id", userId)
    .eq("date_assigned", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<UserChallenge>();

  if (error) {
    throw new Error("Unable to load today's challenge");
  }

  return data;
}

async function getUserChallengeAssignment(
  userId: string,
  challengeId: string
): Promise<UserChallenge> {
  const data = await getUserChallengeAssignmentSafe(userId, challengeId);

  if (!data) {
    throw new Error("Challenge assignment not found");
  }

  return data;
}

async function getUserChallengeAssignmentSafe(
  userId: string,
  challengeId: string
): Promise<UserChallenge | null> {
  const { data, error } = await supabaseAdmin
    .from("user_challenges")
    .select("*")
    .eq("user_id", userId)
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<UserChallenge>();

  if (error || !data) {
    return null;
  }

  return data;
}

async function resolveActionableAssignment(
  userId: string,
  challengeId: string
): Promise<UserChallenge> {
  const exactAssignment = await getUserChallengeAssignmentSafe(userId, challengeId);

  if (exactAssignment) {
    return exactAssignment;
  }

  const todayAssignment = await getExistingTodayAssignment(userId, todayIso());

  if (todayAssignment && todayAssignment.status !== "completed") {
    return todayAssignment;
  }

  throw new Error("No active challenge found. Refresh the page and try again.");
}

async function getChallengeById(challengeId: string): Promise<Challenge> {
  const { data, error } = await supabaseAdmin
    .from("challenges")
    .select("*")
    .eq("id", challengeId)
    .single<Challenge>();

  if (error || !data) {
    throw new Error("Challenge not found");
  }

  return data;
}

async function getChallengesById(challengeIds: string[]): Promise<Map<string, Challenge>> {
  if (challengeIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from("challenges")
    .select("*")
    .in("id", challengeIds);

  if (error || !data) {
    throw new Error("Unable to load challenges");
  }

  return new Map((data as Challenge[]).map((challenge) => [challenge.id, challenge]));
}

async function getHighestCarbonArea(userId: string): Promise<CarbonCategory> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  const periodStart = monthStart.toISOString().slice(0, 10);

  const { data: summary } = await supabaseAdmin
    .from("carbon_summaries")
    .select("food_kg,transport_kg,home_kg,shopping_kg,travel_kg,other_kg")
    .eq("user_id", userId)
    .eq("period_type", "month")
    .eq("period_start", periodStart)
    .maybeSingle();

  if (summary) {
    const entries = [
      ["food", Number(summary.food_kg)],
      ["transport", Number(summary.transport_kg)],
      ["home", Number(summary.home_kg)],
      ["shopping", Number(summary.shopping_kg)],
      ["travel", Number(summary.travel_kg)],
      ["other", Number(summary.other_kg)]
    ] as Array<[CarbonCategory, number]>;

    return entries.reduce((highest, current) =>
      current[1] > highest[1] ? current : highest
    )[0];
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("onboarding_data")
    .eq("id", userId)
    .single<{ onboarding_data: { highest_carbon_category?: CarbonCategory } }>();

  return user?.onboarding_data?.highest_carbon_category ?? "shopping";
}

async function getRecentChallengeHistory(
  userId: string
): Promise<Array<UserChallenge & { challenge?: Challenge }>> {
  const since = todayMinusDays(14);
  const { data, error } = await supabaseAdmin
    .from("user_challenges")
    .select("*")
    .eq("user_id", userId)
    .gte("date_assigned", since)
    .order("date_assigned", { ascending: false });

  if (error || !data) {
    throw new Error("Unable to load recent challenge history");
  }

  const challengesById = await getChallengesById([
    ...new Set(data.map((history) => history.challenge_id))
  ]);

  return data.map((history) => ({
    ...history,
    challenge: challengesById.get(history.challenge_id)
  })) as Array<UserChallenge & { challenge?: Challenge }>;
}

async function getDifficultyPreference(
  userId: string
): Promise<ChallengeDifficulty> {
  const { data, error } = await supabaseAdmin
    .from("user_challenges")
    .select("status")
    .eq("user_id", userId)
    .order("date_assigned", { ascending: false })
    .limit(20);

  if (error || !data || data.length < 5) {
    return "easy";
  }

  const completedCount = data.filter((row) => row.status === "completed").length;
  const completionRate = completedCount / data.length;

  if (completionRate >= 0.8) {
    return "hard";
  }

  if (completionRate >= 0.5) {
    return "medium";
  }

  return "easy";
}

function buildPersonalizedContext(
  highestCategory: CarbonCategory,
  carbonSaveKg: number
): string {
  return `Based on your spending, ${highestCategory} is your biggest carbon area. This could save you ${carbonSaveKg} kg today!`;
}

function toChallengeCategoryForScoring(category: CarbonCategory): string {
  return category === "travel" || category === "other" ? "lifestyle" : category;
}

function todayMinusDays(days: number): string {
  return addDays(new Date(), -days).toISOString().slice(0, 10);
}
