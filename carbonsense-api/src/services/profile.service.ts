/**
 * Service layer for CarbonSense domain logic. Keeps persistence, third-party API calls, and calculations behind controller-safe functions.
 */
import { supabaseAdmin } from "../config/supabase";
import type { Json } from "../types";
import { disconnectBank } from "./plaid.service";
import { updateTeamStats } from "./team.service";

type ProfileUpdate = {
  name?: string;
  avatar_url?: string | null;
  notification_preferences?: Json;
  settings?: {
    units?: string;
    country?: string;
  };
};

type ProfileSettings = {
  units: "metric" | "imperial";
  country: string;
};

type NotificationPreferences = {
  daily_challenge: {
    enabled: boolean;
    time: string;
  };
  streak_at_risk: boolean;
  weekly_summary: boolean;
  achievement_earned: boolean;
};

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  daily_challenge: {
    enabled: true,
    time: "09:00"
  },
  streak_at_risk: true,
  weekly_summary: true,
  achievement_earned: true
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeNotificationPreferences(
  value: unknown,
  base: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES
): NotificationPreferences {
  return normalizeNotificationPreferencesWorkflow(value, base);
}

/**
 * Executes the extracted normalizeNotificationPreferences service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `normalizeNotificationPreferences`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
function normalizeNotificationPreferencesWorkflow(
  value: unknown,
  base: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES
): NotificationPreferences {
  const preferences = isRecord(value) ? value : {};

  return {
    daily_challenge: normalizeDailyChallengePreferences(preferences, base),
    streak_at_risk: normalizeBooleanPreference(preferences.streak_at_risk, base.streak_at_risk),
    weekly_summary: normalizeBooleanPreference(preferences.weekly_summary, base.weekly_summary),
    achievement_earned: normalizeBooleanPreference(
      preferences.achievement_earned,
      base.achievement_earned
    )
  };
}

/**
 * Normalizes daily challenge notification preferences and legacy flat fields.
 * @returns Daily challenge notification preferences with safe defaults.
 */
function normalizeDailyChallengePreferences(
  preferences: Record<string, unknown>,
  base: NotificationPreferences
): NotificationPreferences["daily_challenge"] {
  const daily = isRecord(preferences.daily_challenge) ? preferences.daily_challenge : {};

  return {
    enabled: normalizeBooleanPreference(
      daily.enabled,
      normalizeBooleanPreference(preferences.daily_challenge_enabled, base.daily_challenge.enabled)
    ),
    time: normalizeDailyChallengeTime(daily.time, preferences.daily_challenge_time, base)
  };
}

/**
 * Normalizes a boolean preference with fallback.
 * @returns The value when boolean, otherwise the fallback.
 */
function normalizeBooleanPreference(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Normalizes nested and legacy daily challenge time values.
 * @returns A valid HH:mm preference or the base preference time.
 */
function normalizeDailyChallengeTime(
  nestedTime: unknown,
  legacyTime: unknown,
  base: NotificationPreferences
): string {
  if (typeof nestedTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(nestedTime)) {
    return nestedTime;
  }

  return typeof legacyTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(legacyTime)
    ? legacyTime
    : base.daily_challenge.time;
}

function normalizeUnits(value: unknown, fallback: ProfileSettings["units"] = "metric") {
  return value === "imperial" || value === "metric" ? value : fallback;
}

function normalizeCountry(value: unknown, fallback = "US"): string {
  const country = typeof value === "string" ? value.trim() : "";
  const upper = country.toUpperCase();
  const countryMap: Record<string, string> = {
    "UNITED STATES": "US",
    "UNITED KINGDOM": "GB",
    CANADA: "CA",
    AUSTRALIA: "AU",
    GERMANY: "DE",
    FRANCE: "FR",
    NETHERLANDS: "NL",
    SWEDEN: "SE",
    SPAIN: "ES",
    ITALY: "IT",
    JAPAN: "JP",
    BRAZIL: "BR",
    INDIA: "IN"
  };

  if (/^[A-Z]{2}$/.test(upper)) {
    return upper;
  }

  return countryMap[upper] ?? fallback;
}

function normalizeProfileSettings(
  settings: unknown,
  onboardingCountry: unknown,
  base: ProfileSettings = { units: "metric", country: "US" }
): ProfileSettings {
  const savedSettings = isRecord(settings) ? settings : {};

  return {
    units: normalizeUnits(savedSettings.units, base.units),
    country: normalizeCountry(
      savedSettings.country ?? onboardingCountry,
      base.country
    )
  };
}

/**
 * Normalizes onboarding data to a record for profile settings reads.
 * @returns Onboarding record or an empty object.
 */
function getProfileOnboardingRecord(onboardingData: unknown): Record<string, unknown> {
  return isRecord(onboardingData) ? onboardingData : {};
}

/**
 * Extracts saved settings from normalized onboarding data.
 * @returns Saved settings record or an empty object.
 */
function getProfileSavedSettings(onboarding: Record<string, unknown>): Record<string, unknown> {
  return isRecord(onboarding.settings) ? onboarding.settings : {};
}

/**
 * Runs the getProfile service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getProfile(userId: string) {
  return await getProfileWorkflow(userId);
}

/**
 * Executes the extracted getProfile service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getProfile`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function getProfileWorkflow(userId: string) {
  const user = await loadProfileUser(userId);
  const relatedData = await loadProfileRelatedData(userId);
  const challengesCompleted = await countCompletedProfileChallenges(userId);
  const carbonSavedKg = await calculateProfileCarbonSaved(userId);

  return buildProfileResponse(user, relatedData, challengesCompleted, carbonSavedKg);
}

/**
 * Loads the base user profile record.
 * @returns The user row used by profile response shaping.
 * @throws When the profile cannot be loaded.
 */
async function loadProfileUser(userId: string) {
  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !user) {
    throw new Error("Unable to load profile");
  }

  return user;
}

