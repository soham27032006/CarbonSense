import { createFileRoute } from "@tanstack/react-router";

interface Achievement {
  id: string;
  name: string;
  description: string;
  emoji: string;
  earned: boolean;
  earned_at?: string;
  progress?: { current: number; target: number; unit: string };
}

const NOW = Date.now();
const day = (n: number) => new Date(NOW - 1000 * 60 * 60 * 24 * n).toISOString();

const ACHIEVEMENTS: Achievement[] = [
  { id: "first_step", name: "First Step", description: "Complete your first challenge.", emoji: "👣", earned: true, earned_at: day(70) },
  { id: "streak_3", name: "On a Roll", description: "Hit a 3-day streak.", emoji: "🔥", earned: true, earned_at: day(65) },
  { id: "streak_7", name: "Week Warrior", description: "Hit a 7-day streak.", emoji: "🗓️", earned: true, earned_at: day(50) },
  { id: "streak_14", name: "Fortnight Force", description: "Hit a 14-day streak.", emoji: "💪", earned: true, earned_at: day(30) },
  { id: "streak_30", name: "Habit Built", description: "Hit a 30-day streak.", emoji: "🏆", earned: false, progress: { current: 23, target: 30, unit: "days" } },
  { id: "chal_10", name: "Getting Serious", description: "Complete 10 challenges.", emoji: "✅", earned: true, earned_at: day(58) },
  { id: "chal_50", name: "Challenge Crusher", description: "Complete 50 challenges.", emoji: "💥", earned: true, earned_at: day(8) },
  { id: "chal_100", name: "Centurion", description: "Complete 100 challenges.", emoji: "💯", earned: false, progress: { current: 64, target: 100, unit: "challenges" } },
  { id: "food_master", name: "Plant Power", description: "Complete 20 food challenges.", emoji: "🥗", earned: true, earned_at: day(20) },
  { id: "transit_pro", name: "Wheels Off", description: "Skip the car 15 times.", emoji: "🚲", earned: false, progress: { current: 12, target: 15, unit: "trips" } },
  { id: "home_saver", name: "Home Efficient", description: "Cut home energy 10 days.", emoji: "🏠", earned: true, earned_at: day(15) },
  { id: "no_buy", name: "Quiet Wallet", description: "Buy nothing new for 7 days.", emoji: "🛍️", earned: false, progress: { current: 4, target: 7, unit: "days" } },
  { id: "carbon_100", name: "Triple Digits", description: "Save 100 kg CO₂ total.", emoji: "🌿", earned: true, earned_at: day(35) },
  { id: "carbon_500", name: "Half a Ton", description: "Save 500 kg CO₂ total.", emoji: "🌳", earned: false, progress: { current: 287, target: 500, unit: "kg" } },
  { id: "carbon_1000", name: "Ton-down", description: "Save 1,000 kg CO₂ total.", emoji: "🌎", earned: false, progress: { current: 287, target: 1000, unit: "kg" } },
  { id: "early_bird", name: "Early Bird", description: "Log a challenge before 7am.", emoji: "🌅", earned: true, earned_at: day(2) },
  { id: "share_one", name: "Spread the Word", description: "Share your impact.", emoji: "📣", earned: false, progress: { current: 0, target: 1, unit: "shares" } },
  { id: "level_5", name: "Carbon Champion", description: "Reach Level 5.", emoji: "🏅", earned: true, earned_at: day(1) },
];

export const Route = createFileRoute("/api/achievements")({
  server: {
    handlers: {
      GET: async () => {
        const earned = ACHIEVEMENTS.filter((a) => a.earned).length;
        return Response.json({
          earned,
          total: ACHIEVEMENTS.length,
          achievements: ACHIEVEMENTS,
        });
      },
    },
  },
});
