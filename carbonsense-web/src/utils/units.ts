export type UnitSystem = "metric" | "imperial";

const KG_TO_LB = 2.20462;

export function convertCO2(kg: number, system: UnitSystem): number {
  const value = Number.isFinite(kg) ? kg : 0;
  return system === "imperial" ? value * KG_TO_LB : value;
}

export function getCO2Label(system: UnitSystem): string {
  return system === "imperial" ? "lb CO2" : "kg CO2";
}

export function formatCO2(kg: number, system: UnitSystem): string {
  const converted = convertCO2(kg, system);
  const rounded =
    converted >= 100 ? Math.round(converted) : Math.round(converted * 10) / 10;
  return `${rounded.toLocaleString()} ${getCO2Label(system)}`;
}

/**
 * Returns `singular` when count is exactly 1, otherwise `plural`.
 * Handles negative and zero counts correctly.
 */
export function pluralize(count: number, singular: string, plural: string): string {
  return Math.abs(count) === 1 ? singular : plural;
}

/**
 * Renders a noun phrase with the right singular/plural form.
 * `pluralizeNoun(1, "challenge")` -> "1 challenge"
 * `pluralizeNoun(2, "challenge")` -> "2 challenges"
 */
export function pluralizeNoun(count: number, singular: string, plural?: string): string {
  const word = pluralize(count, singular, plural ?? `${singular}s`);
  return `${count} ${word}`;
}