/**
 * Loads optional bank and team profile data with existing fallback behavior.
 * @returns Bank connections and teams, defaulting to empty arrays on failure.
 */
async function loadProfileRelatedData(userId: string) {
  const [bankResult, teamsResult] = await Promise.allSettled([
    getProfileBankConnections(userId),
    getProfileTeams(userId)
  ]);

  logProfileRelatedDataFailures(bankResult, teamsResult);

  return {
    bankConnections: bankResult.status === "fulfilled" ? bankResult.value : [],
    teams: teamsResult.status === "fulfilled" ? teamsResult.value : []
  };
}

/**
 * Logs optional profile data failures without failing profile loading.
 * @returns Nothing.
 */
function logProfileRelatedDataFailures(
  bankResult: PromiseSettledResult<Awaited<ReturnType<typeof getProfileBankConnections>>>,
  teamsResult: PromiseSettledResult<Awaited<ReturnType<typeof getProfileTeams>>>
): void {
  if (bankResult.status === "rejected") {
    console.error("Failed to load bank connections for profile");
  }

  if (teamsResult.status === "rejected") {
    console.error("Failed to load teams for profile");
  }
}

/**
 * Counts completed profile challenges with the existing non-fatal fallback.
 * @returns Completed challenge count or zero if counting fails.
 */
async function countCompletedProfileChallenges(userId: string): Promise<number> {
  try {
    const { count } = await supabaseAdmin
      .from("user_challenges")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed");

    return count ?? 0;
  } catch (challengeCountError) {
    console.error("Failed to count completed challenges for profile", challengeCountError);
    return 0;
  }
}

/**
 * Calculates completed challenge carbon savings with the existing fallback.
 * @returns Carbon saved in kg, rounded to one decimal place.
 */
async function calculateProfileCarbonSaved(userId: string): Promise<number> {
  try {
    const savedData = await loadProfileSavedChallengeRows(userId);
    return savedData ? sumProfileSavedCarbon(savedData) : 0;
  } catch (carbonSavedError) {
    console.error("Failed to calculate carbon saved for profile", carbonSavedError);
    return 0;
  }
}

/**
 * Loads completed challenge savings rows for profile totals.
 * @returns Raw rows returned by Supabase.
 * @throws When Supabase returns an error.
 */
async function loadProfileSavedChallengeRows(userId: string) {
  const { data: savedData, error: savedError } = await supabaseAdmin
    .from("user_challenges")
    .select("challenge:challenges(carbon_save_kg)")
    .eq("user_id", userId)
    .eq("status", "completed");

  if (savedError) {
    throw savedError;
  }

  return savedData;
}

/**
 * Sums profile carbon savings rows while preserving Supabase nested shapes.
 * @returns Rounded carbon savings in kilograms.
 */
