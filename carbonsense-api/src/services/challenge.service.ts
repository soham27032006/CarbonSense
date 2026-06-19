/**
 * Service layer for CarbonSense domain logic. Keeps persistence, third-party API calls, and calculations behind controller-safe functions.
 */
import { supabaseAdmin } from "../config/supabase";
import { addXP, checkAchievements } from "./gamification.service";
import { incrementStreak } from "./streak.service";
import { updateUserTeamStats } from "./team.service";
import {
  addDaysToDateString,
  currentIndiaMonthStart,
  daysAgoIndia,
  formatIndiaDate,
  todayIndia
} from "../utils/date";
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
  why: string;
  tips: string[];
  equivalency: string;
  participants_today: number;
  streak_last_14: boolean[];
};

type ChallengeCompletionResult = {
  xp_earned: number;
  new_total_xp: number;
  streak_count: number;
  is_streak_milestone: boolean;
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

const challengeEmojiOverrides: Record<string, string> = {
  "walk or bike today": "🚲"
};

function getChallengeEmoji(challenge: Challenge): string {
  const override = challengeEmojiOverrides[challenge.title.trim().toLowerCase()];
  if (override) return override;
  return challengeEmojiByIcon[challenge.icon] ?? challengeEmojiByIcon[challenge.category] ?? "○";
}

/**
 * Runs the getTodayChallenge service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getTodayChallenge(
  userId: string,
  altOffset = 0
): Promise<ChallengeWithContext> {
  const today = todayIndia();
  const existingAssignment = await getExistingTodayAssignment(userId, today);

  if (existingAssignment && existingAssignment.status !== "skipped" && altOffset === 0) {
    return hydrateChallenge(existingAssignment, userId);
  }

  const excludedIds = await getTodaysRejectedChallengeIds(userId, today, existingAssignment?.challenge_id);
  return assignBestChallenge(userId, today, excludedIds, altOffset);
}

async function getTodaysRejectedChallengeIds(
  userId: string,
  dateAssigned: string,
  initialExclude?: string
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("user_challenges")
    .select("challenge_id")
    .eq("user_id", userId)
    .eq("date_assigned", dateAssigned)
    .eq("status", "skipped");

  if (error) {
    return initialExclude ? [initialExclude] : [];
  }

  const ids = new Set<string>();
  if (initialExclude) ids.add(initialExclude);
  for (const row of data ?? []) {
    if (row.challenge_id) ids.add(row.challenge_id);
  }
  return Array.from(ids);
}

/**
 * Runs the acceptChallenge service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
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

/**
 * Runs the completeChallenge service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function completeChallenge(
  userId: string,
  challengeId: string
): Promise<ChallengeCompletionResult> {
  const assignment = await resolveActionableAssignment(userId, challengeId);

  if (assignment.status !== "accepted") {
    throw new Error("Challenge must be accepted before it can be completed");
  }

  const challenge = await getChallengeById(assignment.challenge_id);

  const xpResult = await addXP(userId, challenge.xp_reward);
  const streakResult = await incrementStreak(userId);

  const baseXp = challenge.xp_reward;
  const milestoneBonusXp = streakResult.milestone_bonus_xp ?? 0;
  const xp_earned = baseXp + milestoneBonusXp;

  const { error: assignmentError } = await supabaseAdmin
    .from("user_challenges")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      xp_earned
    })
    .eq("id", assignment.id);

  if (assignmentError) {
    throw new Error("Unable to complete challenge");
  }

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
    xp_earned,
    new_total_xp: updatedUser.xp,
    streak_count: streakResult.streak_count,
    is_streak_milestone: streakResult.is_milestone,
    level_up: xpResult.level_up || updatedUser.level > xpResult.new_level,
    achievements_earned: achievementsEarned
  };
}

/**
 * Runs the skipChallenge service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
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

  return assignBestChallenge(userId, todayIndia(), assignment.challenge_id);
}

/**
 * Runs the getChallengeHistory service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
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
    challenges: (data ?? []).map((assignment) => {
      const challenge = challengesById.get(assignment.challenge_id) ?? null;
      return {
        ...assignment,
        challenge,
        carbon_saved_kg: challenge ? Number(challenge.carbon_save_kg) || 0 : 0
      };
    }),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / safeLimit)
    }
  };
}

/**
 * Runs the getChallengeLibrary service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
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
  excludedChallengeIds: string | string[] = [],
  altOffset = 0
): Promise<ChallengeWithContext> {
  const excluded = Array.isArray(excludedChallengeIds)
    ? excludedChallengeIds
    : [excludedChallengeIds];

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

  const eligibleChallenges = challenges.filter(
    (challenge) => !excluded.includes(challenge.id)
  );
  const challengePool =
    eligibleChallenges.length > 0 ? eligibleChallenges : challenges;

  const scoredChallenges = challengePool
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

  const selectedChallenge = scoredChallenges[altOffset]?.challenge ?? scoredChallenges[0]?.challenge;

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

  const carbonSaveKg = Number(selectedChallenge.carbon_save_kg);
  const [participants, streakWindow] = await Promise.all([
    countTodaysParticipants(selectedChallenge.id, dateAssigned),
    loadStreakWindow(userId, dateAssigned)
  ]);

  return {
    ...selectedChallenge,
    emoji: getChallengeEmoji(selectedChallenge),
    assignment,
    personalized_context: buildPersonalizedContext(highestCategory, carbonSaveKg),
    why: buildPersonalizedContext(highestCategory, carbonSaveKg),
    tips: buildTips(selectedChallenge.category, selectedChallenge.tips),
    equivalency: buildEquivalency(carbonSaveKg),
    participants_today: participants,
    streak_last_14: buildStreakLast14(streakWindow, dateAssigned)
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

  const carbonSaveKg = Number(challenge.carbon_save_kg);
  const today = todayIndia();
  const [participants, streakWindow] = await Promise.all([
    countTodaysParticipants(challenge.id, today),
    loadStreakWindow(userId, today)
  ]);
  const context = buildPersonalizedContext(highestCategory, carbonSaveKg);

  return {
    ...challenge,
    emoji: getChallengeEmoji(challenge),
    assignment,
    personalized_context: context,
    why: context,
    tips: buildTips(challenge.category, challenge.tips),
    equivalency: buildEquivalency(carbonSaveKg),
    participants_today: participants,
    streak_last_14: buildStreakLast14(streakWindow, today)
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
  const todayAssignment = await getExistingTodayAssignment(userId, todayIndia());

  if (
    todayAssignment &&
    (todayAssignment.id === challengeId || todayAssignment.challenge_id === challengeId)
  ) {
    return todayAssignment;
  }

  const { data, error } = await supabaseAdmin
    .from("user_challenges")
    .select("*")
    .eq("user_id", userId)
    .eq("challenge_id", challengeId)
    .eq("date_assigned", todayIndia())
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

  const todayAssignment = await getExistingTodayAssignment(userId, todayIndia());

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
  const periodStart = currentIndiaMonthStart();

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

const TIPS_BY_CATEGORY: Record<string, string[]> = {
  food: [
    "Plan one plant-based meal this week",
    "Swap one red-meat dinner for chicken or fish",
    "Use up leftovers before buying more"
  ],
  transport: [
    "Leave 5 minutes early so you can walk or bike",
    "Combine errands into one trip",
    "Try a car-free day on the weekend"
  ],
  home: [
    "Drop your thermostat 1°C for the day",
    "Run dish- and laundry loads only when full",
    "Switch one light to LED if you haven't already"
  ],
  shopping: [
    "Wait 24 hours before any non-essential buy",
    "Borrow or rent instead of buying",
    "Pick the smallest size that fits the need"
  ],
  lifestyle: [
    "Pick the lower-carbon option for one decision today",
    "Track what you bought and why",
    "Try a no-spend day this week"
  ],
  travel: [
    "Take the train for trips under 300 miles",
    "Pack lighter — weight matters for fuel",
    "Choose direct flights when you must fly"
  ],
  other: [
    "Pick the lower-carbon option for one decision today",
    "Track what you bought and why",
    "Try a no-spend day this week"
  ]
};

function buildTips(category: string, dbTips: string[] | null | undefined): string[] {
  if (Array.isArray(dbTips) && dbTips.length > 0) return dbTips;
  return TIPS_BY_CATEGORY[category] ?? TIPS_BY_CATEGORY.other;
}

function buildEquivalency(carbonSaveKg: number): string {
  if (!Number.isFinite(carbonSaveKg) || carbonSaveKg <= 0) {
    return "a small action that builds momentum";
  }
  const miles = Math.round(carbonSaveKg / 0.404);
  return `about ${miles} miles not driven`;
}

function buildStreakLast14(
  assignments: Array<{ date_assigned: string; status: string; completed_at?: string | null; created_at?: string }>,
  today: string
): boolean[] {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;

  const completedDates = new Set<string>();
  for (const row of assignments) {
    if (row.status !== "completed" && row.status !== "accepted") continue;
    const candidates = [
      normalizeDateString(row.date_assigned),
      row.completed_at
        ? new Date(new Date(row.completed_at).getTime() + istOffsetMs)
            .toISOString()
            .slice(0, 10)
        : "",
      row.created_at
        ? new Date(new Date(row.created_at).getTime() + istOffsetMs)
            .toISOString()
            .slice(0, 10)
        : ""
    ].filter((d) => d.length > 0);
    for (const candidate of candidates) {
      completedDates.add(candidate);
    }
  }

  const result: boolean[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const dateStr = addDaysToDateString(today, -i);
    result.push(completedDates.has(dateStr));
  }
  return result;
}

function normalizeDateString(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return formatIndiaDate(parsed);
}

function toChallengeCategoryForScoring(category: CarbonCategory): string {
  return category === "travel" || category === "other" ? "lifestyle" : category;
}

async function countTodaysParticipants(
  challengeId: string,
  today: string
): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("user_challenges")
    .select("id", { count: "exact", head: true })
    .eq("challenge_id", challengeId)
    .eq("date_assigned", today)
    .in("status", ["accepted", "completed"]);

  if (error) {
    return 0;
  }

  return Number(count ?? 0);
}

async function loadStreakWindow(
  userId: string,
  today: string
): Promise<
  Array<{
    date_assigned: string;
    status: string;
    completed_at: string | null;
    created_at: string;
  }>
> {
  const since = addDaysToDateString(today, -13);
  const { data, error } = await supabaseAdmin
    .from("user_challenges")
    .select("date_assigned,status,completed_at,created_at")
    .eq("user_id", userId)
    .gte("date_assigned", since)
    .lte("date_assigned", today);

  if (error || !data) {
    return [];
  }

  return data as Array<{
    date_assigned: string;
    status: string;
    completed_at: string | null;
    created_at: string;
  }>;
}

function todayMinusDays(days: number): string {
  return daysAgoIndia(days);
}
