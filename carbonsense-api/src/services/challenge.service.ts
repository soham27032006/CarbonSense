/**
 * Service layer for CarbonSense domain logic. Keeps persistence, third-party API calls, and calculations behind controller-safe functions.
 */
import { supabaseAdmin } from "../config/supabase";
import { addXP, checkAchievements } from "./gamification.service";
import { invalidateLifetimeCarbonSaved } from "./impact.service";
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

  if (existingAssignment && existingAssignment.status !== "skipped") {
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
  return await completeChallengeWorkflow(userId, challengeId);
}

/**
 * Executes the extracted completeChallenge service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `completeChallenge`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function completeChallengeWorkflow(
  userId: string,
  challengeId: string
): Promise<ChallengeCompletionResult> {
  const assignment = await resolveActionableAssignment(userId, challengeId);
  assertAcceptedAssignment(assignment);

  const challenge = await getChallengeById(assignment.challenge_id);
  const award = await awardChallengeCompletion(userId, challenge);

  await persistChallengeCompletion(assignment.id, award.xp_earned);
  await updateUserTeamStats(userId);
  await invalidateLifetimeCarbonSaved(userId);

  const achievementsEarned = await checkAchievements(userId);
  const updatedUser = await loadUpdatedUserXp(userId);

  return buildChallengeCompletionResult(award, updatedUser, achievementsEarned);
}

/**
 * Validates that an assignment can be completed.
 * @returns Nothing when the assignment is accepted.
 * @throws When the assignment is not accepted.
 */
function assertAcceptedAssignment(assignment: UserChallenge): void {
  if (assignment.status !== "accepted") {
    throw new Error("Challenge must be accepted before it can be completed");
  }
}

/**
 * Awards XP and streak credit for a completed challenge.
 * @returns XP, streak, and total earned values used by the response.
 */
async function awardChallengeCompletion(userId: string, challenge: Challenge) {
  const xpResult = await addXP(userId, challenge.xp_reward);
  const streakResult = await incrementStreak(userId);
  const xp_earned = challenge.xp_reward + (streakResult.milestone_bonus_xp ?? 0);

  return { xpResult, streakResult, xp_earned };
}

/**
 * Marks an assignment completed with earned XP.
 * @returns Resolves when the assignment update succeeds.
 * @throws When the assignment cannot be updated.
 */
async function persistChallengeCompletion(assignmentId: string, xpEarned: number): Promise<void> {
  const { error: assignmentError } = await supabaseAdmin
    .from("user_challenges")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      xp_earned: xpEarned
    })
    .eq("id", assignmentId);

  if (assignmentError) {
    throw new Error("Unable to complete challenge");
  }
}

/**
 * Loads the user's XP and level after completion side effects.
 * @returns Updated XP and level values.
 * @throws When the user XP cannot be loaded.
 */
async function loadUpdatedUserXp(userId: string): Promise<{ xp: number; level: number }> {
  const { data: updatedUser, error: updatedUserError } = await supabaseAdmin
    .from("users")
    .select("xp,level")
    .eq("id", userId)
    .single<{ xp: number; level: number }>();

  if (updatedUserError || !updatedUser) {
    throw new Error("Unable to load updated user XP");
  }

  return updatedUser;
}

/**
 * Shapes completion side-effect results into the public response.
 * @returns The challenge completion payload.
 */