function sumProfileSavedCarbon(savedData: Awaited<ReturnType<typeof loadProfileSavedChallengeRows>>): number {
  const normalizedRows = savedData as Array<{
    challenge?: Array<{ carbon_save_kg?: number }> | { carbon_save_kg?: number } | null;
  }>;

  return Math.round(normalizedRows.reduce(sumSavedCarbonRow, 0) * 10) / 10;
}

/**
 * Adds one profile saved-carbon row to the running sum.
 * @returns Updated running total.
 */
function sumSavedCarbonRow(sum: number, row: {
  challenge?: Array<{ carbon_save_kg?: number }> | { carbon_save_kg?: number } | null;
}): number {
  const challengeValue = Array.isArray(row.challenge) ? row.challenge[0] : row.challenge;

  return sum + Number(challengeValue?.carbon_save_kg ?? 0);
}

/**
 * Shapes user and related profile data into the existing response contract.
 * @returns Complete profile response payload.
 */
function buildProfileResponse(
  user: Awaited<ReturnType<typeof loadProfileUser>>,
  relatedData: Awaited<ReturnType<typeof loadProfileRelatedData>>,
  challengesCompleted: number,
  carbonSavedKg: number
) {
  const onboarding = getProfileOnboardingRecord(user.onboarding_data);
  const savedSettings = getProfileSavedSettings(onboarding);

  return {
    id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url,
    carbon_age: user.carbon_age, level: user.level, level_name: user.level_name, xp: user.xp,
    streak_count: user.streak_count, streak_max: user.streak_max,
    streak_freeze_available: user.streak_freeze_available, onboarding_complete: user.onboarding_complete,
    onboarding_data: user.onboarding_data, bank_connections: relatedData.bankConnections, teams: relatedData.teams,
    member_since: user.created_at, notification_preferences: normalizeNotificationPreferences(user.notification_preferences),
    settings: normalizeProfileSettings(savedSettings, onboarding.country),
    challenges_completed: challengesCompleted, carbon_saved_kg: carbonSavedKg
  };
}

/**
 * Runs the updateProfile service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @param update - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function updateProfile(userId: string, update: ProfileUpdate) {
  return await updateProfileWorkflow(userId, update);
}

/**
 * Executes the extracted updateProfile service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `updateProfile`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function updateProfileWorkflow(userId: string, update: ProfileUpdate) {
  const dbUpdate = await buildProfileDbUpdate(userId, update);

  if (Object.keys(dbUpdate).length === 0) {
    return getProfile(userId);
  }

  await saveProfileUpdate(userId, dbUpdate);

  return getProfile(userId);
}

/**
 * Builds the database update payload for profile edits.
 * @returns Update payload preserving existing preference merge behavior.
 * @throws When current preferences cannot be loaded.
 */
async function buildProfileDbUpdate(userId: string, update: ProfileUpdate): Promise<Record<string, unknown>> {
  const { settings, ...directFields } = update;
  const dbUpdate: Record<string, unknown> = {};
  const currentProfile = settings || directFields.notification_preferences !== undefined
    ? await loadCurrentProfilePreferences(userId)
    : null;

  applyDirectProfileFields(dbUpdate, directFields);
  applyNotificationUpdate(dbUpdate, directFields.notification_preferences, currentProfile);
  applySettingsUpdate(dbUpdate, settings, currentProfile);

  return dbUpdate;
}

/**
 * Applies direct scalar profile fields to the update payload.
 * @returns Nothing; mutates the supplied update payload.
 */
function applyDirectProfileFields(dbUpdate: Record<string, unknown>, directFields: Omit<ProfileUpdate, "settings">): void {
  if (directFields.name !== undefined) {
    dbUpdate.name = directFields.name;
  }

  if (directFields.avatar_url !== undefined) {
    dbUpdate.avatar_url = directFields.avatar_url;
  }
}

/**
 * Loads existing preference fields needed for merge updates.
 * @returns Current onboarding and notification preferences.
 * @throws When preferences cannot be loaded.
 */
async function loadCurrentProfilePreferences(userId: string) {
  const { data, error: currentError } = await supabaseAdmin
    .from("users")
    .select("onboarding_data,notification_preferences")
    .eq("id", userId)
    .single<{ onboarding_data: Json; notification_preferences: Json }>();

  if (currentError) {
    throw new Error("Unable to load current profile preferences");
  }

  return data;
}

