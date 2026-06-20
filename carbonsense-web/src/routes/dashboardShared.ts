export type Category = "food" | "transport" | "home" | "shopping" | "travel" | "other";
export type Period = "weekly" | "monthly" | "yearly";

export interface Trends {
  period: Period;
  range: number;
  unit: string;
  points: { label: string; value: number; previous: number }[];
  change_percent: number;
  total: number;
  average: number;
  is_estimated?: boolean;
}

export const CATEGORY_COLOR: Record<Category, string> = {
  food: "#fb923c",
  transport: "#3b82f6",
  home: "#eab308",
  shopping: "#a855f7",
  travel: "#ef4444",
  other: "#9ca3af",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  food: "Food",
  transport: "Transport",
  home: "Home",
  shopping: "Shopping",
  travel: "Travel",
  other: "Other",
};

export const CATEGORY_EMOJI: Record<Category, string> = {
  food: "🍔",
  transport: "🚗",
  home: "🏠",
  shopping: "🛍",
  travel: "✈️",
  other: "💳",
};
