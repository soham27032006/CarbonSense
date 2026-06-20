/**
 * Service layer for CarbonSense domain logic. Keeps persistence, third-party API calls, and calculations behind controller-safe functions.
 */
import { redis, redisEnabled } from "../config/redis";
import { supabaseAdmin } from "../config/supabase";
import { getEquivalencies } from "../utils/equivalencies";

const lifetimeSavedCacheTtlSeconds = 60 * 60;

function getLifetimeSavedCacheKey(userId: string): string {
  return `user:${userId}:lifetime_carbon_saved_kg`;
}

/**
 * Runs the getImpactTotal service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getImpactTotal(userId: string) {
  return await getImpactTotalWorkflow(userId);
}

/**
 * Executes the extracted getImpactTotal service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getImpactTotal`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
type ImpactTotalData = {
  user: {
    created_at: string;
    streak_count: number;
    streak_max: number;
    level: number;
    level_name: string;
  };
  challengesCompleted: number;
  lifetimeCarbonSavedKg: number;
  teamsJoined: number;
  achievementsEarned: number;
};

async function getImpactTotalWorkflow(userId: string) {
  return buildImpactTotal(await loadImpactTotalData(userId));
}

/**
 * Loads user, challenge, carbon, team, and achievement counts for impact totals.
 * @returns Aggregated impact inputs used by `getImpactTotalWorkflow`.
 * @throws When the user impact summary cannot be loaded.
 */
async function loadImpactTotalData(userId: string): Promise<ImpactTotalData> {
  const [{ data: user, error: userError }, challengesCompleted, lifetimeCarbonSavedKg, { count: teamsJoined }, { count: achievementsEarned }] = await Promise.all([
    supabaseAdmin.from("users").select("created_at,streak_count,streak_max,level,level_name").eq("id", userId).single<ImpactTotalData["user"]>(),
    getCompletedChallengeCount(userId),
    getLifetimeCarbonSaved(userId),
    supabaseAdmin.from("team_memberships").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabaseAdmin.from("user_achievements").select("id", { count: "exact", head: true }).eq("user_id", userId)
  ]);

  if (userError || !user) throw new Error("Unable to load impact summary");
  return { user, challengesCompleted, lifetimeCarbonSavedKg, teamsJoined: teamsJoined ?? 0, achievementsEarned: achievementsEarned ?? 0 };
}

/**
 * Shapes loaded impact totals into the public impact response.
 * @returns Impact total response consumed by controllers.
 */
function buildImpactTotal(data: ImpactTotalData) {
  return {
    lifetime_carbon_saved_kg: data.lifetimeCarbonSavedKg,
    challenges_completed: data.challengesCompleted,
    days_active: getDaysActive(data.user.created_at),
    current_streak: data.user.streak_count,
    best_streak: data.user.streak_max,
    level: data.user.level,
    level_name: data.user.level_name,
    teams_joined: data.teamsJoined,
    achievements_earned: data.achievementsEarned
  };
}

/**
 * Runs the getImpactEquivalencies service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getImpactEquivalencies(userId: string) {
  const carbonSavedKg = await getLifetimeCarbonSaved(userId);
  const equivalencies = getEquivalencies(carbonSavedKg);

  return {
    carbon_saved_kg: carbonSavedKg,
    equivalencies: {
      trees_year: {
        value: equivalencies.trees_absorbed,
        text: `Equivalent to ${equivalencies.trees_absorbed} trees absorbing CO2 for a year`
      },
      miles_not_driven: {
        value: equivalencies.miles_driven,
        text: `Equivalent to ${equivalencies.miles_driven} miles not driven`
      },
      smartphones_charged: {
        value: equivalencies.smartphones_charged,
        text: `Equivalent to ${equivalencies.smartphones_charged} smartphone charges`
      },
      flights_saved: {
        value: equivalencies.flights_ny_to_la,
        text: `Equivalent to ${equivalencies.flights_ny_to_la} New York to Los Angeles flights`
      },
      showers_skipped: {
        value: equivalencies.shower_minutes,
        text: `Equivalent to ${equivalencies.shower_minutes} shower minutes`
      }
    }
  };
}

/**
 * Runs the getImpactShareCard service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getImpactShareCard(userId: string) {
  return await getImpactShareCardWorkflow(userId);
}

/**
 * Executes the extracted getImpactShareCard service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getImpactShareCard`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
type ImpactShareCardData = {
  user: {
    name: string;
    created_at: string;
    streak_count: number;
    level: number;
    level_name: string;
  };
  carbonSavedKg: number;
  challengesCompleted: number;
};

async function getImpactShareCardWorkflow(userId: string) {
  return buildImpactShareCard(await loadImpactShareCardData(userId));
}

/**
 * Loads the profile, carbon savings, and challenge count for the share card.
 * @returns Data needed to render a share card response.
 * @throws When share card data cannot be loaded.
 */
