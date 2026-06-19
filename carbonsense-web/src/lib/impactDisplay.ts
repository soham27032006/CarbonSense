export const EQUIVALENCY_CONFIG = {
  trees_year: { title: "Trees Planted", icon: "🌳", unit: "tree" },
  miles_not_driven: { title: "Miles Not Driven", icon: "🚗", unit: "mile" },
  smartphones: { title: "Phones Charged", icon: "📱", unit: "charge" },
  smartphones_charged: { title: "Phones Charged", icon: "📱", unit: "charge" },
  flights_saved: { title: "Flights Saved", icon: "✈️", unit: "flight" },
  flights_ny_to_la: { title: "Flights Avoided", icon: "✈️", unit: "flight" },
  showers: { title: "Showers Saved", icon: "🚿", unit: "minute" },
  showers_skipped: { title: "Shower Minutes", icon: "🚿", unit: "minute" },
  shower_minutes: { title: "Shower Minutes", icon: "🚿", unit: "minute" },
} as const;

export function getTreeCount(carbonSavedKg: number) {
  return Math.max(1, Math.floor(carbonSavedKg / 22));
}

export function getForestMessage(treeCount: number) {
  return treeCount === 1
    ? "Your first tree is growing!"
    : "Every challenge grows your forest 🌳";
}
