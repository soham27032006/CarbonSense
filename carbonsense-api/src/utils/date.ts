const INDIA_TIME_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function formatIndiaDate(date = new Date()): string {
  return new Date(date.getTime() + INDIA_TIME_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export function addDaysToDateString(date: string, days: number): string {
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

export function todayIndia(): string {
  return formatIndiaDate();
}

export function yesterdayIndia(): string {
  return addDaysToDateString(todayIndia(), -1);
}

export function daysAgoIndia(days: number): string {
  return addDaysToDateString(todayIndia(), -days);
}

export function currentIndiaMonthStart(): string {
  return `${todayIndia().slice(0, 8)}01`;
}

export function currentIndiaWeekStart(): string {
  const today = todayIndia();
  const date = new Date(`${today}T00:00:00.000Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}
