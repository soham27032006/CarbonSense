# TYPESCRIPT AUDIT

## Scope

Strict TypeScript check across the entire `carbonsense-web/src` tree, using the project's own `tsconfig.json` via `npx tsc --noEmit --pretty false`. The web build itself (Vite) does not gate on `tsc`, so a passing Vite build can still hide real type errors. This audit runs `tsc` directly and fixes every error.

Protected files were not edited: `routeTree.gen.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `client.ts`, `client.server.ts`, `types.ts`. (No errors were found inside protected files during this audit.)

## Initial findings

`npx tsc --noEmit --pretty false` reported **7 errors** across 4 files:

| # | File | Line | Code | Message |
|---|------|------|------|---------|
| 1 | `carbonsense-web/src/routes/dashboard.tsx` | 34 | TS2305 | Module `"./dashboardShared"` has no exported member `'Trends'`. |
| 2 | `carbonsense-web/src/routes/dashboardCharts.tsx` | 27 | TS2305 | Module `"./dashboardShared"` has no exported member `'Trends'`. |
| 3 | `carbonsense-web/src/routes/dashboardCharts.tsx` | 30 | TS2305 | Module `"./dashboardShared"` has no exported member `'Trends'`. |
| 4 | `carbonsense-web/src/components/copilot/CopilotPanel.tsx` | 297 | TS2322 | Type `'boolean \| null'` is not assignable to type `'boolean'`. |
| 5 | `carbonsense-web/src/routes/challenges.tsx` | 937 | TS7006 | Parameter `'it'` implicitly has an `'any'` type. |
| 6 | `carbonsense-web/src/routes/challenges.tsx` | 949 | TS7006 | Parameter `'it'` implicitly has an `'any'` type. |
| 7 | `carbonsense-web/src/routes/impact.tsx` | 1252 | TS7053 | Element implicitly has an `'any'` type because expression of type `'string'` can't be used to index the readonly `EQUIVALENCY_CONFIG`. |

No other files in `carbonsense-web/src` reported errors. Errors #1–3 are the same root cause and are treated as one finding below.

## Classification

Each finding is classified as:

- **(a)** genuine type-safety gap that could cause a runtime crash
- **(b)** cosmetic / strict-mode-only issue with no runtime risk
- **(c)** stale type left over from a prior refactor (prop type no longer matching current usage)

| # | Finding | Class | Justification |
|---|---------|-------|---------------|
| 1 | `Trends` import unresolved in three sites after the efficiency-audit file split | (c) | The `Trends` interface was a local declaration in the pre-split `dashboard.tsx`. The efficiency audit split that file into `dashboard.tsx` + `dashboardCharts.tsx` + `dashboardShared.ts` to enable chunk-splitting for `recharts`. The split moved `Category`, `Period`, and the `CATEGORY_*` constants into `dashboardShared.ts` but `Trends` was left behind in neither file. The shape of `Trends` was unchanged — only its module location needed updating. |
| 4 | `CopilotPanel.Bubble` / `TypingDots` declared `reduceMotion: boolean`, but `useReducedMotion()` is typed `boolean \| null` by framer-motion (initial/unknown state). | (c) | framer-motion's `useReducedMotion()` returns `boolean | null` — `null` is the pre-hydration / pre-media-query state. The Copilot component correctly receives the union at the call site but `Bubble` and `TypingDots` were tightened to `boolean` without handling the `null` branch. Behavior is unchanged: `null` is falsy in the existing `reduceMotion ? ... : ...` ternaries, so the motion path resolves identically to `false`. |
| 5, 6 | `items.filter((it) => …)` and `secItems.map((it) => …)` — `it` has implicit `any`. | (c) | `useChallengeLibrary` is untyped (no `<TData>` generic on the React Query call), so `libraryQuery.data?.items ?? []` is `any[]`. The intended type is `LibItem`, which already exists locally and has the correct shape (`id`, `category`, etc.). Today this works at runtime because the API returns objects with the `LibItem` shape, but the loss of typing means a future API-shape change would silently break. Annotation pinpoints the intended type without touching the hook. |
| 7 | `EQUIVALENCY_CONFIG[id]` indexing with a `string` against a `Readonly<{ ... }>` from `as const`. | (c) | `EQUIVALENCY_CONFIG` is declared `as const`, so TS infers a closed key set. The function `getEquivalencyConfig(id)` is intentionally open-ended — its `?? { ... }` branch synthesizes a fallback for any id the API returns that isn't in the hard-coded set. Widening the parameter to `keyof typeof EQUIVALENCY_CONFIG | (string & {})` keeps autocomplete on known keys while permitting arbitrary strings; the runtime `??` fallback is unchanged. |

No (a) or (b) findings. Every error was caused by a type signature drifting away from how the code is actually called, never by an unreachable runtime condition.

## Changes applied

### Finding 1 — Move `Trends` into `dashboardShared.ts`

- `carbonsense-web/src/routes/dashboardShared.ts`: added the existing `Trends` interface (period, range, unit, points, change_percent, total, average, is_estimated?).
- `dashboard.tsx:34` and `dashboardCharts.tsx:27` were already importing `Trends` from `"./dashboardShared"`; with the type now exported there, both resolve.
- `dashboardCharts.tsx:30` (`export type { Category, Period, Trends } from "./dashboardShared"`) now resolves correctly.

Before: `dashboard.tsx` declared `Trends` locally; the file split dropped the declaration, so both consumers failed to resolve.
After: `Trends` lives in `dashboardShared.ts` alongside `Category`, `Period`, and the `CATEGORY_*` constants. Shape is byte-identical to the original.

### Finding 4 — Widen `Bubble` / `TypingDots` prop types

- `carbonsense-web/src/components/copilot/CopilotPanel.tsx`:
  - `function Bubble({ msg, reduceMotion }: { msg: Msg; reduceMotion: boolean })` → `{ msg: Msg; reduceMotion: boolean | null }`.
  - `function TypingDots({ reduceMotion }: { reduceMotion: boolean })` → `{ reduceMotion: boolean | null }`.

Before: TS2322 at the call site `<Bubble msg={message} reduceMotion={reduceMotion} />` because `reduceMotion` is `boolean | null`.
After: types match the union `useReducedMotion()` returns. No `as any`, no `@ts-ignore`. The existing ternaries (`reduceMotion ? "smooth" : "auto"`, `reduceMotion ? { ... } : { ... }`) already treat `null` as the falsy branch, so behavior is unchanged.

### Findings 5, 6 — Annotate the two `it` callbacks with `LibItem`

- `carbonsense-web/src/routes/challenges.tsx`:
  - `items.filter((it) => it.category === sec.key)` → `items.filter((it: LibItem) => it.category === sec.key)`.
  - `secItems.map((it) => <LibCard key={it.id} item={it} />)` → `secItems.map((it: LibItem) => <LibCard key={it.id} item={it} />)`.

Before: TS7006 — `useChallengeLibrary` has no generic, so `libraryQuery.data?.items` is `any[]`, and the two callbacks pick up implicit `any`.
After: explicit `LibItem` annotation matches the shape returned by `getChallengeLibrary()` in `carbonsense-api/src/services/challenge.service.ts` (a `Challenge` extended with `savings_kg`, `emoji`, and `completion_rate`, all of which exist on `LibItem`). The annotation is local to the two call sites; the hook itself is unchanged so other callers are unaffected.

### Finding 7 — Widen `getEquivalencyConfig` parameter

- `carbonsense-web/src/routes/impact.tsx`:
  - `function getEquivalencyConfig(id: string) { return EQUIVALENCY_CONFIG[id] ?? { ... } }` →
    `function getEquivalencyConfig(id: keyof typeof EQUIVALENCY_CONFIG | (string & {})) { return EQUIVALENCY_CONFIG[id as keyof typeof EQUIVALENCY_CONFIG] ?? { ... } }`.

Before: TS7053 — `EQUIVALENCY_CONFIG` is `as const`, so its inferred type is a closed map. Indexing with `string` has no guarantee of returning a value, so TS refuses.
After: the parameter type accepts any string (autocomplete still offers known keys), and the `as keyof typeof EQUIVALENCY_CONFIG` cast makes the indexed-access type-checked. The runtime `??` fallback remains identical.

## Verification

- `npx tsc --noEmit --pretty false` from `carbonsense-web`: **zero errors**.
- `npm run build` from `carbonsense-web`: passes; dashboard chunk remains at 27.00 kB (gzip 7.18 kB) and `dashboardCharts` remains deferred at 12.69 kB (gzip 3.47 kB) — the lazy split from the prior audit is intact.
- `npm run build` from `carbonsense-api`: passes.
- `npm test --run` from `carbonsense-api`: **21/21 pass** across 6 test files.

## Remaining risk accepted

- The `useChallengeLibrary` hook itself remains untyped (no `<TData>` generic). Adding the generic would tighten every call site, but it would also require touching `useAuthedQuery` and the query-key type plumbing for all 20+ hooks in `useApi.ts`. The current fix annotates the two vulnerable callbacks with the intended `LibItem` shape; the broader typing pass is left for a follow-up.
- `EQUIVALENCY_CONFIG` is still `as const` and exhaustive — adding a new equivalency type now still requires adding a literal key (or accepting the fallback). This is the intended behavior: known equivalencies get the curated title/icon, unknown ones get the synthesized fallback.