function buildChallengeCompletionResult(
  award: Awaited<ReturnType<typeof awardChallengeCompletion>>,
  updatedUser: Awaited<ReturnType<typeof loadUpdatedUserXp>>,
  achievementsEarned: Achievement[]
): ChallengeCompletionResult {
  return {
    xp_earned: award.xp_earned,
    new_total_xp: updatedUser.xp,
    streak_count: award.streakResult.streak_count,
    is_streak_milestone: award.streakResult.is_milestone,
    level_up: award.xpResult.level_up || updatedUser.level > award.xpResult.new_level,
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
  return await getChallengeHistoryWorkflow(userId, page, limit);
}

/**
 * Executes the extracted getChallengeHistory service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getChallengeHistory`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function getChallengeHistoryWorkflow(
  userId: string,
  page: number,
  limit: number
) {
  const pagination = getChallengeHistoryPagination(page, limit);
  const history = await loadChallengeHistoryAssignments(userId, pagination);
  const challengeIds = getHistoryChallengeIds(history.data ?? []);
  const challengesById = await getChallengesById(challengeIds);

  return buildChallengeHistoryResponse(history, challengesById, pagination);
}

/**
 * Normalizes challenge history pagination inputs.
 * @returns Safe page, limit, and range bounds.
 */
function getChallengeHistoryPagination(page: number, limit: number) {
  const safePage = Math.max(page, 1);
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  return {
    safePage,
    safeLimit,
    from: (safePage - 1) * safeLimit,
    to: safePage * safeLimit - 1
  };
}

/**
 * Loads paginated user challenge assignments.
 * @returns Assignment rows with exact count metadata.
 * @throws When history cannot be loaded.
 */
async function loadChallengeHistoryAssignments(
  userId: string,
  pagination: ReturnType<typeof getChallengeHistoryPagination>
) {
  const { data, error, count } = await supabaseAdmin
    .from("user_challenges")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("date_assigned", { ascending: false })
    .range(pagination.from, pagination.to);

  if (error) {
    throw new Error("Unable to load challenge history");
  }

  return { data, count };
}

/**
 * Collects distinct challenge ids from assignment history.
 * @returns Unique challenge ids for hydration.
 */
function getHistoryChallengeIds(data: UserChallenge[]): string[] {
  return [...new Set(data.map((row) => row.challenge_id))];
}

/**
 * Shapes history assignments and pagination into the existing response.
 * @returns Challenge history response with hydrated challenge data.
 */
function buildChallengeHistoryResponse(
  history: Awaited<ReturnType<typeof loadChallengeHistoryAssignments>>,
  challengesById: Awaited<ReturnType<typeof getChallengesById>>,
  pagination: ReturnType<typeof getChallengeHistoryPagination>
) {
  return {
    challenges: (history.data ?? []).map((assignment) => buildHistoryItem(assignment, challengesById)),
    pagination: buildHistoryPaginationMeta(history.count, pagination)
  };
}

/**
 * Hydrates one history assignment with challenge and savings details.
 * @returns One challenge history item.
 */
function buildHistoryItem(assignment: UserChallenge, challengesById: Map<string, Challenge>) {
  const challenge = challengesById.get(assignment.challenge_id) ?? null;

  return {
    ...assignment,
    challenge,
    carbon_saved_kg: challenge ? Number(challenge.carbon_save_kg) || 0 : 0
  };
}

/**
 * Builds pagination metadata for the history response.
 * @returns Pagination totals and current page values.
 */
function buildHistoryPaginationMeta(
  count: number | null,
  pagination: ReturnType<typeof getChallengeHistoryPagination>
) {
  return {
    page: pagination.safePage,
    limit: pagination.safeLimit,
    total: count ?? 0,
    total_pages: Math.ceil((count ?? 0) / pagination.safeLimit)
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
  return await assignBestChallengeWorkflow(userId, dateAssigned, excludedChallengeIds, altOffset);
}

/**
 * Executes the extracted assignBestChallenge service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `assignBestChallenge`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function assignBestChallengeWorkflow(
  userId: string,
  dateAssigned: string,
  excludedChallengeIds: string | string[] = [],
  altOffset = 0
): Promise<ChallengeWithContext> {
  const inputs = await loadChallengeAssignmentInputs(userId);
  const selectedChallenge = selectBestChallenge(inputs, excludedChallengeIds, altOffset);
  const assignment = await createChallengeAssignment(userId, selectedChallenge.id, dateAssigned);

  return await buildAssignedChallenge(userId, dateAssigned, inputs.highestCategory, selectedChallenge, assignment);
}

/**
 * Loads inputs needed for challenge assignment scoring.
 * @returns Highest category, recent history, difficulty, and active challenges.
 * @throws When no active challenges are available.
 */
async function loadChallengeAssignmentInputs(userId: string) {
  const [highestCategory, recentHistory, difficultyPreference, challengeResult] =
    await Promise.all([
      getHighestCarbonArea(userId),
      getRecentChallengeHistory(userId),
      getDifficultyPreference(userId),
      supabaseAdmin.from("challenges").select("*").eq("is_active", true)
    ]);

  if (challengeResult.error || !challengeResult.data || challengeResult.data.length === 0) {
    throw new Error("No active challenges available");
  }

  return { highestCategory, recentHistory, difficultyPreference, challenges: challengeResult.data };
}

/**
 * Picks the highest-scoring eligible challenge with alternative offset support.
 * @returns The selected challenge.
 * @throws When no challenge can be selected.
 */
function selectBestChallenge(
  inputs: Awaited<ReturnType<typeof loadChallengeAssignmentInputs>>,
  excludedChallengeIds: string | string[],
  altOffset: number
): Challenge {
  const challengePool = getEligibleChallengePool(inputs.challenges, excludedChallengeIds);
  const scoredChallenges = scoreChallengePool(inputs, challengePool);
  const selectedChallenge = scoredChallenges[altOffset]?.challenge ?? scoredChallenges[0]?.challenge;

  if (!selectedChallenge) {
    throw new Error("No alternative challenges available");
  }

  return selectedChallenge;
}

/**
 * Filters out excluded challenges while preserving the original fallback to all challenges.
 * @returns Eligible challenges or the original challenge list when none remain.
 */
function getEligibleChallengePool(challenges: Challenge[], excludedChallengeIds: string | string[]) {
  const excluded = Array.isArray(excludedChallengeIds) ? excludedChallengeIds : [excludedChallengeIds];
  const eligibleChallenges = challenges.filter((challenge) => !excluded.includes(challenge.id));

  return eligibleChallenges.length > 0 ? eligibleChallenges : challenges;
}

/**
 * Scores and sorts a challenge pool by suitability.
 * @returns Descending challenge scores.
 */
function scoreChallengePool(
  inputs: Awaited<ReturnType<typeof loadChallengeAssignmentInputs>>,
  challengePool: Challenge[]
) {
  return challengePool
    .map((challenge) => ({
      challenge,
      score: scoreChallenge(
        challenge,
        inputs.highestCategory,
        inputs.difficultyPreference,
        inputs.recentHistory
      )
    }))
    .sort((left, right) => right.score - left.score);
}

/**
 * Inserts the pending daily challenge assignment.
 * @returns The created user challenge assignment.
 * @throws When the assignment cannot be created.
 */
async function createChallengeAssignment(
  userId: string,
  challengeId: string,
  dateAssigned: string
): Promise<UserChallenge> {
  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .from("user_challenges")
    .insert({ user_id: userId, challenge_id: challengeId, date_assigned: dateAssigned, status: "pending" })
    .select("*")
    .single<UserChallenge>();

  if (assignmentError || !assignment) {
    throw new Error("Unable to assign daily challenge");
  }

  return assignment;
}

/**
 * Hydrates a newly assigned challenge with UI context.
 * @returns The assigned challenge response payload.
 */
async function buildAssignedChallenge(
  userId: string,
  dateAssigned: string,
  highestCategory: CarbonCategory,
  selectedChallenge: Challenge,
  assignment: UserChallenge
): Promise<ChallengeWithContext> {
  const carbonSaveKg = Number(selectedChallenge.carbon_save_kg);
  const [participants, streakWindow] = await Promise.all([
    countTodaysParticipants(selectedChallenge.id, dateAssigned),
    loadStreakWindow(userId, dateAssigned)
  ]);

  return buildChallengeWithContext(selectedChallenge, assignment, highestCategory, carbonSaveKg, participants, streakWindow, dateAssigned);
}

/**
 * Shapes an assigned challenge into the existing contextual response.
 * @returns Challenge with personalization, tips, equivalency, and streak context.
 */
function buildChallengeWithContext(
  challenge: Challenge,
  assignment: UserChallenge,
  highestCategory: CarbonCategory,
  carbonSaveKg: number,
  participants: number,
  streakWindow: Awaited<ReturnType<typeof loadStreakWindow>>,
  dateAssigned: string
): ChallengeWithContext {
  return {
    ...challenge,
    emoji: getChallengeEmoji(challenge),
    assignment,
    personalized_context: buildPersonalizedContext(highestCategory, carbonSaveKg),
    why: buildPersonalizedContext(highestCategory, carbonSaveKg),
    tips: buildTips(challenge.category, challenge.tips),
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
  return await getHighestCarbonAreaWorkflow(userId);
}

/**
 * Executes the extracted getHighestCarbonArea service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getHighestCarbonArea`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function getHighestCarbonAreaWorkflow(userId: string): Promise<CarbonCategory> {
  const summary = await loadMonthlyCarbonAreaSummary(userId);

  if (summary) {
    return getTopCarbonCategory(summary);
  }

  return await loadOnboardingHighestCarbonArea(userId);
}

/**
 * Loads this month's carbon category summary for challenge targeting.
 * @returns Monthly summary row or null when absent.
 */
async function loadMonthlyCarbonAreaSummary(userId: string) {
  const periodStart = currentIndiaMonthStart();
  const { data: summary } = await supabaseAdmin
    .from("carbon_summaries")
    .select("food_kg,transport_kg,home_kg,shopping_kg,travel_kg,other_kg")
    .eq("user_id", userId)
    .eq("period_type", "month")
    .eq("period_start", periodStart)
    .maybeSingle();

  return summary;
}

/**
 * Finds the highest category in a monthly carbon summary row.
 * @returns The category with the largest kilogram value.
 */
function getTopCarbonCategory(summary: NonNullable<Awaited<ReturnType<typeof loadMonthlyCarbonAreaSummary>>>): CarbonCategory {
  const entries = [
    ["food", Number(summary.food_kg)],
    ["transport", Number(summary.transport_kg)],
    ["home", Number(summary.home_kg)],
    ["shopping", Number(summary.shopping_kg)],
    ["travel", Number(summary.travel_kg)],
    ["other", Number(summary.other_kg)]
  ] as Array<[CarbonCategory, number]>;

  return entries.reduce((highest, current) => current[1] > highest[1] ? current : highest)[0];
}

/**
 * Loads onboarding fallback for highest carbon category.
 * @returns Onboarding category or shopping as the original fallback.
 */
async function loadOnboardingHighestCarbonArea(userId: string): Promise<CarbonCategory> {
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
