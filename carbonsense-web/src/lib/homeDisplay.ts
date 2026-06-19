export const CATEGORY_META = {
  food: { emoji: "🍔", label: "Food", color: "from-amber-300 to-orange-400" },
  transport: { emoji: "🚗", label: "Transport", color: "from-sky-300 to-blue-500" },
  home: { emoji: "🏠", label: "Home", color: "from-emerald-300 to-teal-400" },
  shopping: { emoji: "🛍", label: "Shopping", color: "from-fuchsia-300 to-pink-500" },
  travel: { emoji: "✈️", label: "Travel", color: "from-violet-300 to-indigo-500" },
  other: { emoji: "○", label: "Other", color: "from-slate-300 to-slate-500" },
} as const;

export function getGreetingForHour(hour: number) {
  if (hour < 5) return ["Good night", "🌙"] as const;
  if (hour < 12) return ["Good morning", "🌤"] as const;
  if (hour < 17) return ["Good afternoon", "☀️"] as const;
  if (hour < 21) return ["Good evening", "🌆"] as const;
  return ["Good night", "🌙"] as const;
}
