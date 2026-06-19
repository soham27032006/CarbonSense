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
  const preferences = isRecord(value) ? value : {};
  const daily = isRecord(preferences.daily_challenge)
    ? preferences.daily_challenge
    : {};

  return {
    daily_challenge: {
      enabled:
        typeof daily.enabled === "boolean"
          ? daily.enabled
          : typeof preferences.daily_challenge_enabled === "boolean"
            ? preferences.daily_challenge_enabled
            : base.daily_challenge.enabled,
      time:
        typeof daily.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(daily.time)
          ? daily.time
          : typeof preferences.daily_challenge_time === "string" &&
              /^([01]\d|2[0-3]):[0-5]\d$/.test(preferences.daily_challenge_time)
            ? preferences.daily_challenge_time
            : base.daily_challenge.time
    },
    streak_at_risk:
      typeof preferences.streak_at_risk === "boolean"
        ? preferences.streak_at_risk
        : base.streak_at_risk,
    weekly_summary:
      typeof preferences.weekly_summary === "boolean"
        ? preferences.weekly_summary
        : base.weekly_summary,
    achievement_earned:
      typeof preferences.achievement_earned === "boolean"
        ? preferences.achievement_earned
        : base.achievement_earned
  };
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
 * Runs the getProfile service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getProfile(userId: string) {
  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !user) {
    throw new Error("Unable to load profile");
  }

  const [bankResult, teamsResult] = await Promise.allSettled([
    getProfileBankConnections(userId),
    getProfileTeams(userId)
  ]);
  const bankConnections =
    bankResult.status === "fulfilled" ? bankResult.value : [];
  const teams = teamsResult.status === "fulfilled" ? teamsResult.value : [];

  if (bankResult.status === "rejected") {
    console.error("Failed to load bank connections for profile");
  }

  if (teamsResult.status === "rejected") {
    console.error("Failed to load teams for profile");
  }

  let challengesCompleted = 0;
  let carbonSavedKg = 0;

  try {
    const { count } = await supabaseAdmin
      .from("user_challenges")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed");

    challengesCompleted = count ?? 0;
  } catch (challengeCountError) {
    console.error(
      "Failed to count completed challenges for profile",
      challengeCountError
    );
  }

  try {
    const { data: savedData, error: savedError } = await supabaseAdmin
      .from("user_challenges")
      .select("challenge:challenges(carbon_save_kg)")
      .eq("user_id", userId)
      .eq("status", "completed");

    if (savedError) {
      throw savedError;
    }

    if (savedData) {
      const normalizedRows = savedData as Array<{
        challenge?: Array<{ carbon_save_kg?: number }> | { carbon_save_kg?: number } | null;
      }>;
      carbonSavedKg = Math.round(
        normalizedRows.reduce((sum, row) => {
          const challengeValue = Array.isArray(row.challenge)
            ? row.challenge[0]
            : row.challenge;

          return sum + Number(challengeValue?.carbon_save_kg ?? 0);
        }, 0) * 10
      ) / 10;
    }
  } catch (carbonSavedError) {
    console.error("Failed to calculate carbon saved for profile", carbonSavedError);
  }

  const onboarding =
    user.onboarding_data && typeof user.onboarding_data === "object" && !Array.isArray(user.onboarding_data)
      ? user.onboarding_data
      : {};
  const savedSettings =
    "settings" in onboarding &&
    onboarding.settings &&
    typeof onboarding.settings === "object" &&
    !Array.isArray(onboarding.settings)
      ? onboarding.settings
      : {};
  const settings = normalizeProfileSettings(savedSettings, onboarding.country);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar_url: user.avatar_url,
    carbon_age: user.carbon_age,
    level: user.level,
    level_name: user.level_name,
    xp: user.xp,
    streak_count: user.streak_count,
    streak_max: user.streak_max,
    streak_freeze_available: user.streak_freeze_available,
    onboarding_complete: user.onboarding_complete,
    onboarding_data: user.onboarding_data,
    bank_connections: bankConnections,
    teams,
    member_since: user.created_at,
    notification_preferences: normalizeNotificationPreferences(user.notification_preferences),
    settings,
    challenges_completed: challengesCompleted,
    carbon_saved_kg: carbonSavedKg
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
  const { settings, ...directFields } = update;
  const dbUpdate: Record<string, unknown> = {};
  let currentProfile:
    | { onboarding_data: Json; notification_preferences: Json }
    | null = null;

  if (directFields.name !== undefined) {
    dbUpdate.name = directFields.name;
  }

  if (directFields.avatar_url !== undefined) {
    dbUpdate.avatar_url = directFields.avatar_url;
  }

  if (settings || directFields.notification_preferences !== undefined) {
    const { data, error: currentError } = await supabaseAdmin
      .from("users")
      .select("onboarding_data,notification_preferences")
      .eq("id", userId)
      .single<{ onboarding_data: Json; notification_preferences: Json }>();

    if (currentError) {
      throw new Error("Unable to load current profile preferences");
    }

    currentProfile = data;
  }

  if (directFields.notification_preferences !== undefined) {
    const currentNotifications = normalizeNotificationPreferences(
      currentProfile?.notification_preferences
    );
    dbUpdate.notification_preferences = normalizeNotificationPreferences(
      directFields.notification_preferences,
      currentNotifications
    );
  }

  if (settings) {
    const existingOnboarding =
      currentProfile?.onboarding_data &&
      typeof currentProfile.onboarding_data === "object" &&
      !Array.isArray(currentProfile.onboarding_data)
        ? currentProfile.onboarding_data
        : {};
    const existingSettings =
      "settings" in existingOnboarding &&
      existingOnboarding.settings &&
      typeof existingOnboarding.settings === "object" &&
      !Array.isArray(existingOnboarding.settings)
        ? existingOnboarding.settings
        : {};

    const currentSettings = normalizeProfileSettings(
      existingSettings,
      existingOnboarding.country
    );
    const nextSettings = normalizeProfileSettings(
      settings,
      settings.country,
      currentSettings
    );

    dbUpdate.onboarding_data = {
      ...existingOnboarding,
      settings: nextSettings
    };
  }

  if (Object.keys(dbUpdate).length === 0) {
    return getProfile(userId);
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .update(dbUpdate)
    .eq("id", userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Unable to update profile");
  }

  return getProfile(userId);
}

