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