/**
 * Applies notification preference changes with current preferences as base.
 * @returns Nothing; mutates the supplied update payload.
 */
function applyNotificationUpdate(
  dbUpdate: Record<string, unknown>,
  notificationPreferences: Json | undefined,
  currentProfile: Awaited<ReturnType<typeof loadCurrentProfilePreferences>> | null
): void {
  if (notificationPreferences !== undefined) {
    const currentNotifications = normalizeNotificationPreferences(currentProfile?.notification_preferences);
    dbUpdate.notification_preferences = normalizeNotificationPreferences(notificationPreferences, currentNotifications);
  }
}

/**
 * Applies settings changes into onboarding data while preserving other onboarding fields.
 * @returns Nothing; mutates the supplied update payload.
 */
function applySettingsUpdate(
  dbUpdate: Record<string, unknown>,
  settings: ProfileUpdate["settings"],
  currentProfile: Awaited<ReturnType<typeof loadCurrentProfilePreferences>> | null
): void {
  if (!settings) {
    return;
  }

  const existingOnboarding = getProfileOnboardingRecord(currentProfile?.onboarding_data);
  const currentSettings = normalizeProfileSettings(getProfileSavedSettings(existingOnboarding), existingOnboarding.country);
  const nextSettings = normalizeProfileSettings(settings, settings.country, currentSettings);

  dbUpdate.onboarding_data = { ...existingOnboarding, settings: nextSettings };
}

/**
 * Persists a profile update payload.
 * @returns Resolves after the profile update succeeds.
 * @throws When the profile cannot be updated.
 */
async function saveProfileUpdate(userId: string, dbUpdate: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .update(dbUpdate)
    .eq("id", userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Unable to update profile");
  }
}

/**
 * Runs the getCarbonAgeDetail service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getCarbonAgeDetail(userId: string) {
  return await getCarbonAgeDetailWorkflow(userId);
}

/**
 * Executes the extracted getCarbonAgeDetail service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getCarbonAgeDetail`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function getCarbonAgeDetailWorkflow(userId: string) {
  const user = await loadCarbonAgeUser(userId);
  const annualCarbonTons = await getCarbonAgeAnnualTons(userId, user);

  return buildCarbonAgeDetail(user, annualCarbonTons);
}

/**
 * Loads carbon-age profile data.
 * @returns Carbon age and onboarding data.
 * @throws When carbon age cannot be loaded.
 */
async function loadCarbonAgeUser(userId: string) {
  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("carbon_age,onboarding_data")
    .eq("id", userId)
    .single<{ carbon_age: number; onboarding_data: { biological_age?: number; estimated_annual_tons?: number } }>();

  if (error || !user) {
    throw new Error("Unable to load carbon age");
  }

  return user;
}

/**
 * Resolves current annual tons with onboarding fallback.
 * @returns Current annual tons or zero.
 */
async function getCarbonAgeAnnualTons(
  userId: string,
  user: Awaited<ReturnType<typeof loadCarbonAgeUser>>
): Promise<number> {
  return (await getCurrentAnnualCarbonTons(userId)) ?? user.onboarding_data.estimated_annual_tons ?? 0;
}

/**
 * Shapes carbon age values into the existing detail response.
 * @returns Carbon age detail payload.
 */
function buildCarbonAgeDetail(user: Awaited<ReturnType<typeof loadCarbonAgeUser>>, annualCarbonTons: number) {
  const startingAnnualTons = user.onboarding_data.estimated_annual_tons ?? annualCarbonTons;

  return {
    carbon_age: user.carbon_age,
    biological_age: user.onboarding_data.biological_age ?? 25,
    annual_carbon_tons: Math.round(annualCarbonTons * 100) / 100,
    target_tons: 4.0,
    improvement_since_start: startingAnnualTons > 0
      ? Math.round(((startingAnnualTons - annualCarbonTons) / startingAnnualTons) * 100)
      : 0
  };
}