/**
 * Runs the getCarbonAgeDetail service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getCarbonAgeDetail(userId: string) {
  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("carbon_age,onboarding_data")
    .eq("id", userId)
    .single<{
      carbon_age: number;
      onboarding_data: {
        biological_age?: number;
        estimated_annual_tons?: number;
      };
    }>();

  if (error || !user) {
    throw new Error("Unable to load carbon age");
  }

  const annualCarbonTons =
    (await getCurrentAnnualCarbonTons(userId)) ??
    user.onboarding_data.estimated_annual_tons ??
    0;
  const startingAnnualTons = user.onboarding_data.estimated_annual_tons ?? annualCarbonTons;

  return {
    carbon_age: user.carbon_age,
    biological_age: user.onboarding_data.biological_age ?? 25,
    annual_carbon_tons: Math.round(annualCarbonTons * 100) / 100,
    target_tons: 4.0,
    improvement_since_start:
      startingAnnualTons > 0
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
  const [bankConnections, teamIds] = await Promise.all([
    getRawBankConnections(userId),
    getUserTeamIds(userId)
  ]);

  for (const connection of bankConnections) {
    if (connection.status !== "disconnected") {
      await safeDisconnectBank(userId, connection.id);
    }
  }

  await deleteFromTable("user_challenges", userId);
  await deleteFromTable("transactions", userId);
  await deleteFromTable("bank_connections", userId);
  await deleteFromTable("team_memberships", userId);
  await deleteFromTable("user_achievements", userId);
  await deleteFromTable("carbon_summaries", userId);
  await deleteFromTable("copilot_conversations", userId);

  await Promise.all(teamIds.map((teamId) => updateTeamStats(teamId)));

  const { error: userDeleteError } = await supabaseAdmin
    .from("users")
    .delete()
    .eq("id", userId);

  if (userDeleteError) {
    throw new Error("Unable to delete user profile");
  }

  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (authDeleteError) {
    throw new Error("Unable to delete auth user");
  }

  return {
    success: true,
    message: "All data permanently deleted"
  };
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
