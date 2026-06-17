import { supabaseAdmin } from "../config/supabase";
import { getEquivalencies } from "../utils/equivalencies";

export async function getImpactTotal(userId: string) {
  const [
    { data: user, error: userError },
    challengesCompleted,
    lifetimeCarbonSavedKg,
    { count: teamsJoined },
    { count: achievementsEarned }
  ] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select("created_at,streak_count,streak_max,level,level_name")
      .eq("id", userId)
      .single<{
        created_at: string;
        streak_count: number;
        streak_max: number;
        level: number;
        level_name: string;
      }>(),
    getCompletedChallengeCount(userId),
    getLifetimeCarbonSaved(userId),
    supabaseAdmin
      .from("team_memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabaseAdmin
      .from("user_achievements")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
  ]);

  if (userError || !user) {
    throw new Error("Unable to load impact summary");
  }

  return {
    lifetime_carbon_saved_kg: lifetimeCarbonSavedKg,
    challenges_completed: challengesCompleted,
    days_active: getDaysActive(user.created_at),
    current_streak: user.streak_count,
    best_streak: user.streak_max,
    level: user.level,
    level_name: user.level_name,
    teams_joined: teamsJoined ?? 0,
    achievements_earned: achievementsEarned ?? 0
  };
}

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

export async function getImpactShareCard(userId: string) {
  const [{ data: user, error }, carbonSavedKg, challengesCompleted] =
    await Promise.all([
      supabaseAdmin
        .from("users")
        .select("name,created_at,streak_count,level,level_name")
        .eq("id", userId)
        .single<{
          name: string;
          created_at: string;
          streak_count: number;
          level: number;
          level_name: string;
        }>(),
      getLifetimeCarbonSaved(userId),
      getCompletedChallengeCount(userId)
    ]);

  if (error || !user) {
    throw new Error("Unable to load share card data");
  }

  const equivalencies = getEquivalencies(carbonSavedKg);

  return {
    user_name: user.name,
    carbon_saved_kg: carbonSavedKg,
    streak: user.streak_count,
    level_name: user.level_name,
    top_equivalency: equivalencies.human_readable.miles_driven,
    challenges_completed: challengesCompleted,
    member_since: user.created_at,
    card_theme: getCardTheme(user.level)
  };
}

export async function getLifetimeCarbonSaved(userId: string): Promise<number> {
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