/**
 * Runs the deleteProfile service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function deleteProfile(userId: string): Promise<{
  success: true;
  message: string;
}> {
  return await deleteProfileWorkflow(userId);
}

/**
 * Executes the extracted deleteProfile service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `deleteProfile`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function deleteProfileWorkflow(userId: string): Promise<{
  success: true;
  message: string;
}> {
  const [bankConnections, teamIds] = await Promise.all([
    getRawBankConnections(userId),
    getUserTeamIds(userId)
  ]);

  await disconnectActiveBankConnections(userId, bankConnections);
  await deleteProfileOwnedData(userId);
  await Promise.all(teamIds.map((teamId) => updateTeamStats(teamId)));
  await deleteUserProfileRow(userId);
  await deleteAuthUser(userId);

  return buildDeleteProfileResult();
}

/**
 * Disconnects all active bank connections before profile deletion.
 * @returns Resolves after every active bank disconnect attempt completes.
 */
async function disconnectActiveBankConnections(
  userId: string,
  bankConnections: Awaited<ReturnType<typeof getRawBankConnections>>
): Promise<void> {
  for (const connection of bankConnections) {
    if (connection.status !== "disconnected") {
      await safeDisconnectBank(userId, connection.id);
    }
  }
}

/**
 * Deletes all user-owned rows outside the user/auth records.
 * @returns Resolves after all scoped deletes complete.
 * @throws When any table delete fails.
 */
async function deleteProfileOwnedData(userId: string): Promise<void> {
  await deleteFromTable("user_challenges", userId);
  await deleteFromTable("transactions", userId);
  await deleteFromTable("bank_connections", userId);
  await deleteFromTable("team_memberships", userId);
  await deleteFromTable("user_achievements", userId);
  await deleteFromTable("carbon_summaries", userId);
  await deleteFromTable("copilot_conversations", userId);
}

/**
 * Deletes the user profile row.
 * @returns Resolves after the profile row is deleted.
 * @throws When the profile row cannot be deleted.
 */
async function deleteUserProfileRow(userId: string): Promise<void> {
  const { error: userDeleteError } = await supabaseAdmin
    .from("users")
    .delete()
    .eq("id", userId);

  if (userDeleteError) {
    throw new Error("Unable to delete user profile");
  }
}

/**
 * Deletes the Supabase auth user.
 * @returns Resolves after the auth user is deleted.
 * @throws When the auth user cannot be deleted.
 */
async function deleteAuthUser(userId: string): Promise<void> {
  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (authDeleteError) {
    throw new Error("Unable to delete auth user");
  }
}

/**
 * Builds the delete-profile success payload.
 * @returns Static success response.
 */
function buildDeleteProfileResult(): { success: true; message: string } {
  return { success: true, message: "All data permanently deleted" };
}

async function getProfileBankConnections(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("bank_connections")
    .select("id,institution_name,status,last_synced")
    .eq("user_id", userId);

  if (error) {
    throw new Error("Unable to load bank connections");
  }

  return data ?? [];
}

async function safeDisconnectBank(
  userId: string,
  connectionId: string
): Promise<void> {
  try {
    await disconnectBank(userId, connectionId);
  } catch (error) {
    console.error(`Failed to disconnect bank ${connectionId}`, error);
  }
}

async function getProfileTeams(userId: string) {
  const teamIds = await getUserTeamIds(userId);

  if (teamIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("teams")
    .select("id,name,type,member_count")
    .in("id", teamIds);

  if (error) {
    throw new Error("Unable to load profile teams");
  }

  return data ?? [];
}

async function getRawBankConnections(userId: string): Promise<
  Array<{ id: string; status: string }>
> {
  const { data, error } = await supabaseAdmin
    .from("bank_connections")
    .select("id,status")
    .eq("user_id", userId);

  if (error) {
    throw new Error("Unable to load bank connections");
  }

  return data ?? [];
}

async function getUserTeamIds(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("team_memberships")
    .select("team_id")
    .eq("user_id", userId);

  if (error) {
    throw new Error("Unable to load team memberships");
  }

  return (data ?? []).map((row) => row.team_id);
}

async function getCurrentAnnualCarbonTons(userId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("carbon_summaries")
    .select("total_carbon_kg")
    .eq("user_id", userId)
    .eq("period_type", "month")
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle<{ total_carbon_kg: number }>();

  if (error || !data) {
    return null;
  }

  return (Number(data.total_carbon_kg) * 12) / 1000;
}

async function deleteFromTable(table: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin.from(table).delete().eq("user_id", userId);

  if (error) {
    throw new Error(`Unable to delete ${table}`);
  }
}
