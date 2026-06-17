export type CarbonEquivalencies = {
  trees_absorbed: number;
  miles_driven: number;
  smartphones_charged: number;
  flights_ny_to_la: number;
  shower_minutes: number;
  human_readable: {
    trees_absorbed: string;
    miles_driven: string;
    smartphones_charged: string;
    flights_ny_to_la: string;
    shower_minutes: string;
  };
};

function round(value: number, decimals = 1): number {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

export function treesAbsorbed(kg: number): number {
  return round(kg / 22, 2);
}

export function milesDriven(kg: number): number {
  return round(kg / 0.404, 1);
}

export function smartphonesCharged(kg: number): number {
  return Math.round(kg / 0.008);
}

export function flightsNYtoLA(kg: number): number {
  return round(kg / 900, 3);
}

export function showerMinutes(kg: number): number {
  return round(kg / 0.045, 1);
}

export function getEquivalencies(kg: number): CarbonEquivalencies {
  const trees = treesAbsorbed(kg);
  const miles = milesDriven(kg);
  const phones = smartphonesCharged(kg);
  const flights = flightsNYtoLA(kg);
  const showers = showerMinutes(kg);

  return {
    trees_absorbed: trees,
    miles_driven: miles,
    smartphones_charged: phones,
    flights_ny_to_la: flights,
    shower_minutes: showers,
    human_readable: {
      trees_absorbed: `${trees} trees absorbing CO2 for one year`,
      miles_driven: `${miles} miles driven in an average car`,
      smartphones_charged: `${phones} smartphone charges`,
      flights_ny_to_la: `${flights} one-way flights from New York to Los Angeles`,
      shower_minutes: `${showers} minutes of showering`
    }
  };
}
