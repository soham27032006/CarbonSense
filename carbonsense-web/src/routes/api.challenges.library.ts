import { createFileRoute } from "@tanstack/react-router";

// The full, non-personalized challenge library grouped by category.
const LIBRARY = [
  // Food
  { id: "lib_food_1", category: "food", emoji: "🍽", title: "Plant-Based Lunch", description: "Swap one meat meal for a veggie one.", difficulty: "Easy", savings_kg: 2.5, xp_reward: 15 },
  { id: "lib_food_2", category: "food", emoji: "🥗", title: "Meatless Dinner", description: "Cook a fully plant-based dinner tonight.", difficulty: "Easy", savings_kg: 2.2, xp_reward: 15 },
  { id: "lib_food_3", category: "food", emoji: "🥦", title: "Zero Food Waste", description: "Use up leftovers — bin nothing edible.", difficulty: "Medium", savings_kg: 1.8, xp_reward: 20 },
  { id: "lib_food_4", category: "food", emoji: "☕", title: "Bring Your Own Cup", description: "Skip every single-use cup today.", difficulty: "Easy", savings_kg: 0.6, xp_reward: 10 },
  // Transport
  { id: "lib_trans_1", category: "transport", emoji: "🚗", title: "Leave the Car Behind", description: "Transit, bike, or walk for every trip.", difficulty: "Easy", savings_kg: 3.8, xp_reward: 20 },
  { id: "lib_trans_2", category: "transport", emoji: "🚲", title: "Bike Commute", description: "Cycle to work or school instead of driving.", difficulty: "Medium", savings_kg: 3.1, xp_reward: 20 },
  { id: "lib_trans_3", category: "transport", emoji: "🚆", title: "Train Over Plane", description: "Choose rail for a regional trip.", difficulty: "Hard", savings_kg: 12.0, xp_reward: 40 },
  { id: "lib_trans_4", category: "transport", emoji: "🤝", title: "Carpool Day", description: "Share a ride for your commute.", difficulty: "Easy", savings_kg: 2.0, xp_reward: 15 },
  // Home
  { id: "lib_home_1", category: "home", emoji: "🏠", title: "Dial It Down", description: "Lower the thermostat 2°C this evening.", difficulty: "Easy", savings_kg: 1.6, xp_reward: 10 },
  { id: "lib_home_2", category: "home", emoji: "🧺", title: "Cold Wash Day", description: "Run laundry on cold and air-dry it.", difficulty: "Easy", savings_kg: 0.9, xp_reward: 10 },
  { id: "lib_home_3", category: "home", emoji: "💡", title: "Lights Out", description: "Unplug idle devices and kill standby draw.", difficulty: "Medium", savings_kg: 1.2, xp_reward: 15 },
  // Shopping
  { id: "lib_shop_1", category: "shopping", emoji: "🛍", title: "Buy Nothing New", description: "Skip a purchase or buy it secondhand.", difficulty: "Medium", savings_kg: 4.2, xp_reward: 25 },
  { id: "lib_shop_2", category: "shopping", emoji: "👕", title: "Thrift First", description: "Find one item secondhand instead of new.", difficulty: "Easy", savings_kg: 3.0, xp_reward: 20 },
  { id: "lib_shop_3", category: "shopping", emoji: "📦", title: "Slow Shipping", description: "Pick standard delivery, not next-day air.", difficulty: "Easy", savings_kg: 0.8, xp_reward: 10 },
  // Lifestyle
  { id: "lib_life_1", category: "lifestyle", emoji: "🧘", title: "Mindful Mile", description: "Walk one of your usual short drives.", difficulty: "Easy", savings_kg: 1.1, xp_reward: 10 },
  { id: "lib_life_2", category: "lifestyle", emoji: "🌱", title: "Digital Declutter", description: "Clear cloud storage and old emails.", difficulty: "Easy", savings_kg: 0.4, xp_reward: 10 },
  { id: "lib_life_3", category: "lifestyle", emoji: "💧", title: "Shorter Shower", description: "Trim two minutes off your shower.", difficulty: "Medium", savings_kg: 0.7, xp_reward: 15 },
];

export const Route = createFileRoute("/api/challenges/library")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({ items: LIBRARY });
      },
    },
  },
});
