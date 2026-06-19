/**
 * Service layer for CarbonSense domain logic. Keeps persistence, third-party API calls, and calculations behind controller-safe functions.
 */
import crypto from "crypto";
import { redis, redisEnabled } from "../config/redis";
import { supabaseAdmin } from "../config/supabase";
import { currentIndiaMonthStart, currentIndiaWeekStart, todayIndia } from "../utils/date";
import type { Team, TeamType } from "../types";

type LeaderboardPeriod = "week" | "month" | "alltime";

const leaderboardCacheTtlSeconds = 60 * 60;

/**
 * Runs the createTeam service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function createTeam(
  userId: string,
  name: string,
  type: TeamType,
  description?: string
): Promise<Team> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = generateInviteCode();
    const { data, error } = await supabaseAdmin.rpc("create_team_with_admin", {
      p_user_id: userId,
      p_name: name,
      p_type: type,
      p_description: description ?? null,
      p_invite_code: inviteCode
    });

    if (!error && data) {
      return data as Team;
    }

    if (!error?.message.toLowerCase().includes("duplicate")) {
      throw new Error("Unable to create team");
    }
  }

  throw new Error("Unable to generate a unique invite code");
}

/**
 * Runs the joinTeam service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function joinTeam(
  userId: string,
  inviteCode: string
): Promise<Team> {
  const { data, error } = await supabaseAdmin.rpc("join_team_atomic", {
    p_user_id: userId,
    p_invite_code: inviteCode.toUpperCase()
  });

  if (error) {
    if (error.message.includes("ALREADY_TEAM_MEMBER")) {
      throw new Error("You are already a member of this team");
    }

    if (error.message.includes("TEAM_NOT_FOUND")) {
      throw new Error("Team invite code was not found");
    }

    throw new Error("Unable to join team");
  }

  await clearTeamLeaderboardCache((data as Team).id);
  return data as Team;
}

/**
 * Runs the getTeam service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @param teamId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getTeam(userId: string, teamId: string) {
  await verifyMembership(userId, teamId);
  const [{ data: team, error: teamError }, members, activeChallenge] =
    await Promise.all([
      supabaseAdmin.from("teams").select("*").eq("id", teamId).single<Team>(),
      getAnonymizedMembers(teamId),
      getActiveTeamChallenge(teamId)
    ]);

  if (teamError || !team) {
    throw new Error("Team not found");
  }

  const averageStreak =
    members.length > 0
      ? Math.round(
          members.reduce((total, member) => total + member.streak, 0) /
            members.length
        )
      : 0;

  return {
    team,
    members,
    stats: {
      total_carbon_saved: Number(team.total_carbon_saved_kg),
      average_streak: averageStreak,
      active_challenge: activeChallenge
    }
  };
}

/**
 * Runs the getLeaderboard service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getLeaderboard(
  userId: string,
  teamId: string,
  period: LeaderboardPeriod
) {
  await verifyMembership(userId, teamId);
  const cacheKey = `team:${teamId}:leaderboard:${period}`;
  const cached = redisEnabled && redis ? await redis!.get(cacheKey) : null;

  if (cached) {
    return JSON.parse(cached) as {
      period: LeaderboardPeriod;
      leaderboard: Array<{
        rank: number;
        display_name: string;
        avatar: string | null;
        carbon_saved_kg: number;
        challenges_completed: number;
        streak: number;
      }>;
    };
  }

  const members = await getTeamMembersWithUsers(teamId);
  const sinceDate = getPeriodStart(period);
  const leaderboardRows = await Promise.all(
    members.map(async (member, index) => {
      const stats = await getMemberChallengeStats(member.user_id, sinceDate);

      return {
        rank: 0,
        display_name:
          member.role === "admin"
            ? "Team Admin"
            : `Member #${index + 1}`,
        avatar: member.user.avatar_url,
        carbon_saved_kg: stats.carbon_saved_kg,
        challenges_completed: stats.challenges_completed,
        streak: member.user.streak_count
      };
    })
  );
  const ranked = leaderboardRows
    .sort((left, right) => right.carbon_saved_kg - left.carbon_saved_kg)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const payload = { period, leaderboard: ranked };

  if (redisEnabled && redis) {
    await redis!.set(cacheKey, JSON.stringify(payload), "EX", leaderboardCacheTtlSeconds);
  }

  return payload;
}

/**
 * Runs the getMyTeams service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getMyTeams(userId: string) {
  const { data: memberships, error } = await supabaseAdmin
    .from("team_memberships")
    .select("team_id,role,joined_at")
    .eq("user_id", userId);

  if (error || !memberships) {
    throw new Error("Unable to load your teams");
  }

  const teams = await Promise.all(
    memberships.map(async (membership) => {
      const { data: team, error: teamError } = await supabaseAdmin
        .from("teams")
        .select("*")
        .eq("id", membership.team_id)
        .single<Team>();

      if (teamError || !team) {
        return null;
      }

      return {
        ...team,
        role: membership.role,
        joined_at: membership.joined_at
      };
    })
  );

  return teams.filter((team): team is Team & { role: string; joined_at: string } => Boolean(team));
}

/**
 * Runs the updateTeamStats service workflow for CarbonSense domain data.
 * @param teamId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function updateTeamStats(teamId: string): Promise<void> {
  const members = await getTeamMembersWithUsers(teamId);
  const memberIds = members.map((member) => member.user_id);

  if (memberIds.length === 0) {
    return;
  }

  const stats = await Promise.all(
    memberIds.map((memberId) => getMemberChallengeStats(memberId, undefined))
  );
  const totalCarbonSavedKg = stats.reduce(
    (total, memberStats) => total + memberStats.carbon_saved_kg,
    0
  );

  const { error } = await supabaseAdmin
    .from("teams")
    .update({
      total_carbon_saved_kg: Math.round(totalCarbonSavedKg * 100) / 100,
      member_count: memberIds.length
    })
    .eq("id", teamId);

  if (error) {
    throw new Error("Unable to update team stats");
  }

  await clearTeamLeaderboardCache(teamId);
}

/**
 * Runs the updateUserTeamStats service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function updateUserTeamStats(userId: string): Promise<void> {
  const { data: memberships, error } = await supabaseAdmin
    .from("team_memberships")
    .select("team_id")
    .eq("user_id", userId);

  if (error || !memberships) {
    return;
  }

  await Promise.all(
    memberships.map((membership) => updateTeamStats(membership.team_id))
  );
}

async function verifyMembership(userId: string, teamId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("team_memberships")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("You are not a member of this team");
  }
}

async function getAnonymizedMembers(teamId: string) {
  const members = await getTeamMembersWithUsers(teamId);

  return members.map((member, index) => ({
    id: member.id,
    display_name:
      member.role === "admin" ? "Team Admin" : `Member #${index + 1}`,
    role: member.role,
    level: member.user.level,
    streak: member.user.streak_count,
    joined_at: member.joined_at
  }));
}

async function getTeamMembersWithUsers(teamId: string): Promise<
  Array<{
    id: string;
    team_id: string;
    user_id: string;
    role: string;
    joined_at: string;
    user: {
      avatar_url: string | null;
      level: number;
      streak_count: number;
    };
  }>
> {
  const { data: memberships, error } = await supabaseAdmin
    .from("team_memberships")
    .select("id,team_id,user_id,role,joined_at")
    .eq("team_id", teamId)
    .order("joined_at", { ascending: true });

  if (error || !memberships) {
    throw new Error("Unable to load team members");
  }

  const hydrated = await Promise.all(
    memberships.map(async (membership) => {
      const { data: user, error: userError } = await supabaseAdmin
        .from("users")
        .select("avatar_url,level,streak_count")
        .eq("id", membership.user_id)
        .single<{
          avatar_url: string | null;
          level: number;
          streak_count: number;
        }>();

      if (userError || !user) {
        throw new Error("Unable to load team member profile");
      }

      return {
        ...membership,
        user
      };
    })
  );

  return hydrated;
}

async function getActiveTeamChallenge(teamId: string) {
  const members = await getTeamMembersWithUsers(teamId);
  const today = todayIndia();
  const memberIds = members.map((member) => member.user_id);

  if (memberIds.length === 0) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("user_challenges")
    .select("challenge_id,status")
    .in("user_id", memberIds)
    .eq("date_assigned", today)
    .in("status", ["pending", "accepted"])
    .limit(1)
    .maybeSingle<{ challenge_id: string; status: string }>();

  if (error || !data) {
    return null;
  }

  const { data: challenge } = await supabaseAdmin
    .from("challenges")
    .select("id,title,category,difficulty,carbon_save_kg,xp_reward")
    .eq("id", data.challenge_id)
    .maybeSingle();

  return challenge ? { ...challenge, status: data.status } : null;
}

async function getMemberChallengeStats(
  userId: string,
  sinceDate: string | undefined
): Promise<{ carbon_saved_kg: number; challenges_completed: number }> {
  let query = supabaseAdmin
    .from("user_challenges")
    .select("challenge_id,date_assigned")
    .eq("user_id", userId)
    .eq("status", "completed");

  if (sinceDate) {
    query = query.gte("date_assigned", sinceDate);
  }

  const { data: completions, error } = await query;

  if (error || !completions || completions.length === 0) {
    return { carbon_saved_kg: 0, challenges_completed: 0 };
  }

  const challengeIds = completions.map((completion) => completion.challenge_id);
  const { data: challenges, error: challengesError } = await supabaseAdmin
    .from("challenges")
    .select("carbon_save_kg")
    .in("id", challengeIds);

  if (challengesError || !challenges) {
    throw new Error("Unable to load challenge savings");
  }

  return {
    carbon_saved_kg: Math.round(
      challenges.reduce(
        (total, challenge) => total + Number(challenge.carbon_save_kg),
        0
      ) * 100
    ) / 100,
    challenges_completed: completions.length
  };
}

function getPeriodStart(period: LeaderboardPeriod): string | undefined {
  if (period === "alltime") {
    return undefined;
  }
  if (period === "week") {
    return currentIndiaWeekStart();
  } else {
    return currentIndiaMonthStart();
  }
}

async function clearTeamLeaderboardCache(teamId: string): Promise<void> {
  if (!redisEnabled || !redis) {
    return;
  }

  await Promise.all([
    redis!.del(`team:${teamId}:leaderboard:week`),
    redis!.del(`team:${teamId}:leaderboard:month`),
    redis!.del(`team:${teamId}:leaderboard:alltime`)
  ]);
}

function generateInviteCode(): string {
  return crypto
    .randomBytes(8)
    .toString("base64url")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 8)
    .padEnd(8, "X");
}
