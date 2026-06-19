import { API_BASE } from "./api-base";

export type LevelEntry = {
  level: number;
  name: string;
  xp_required: number;
};

let catalog: LevelEntry[] | null = null;
let inflight: Promise<LevelEntry[]> | null = null;

async function fetchCatalog(): Promise<LevelEntry[]> {
  const res = await fetch(`${API_BASE}/levels`, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) {
    throw new Error(`Failed to load levels catalog (${res.status})`);
  }
  const json = (await res.json()) as { success?: boolean; data?: { levels?: LevelEntry[] } };
  const levels = json?.data?.levels;
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new Error("Levels catalog missing or empty");
  }
  return levels.map((entry) => ({
    level: Number(entry.level),
    name: String(entry.name),
    xp_required: Number(entry.xp_required)
  }));
}

export function loadLevelsCatalog(): Promise<LevelEntry[]> {
  if (catalog) return Promise.resolve(catalog);
  if (inflight) return inflight;
  inflight = fetchCatalog()
    .then((levels) => {
      catalog = levels;
      return levels;
    })
    .catch((error) => {
      inflight = null;
      throw error;
    });
  return inflight;
}

export function setLevelsCatalog(levels: LevelEntry[]): void {
  catalog = levels.slice();
  inflight = null;
}

export function isLevelsCatalogReady(): boolean {
  return catalog !== null;
}

export function getLevelsCatalog(): LevelEntry[] {
  return catalog ?? [];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function getLevelEntry(level: number): LevelEntry | null {
  if (!catalog) return null;
  const safe = clamp(Math.floor(level), 1, catalog.length);
  return catalog[safe - 1] ?? null;
}

export function getLevelName(level: number): string {
  return getLevelEntry(level)?.name ?? "";
}

export function getLevelThreshold(level: number): number {
  return getLevelEntry(level)?.xp_required ?? 0;
}

export function getNextLevelThreshold(level: number): number {
  if (!catalog) return 0;
  if (level >= catalog.length) {
    return getLevelThreshold(level);
  }
  return getLevelThreshold(level + 1);
}

export function getLevelProgressFraction(
  level: number,
  cumulativeXp: number
): number {
  if (!catalog) return 0;
  const safeLevel = clamp(Math.floor(level), 1, catalog.length);
  const floor = getLevelThreshold(safeLevel);
  const ceiling = getNextLevelThreshold(safeLevel);
  const span = Math.max(1, ceiling - floor);
  if (ceiling <= floor) return 1;
  return clamp((cumulativeXp - floor) / span, 0, 1);
}
