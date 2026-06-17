// In-memory mock teams store (Worker singleton — resets on redeploy).
export type TeamType = "Neighborhood" | "Employer" | "Friends" | "Custom";

export interface TeamMember {
  id: string;
  display_name: string;
  carbon_saved_week: number;
  carbon_saved_month: number;
  carbon_saved_all: number;
  challenges_week: number;
  challenges_month: number;
  challenges_all: number;
  streak: number;
  is_admin?: boolean;
  is_me?: boolean;
}

export interface Team {
  id: string;
  name: string;
  type: TeamType;
  description?: string;
  invite_code: string;
  created_at: string;
  admin_id: string;
  members: TeamMember[];
}

function rand(seed: number) {
  // tiny LCG so seeded numbers are stable
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function genMembers(seed: number, count: number, includeMe: boolean): TeamMember[] {
  const names = [
    "Alex R.", "Priya S.", "Marcus T.", "Yuki H.", "Sofia G.",
    "Daniel K.", "Aisha M.", "Liam O.", "Elena V.", "Noah B.",
    "Mira P.", "Theo C.", "Zara N.", "Ravi D.", "Luna F.",
  ];
  const r = rand(seed);
  const members: TeamMember[] = [];
  for (let i = 0; i < count; i++) {
    const wk = Math.round(r() * 28 * 10) / 10;
    const mo = wk * (3 + r() * 1.5);
    const all = mo * (2 + r() * 3);
    members.push({
      id: `m_${seed}_${i}`,
      display_name: names[(seed + i) % names.length],
      carbon_saved_week: wk,
      carbon_saved_month: Math.round(mo * 10) / 10,
      carbon_saved_all: Math.round(all * 10) / 10,
      challenges_week: Math.floor(r() * 7),
      challenges_month: Math.floor(r() * 25),
      challenges_all: Math.floor(r() * 120),
      streak: Math.floor(r() * 30),
      is_admin: i === 0,
    });
  }
  if (includeMe) {
    members.push({
      id: "me",
      display_name: "You",
      carbon_saved_week: 18.4,
      carbon_saved_month: 72.1,
      carbon_saved_all: 287.4,
      challenges_week: 5,
      challenges_month: 19,
      challenges_all: 64,
      streak: 12,
      is_me: true,
    });
  }
  return members;
}

const teams: Team[] = [
  {
    id: "t_green_block",
    name: "Green Block",
    type: "Neighborhood",
    description: "Our block, lower footprint, together.",
    invite_code: "GREEN42",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
    admin_id: "m_1_0",
    members: genMembers(1, 11, true),
  },
  {
    id: "t_acme_co2",
    name: "Acme Climate Crew",
    type: "Employer",
    description: "Acme Inc. sustainability initiative.",
    invite_code: "ACME88",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString(),
    admin_id: "m_2_0",
    members: genMembers(2, 23, true),
  },
];

export function listMyTeams() {
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    member_count: t.members.length,
    total_carbon_saved: Math.round(
      t.members.reduce((s, m) => s + m.carbon_saved_all, 0) * 10,
    ) / 10,
  }));
}

export function getTeam(id: string) {
  return teams.find((t) => t.id === id);
}

export function getTeamByInvite(code: string) {
  return teams.find((t) => t.invite_code.toUpperCase() === code.toUpperCase());
}

export function createTeam(input: {
  name: string;
  type: TeamType;
  description?: string;
}): Team {
  const id = `t_${Math.random().toString(36).slice(2, 9)}`;
  const invite_code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const team: Team = {
    id,
    name: input.name,
    type: input.type,
    description: input.description,
    invite_code,
    created_at: new Date().toISOString(),
    admin_id: "me",
    members: [
      {
        id: "me",
        display_name: "You",
        carbon_saved_week: 18.4,
        carbon_saved_month: 72.1,
        carbon_saved_all: 287.4,
        challenges_week: 5,
        challenges_month: 19,
        challenges_all: 64,
        streak: 12,
        is_admin: true,
        is_me: true,
      },
    ],
  };
  teams.unshift(team);
  return team;
}

export function joinTeamByInvite(code: string): Team | null {
  const t = getTeamByInvite(code);
  if (!t) return null;
  if (!t.members.some((m) => m.is_me)) {
    t.members.push({
      id: "me",
      display_name: "You",
      carbon_saved_week: 4.2,
      carbon_saved_month: 12.8,
      carbon_saved_all: 38.6,
      challenges_week: 2,
      challenges_month: 7,
      challenges_all: 14,
      streak: 4,
      is_me: true,
    });
  }
  return t;
}

export function teamStats(t: Team) {
  return {
    total_carbon_saved: Math.round(
      t.members.reduce((s, m) => s + m.carbon_saved_all, 0) * 10,
    ) / 10,
    member_count: t.members.length,
    best_streak: t.members.reduce((m, x) => Math.max(m, x.streak), 0),
  };
}