async function loadImpactShareCardData(userId: string): Promise<ImpactShareCardData> {
  const [{ data: user, error }, carbonSavedKg, challengesCompleted] = await Promise.all([
    supabaseAdmin.from("users").select("name,created_at,streak_count,level,level_name").eq("id", userId).single<ImpactShareCardData["user"]>(),
    getLifetimeCarbonSaved(userId),
    getCompletedChallengeCount(userId)
  ]);

  if (error || !user) throw new Error("Unable to load share card data");
  return { user, carbonSavedKg, challengesCompleted };
}

/**
 * Shapes share card data into the public response contract.
 * @returns Share card payload consumed by controllers.
 */
function buildImpactShareCard(data: ImpactShareCardData) {
  const equivalencies = getEquivalencies(data.carbonSavedKg);
  return {
    user_name: data.user.name,
    carbon_saved_kg: data.carbonSavedKg,
    streak: data.user.streak_count,
    level_name: data.user.level_name,
    top_equivalency: equivalencies.human_readable.miles_driven,
    challenges_completed: data.challengesCompleted,
    member_since: data.user.created_at,
    card_theme: getCardTheme(data.user.level)
  };
}

/**
 * Runs the getLifetimeCarbonSaved service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getLifetimeCarbonSaved(userId: string): Promise<number> {
  const cacheKey = getLifetimeSavedCacheKey(userId);
  const cached = await readLifetimeSavedCache(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const computed = await computeLifetimeCarbonSaved(userId);
  await writeLifetimeSavedCache(cacheKey, computed);
  return computed;
}

/**
 * Invalidates the cached lifetime carbon saved total for a user.
 * Call after a challenge completion or skip that affects the total.
 * @returns Resolves after the cache key is removed.
 */
export async function invalidateLifetimeCarbonSaved(userId: string): Promise<void> {
  if (!redisEnabled || !redis) {
    return;
  }
  await redis!.del(getLifetimeSavedCacheKey(userId));
}

async function readLifetimeSavedCache(cacheKey: string): Promise<number | null> {
  if (!redisEnabled || !redis) {
    return null;
  }
  const cached = await redis!.get(cacheKey);
  if (!cached) {
    return null;
  }
  const parsed = Number(cached);
  return Number.isFinite(parsed) ? parsed : null;
}

async function writeLifetimeSavedCache(cacheKey: string, value: number): Promise<void> {
  if (!redisEnabled || !redis) {
    return;
  }
  await redis!.set(cacheKey, value.toString(), "EX", lifetimeSavedCacheTtlSeconds);
}

async function computeLifetimeCarbonSaved(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("user_challenges")
    .select("challenge_id")
    .eq("user_id", userId)
    .eq("status", "completed");

  if (error || !data || data.length === 0) {
    return 0;
  }

  const { data: challenges, error: challengesError } = await supabaseAdmin
    .from("challenges")
    .select("carbon_save_kg")
    .in(
      "id",
      data.map((row) => row.challenge_id)
    );

  if (challengesError || !challenges) {
    throw new Error("Unable to load challenge carbon savings");
  }

  return Math.round(
    challenges.reduce(
      (total, challenge) => total + Number(challenge.carbon_save_kg),
      0
    ) * 100
  ) / 100;
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

function getDaysActive(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  const diffMs = Date.now() - created;
  return Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

function getCardTheme(level: number): "green" | "blue" | "dark" {
  if (level >= 8) {
    return "dark";
  }

  if (level >= 4) {
    return "blue";
  }

  return "green";
}
