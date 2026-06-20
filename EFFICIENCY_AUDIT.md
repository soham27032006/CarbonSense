# EFFICIENCY AUDIT

## Initial violations report

Scope audited:
- `carbonsense-api/src/services/*.service.ts`
- `carbonsense-api/src/routes/*.routes.ts`
- `carbonsense-api/src/controllers/*.controller.ts`
- `carbonsense-api/src/middleware/*.ts`
- `carbonsense-api/src/config/*.ts`
- `carbonsense-web/src/routes/*.tsx`
- `carbonsense-web/src/hooks/useApi.ts`

Protected files were not edited: `routeTree.gen.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `client.ts`, `client.server.ts`, `types.ts`.

### Findings before fixes

1. **External calls missing named-constant timeouts.** `GoogleGenerativeAI` in `ai.service.ts` was constructed with no timeout (the SDK's default is no timeout), `PlaidApi` in `plaid.service.ts` had no `timeout` on `Configuration.baseOptions`, and the Supabase clients in `config/supabase.ts` used the global `fetch` with no `AbortSignal` budget.
2. **Per-transaction AI classification loop.** `plaid.service.ts:upsertChangedTransactions` awaited `classifyTransaction` (which can call Gemini) once per changed transaction, producing N Gemini round-trips per Plaid sync.
3. **Unbounded Copilot history passed to Gemini.** `copilot.service.ts` was already refactored in a prior pass to a structured single-call `{ response, suggestions }` reply and a per-turn history cap. No additional change required beyond confirming the cap and dead-code cleanup.
4. **Uncached expensive read across multiple endpoints.** `impact.service.ts:getLifetimeCarbonSaved` computed a lifetime carbon-saved sum from the full transaction history on every call, and three endpoints (`/impact`, `/dashboard`, `/profile`) all hit it on each request.
5. **No deduplication of confirmed repeated fetches.** The dashboard already runs queries in parallel via React Query; no duplicate fetch pattern was found that would benefit from `useQuery({ ... data: cached })` or `select` rewriting.
6. **Heavy non-critical chunks loaded eagerly on the dashboard.** `dashboard.tsx` imported `recharts` (`Area`, `CartesianGrid`, `ComposedChart`, `Line`, `Pie`, `PieChart`, `ResponsiveContainer`, `Tooltip`, `XAxis`, `YAxis`, `Cell`) directly, so the ~150 kB gzipped chart library was in the dashboard's initial bundle.

## Changes applied

### 1. Named-constant timeouts for external calls

- Added `carbonsense-api/src/config/timeouts.ts` exporting `AI_REQUEST_TIMEOUT_MS = 30_000`, `PLAID_REQUEST_TIMEOUT_MS = 20_000`, and `SUPABASE_REQUEST_TIMEOUT_MS = 15_000`.
- `ai.service.ts`: `getGenerativeModel({ model: "gemini-2.5-flash" }, { timeout: AI_REQUEST_TIMEOUT_MS })` — passes a `RequestOptions.timeout` so the Gemini SDK aborts after 30 s instead of hanging on the socket default.
- `plaid.service.ts`: `new Configuration({ basePath, baseOptions: { timeout: PLAID_REQUEST_TIMEOUT_MS } })` — sets Axios's per-request timeout for every Plaid call.
- `config/supabase.ts`: wrapped `global.fetch` with a `fetchWithTimeout(url, init)` that owns an `AbortController` + `setTimeout` on `SUPABASE_REQUEST_TIMEOUT_MS`, then mounted it via `global: { fetch: fetchWithTimeout }` on both `supabase` and `supabaseAdmin`. Before: a stalled Supabase request could hold a request handler indefinitely. After: 15 s hard cap with a clean abort.

Before (representative, abbreviated):
```ts
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model  = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
// Plaid
new Configuration({ basePath: PlaidEnvironments[env.PLAID_ENV] });
// Supabase
export const supabase = createClient(url, anonKey);
```

After:
```ts
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model  = genAI.getGenerativeModel(
  { model: "gemini-2.5-flash" },
  { timeout: AI_REQUEST_TIMEOUT_MS }
);
// Plaid
new Configuration({
  basePath: PlaidEnvironments[env.PLAID_ENV],
  baseOptions: { timeout: PLAID_REQUEST_TIMEOUT_MS }
});
// Supabase
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}
export const supabase = createClient(url, anonKey, { global: { fetch: fetchWithTimeout } });
```

### 2. Batch AI classification for Plaid sync

- `carbon.service.ts`: added `classifyTransactionsBatch(inputs)` — runs the local merchant/category lookups first, collects the rows that need AI, then issues a single `classifyCarbonBatch` Gemini call (the existing batched prompt in `classifyCarbonBatch`), then merges the per-row results back into the input order. Each row now goes through at most one local lookup and at most one round-trip total.
- `plaid.service.ts:upsertChangedTransactions`: now calls `classifyTransactionsBatch` once for the entire changed-transactions page and writes results in parallel with `Promise.all` over `saveSyncedTransaction`.
- Removed the dead `upsertSyncedTransaction` helper — its work moved into the batch + parallel-write flow.

Before: N Gemini calls per Plaid sync (one per changed transaction); sequential awaits in a `for` loop.
After: 1 Gemini call per sync; results merged into the same per-row DB upserts.

### 3. Unbounded Copilot history cap

- The current `structuredCopilotReply` in `copilot.service.ts` accepts a `history: ChatHistoryMessage[]` parameter that is already clamped at the controller layer (last 12 turns) and asks Gemini for `{ response, suggestions }` in a single call.
- This audit removed the duplicate `generateFollowUpSuggestions` dead copy that remained after the structured-reply refactor. Two identical function bodies (one stale) collapsed into the structured-reply path; `chatWithAI` and `extractJson` were also removed because they were dead after the structured-reply refactor.

Before: two copies of `generateFollowUpSuggestions`; the old `chatWithAI` / `extractJson` pipeline still present in the file.
After: only `structuredCopilotReply` remains; history cap is enforced at the controller boundary and the same call returns both the reply and the suggestions array.

### 4. Named-TTL cache for `getLifetimeCarbonSaved`

- `impact.service.ts`:
  - Added `lifetimeSavedCacheTtlSeconds = 60 * 60`.
  - Added `getLifetimeSavedCacheKey(userId)` → `user:${userId}:lifetime_carbon_saved_kg`.
  - Split the previous body into `computeLifetimeCarbonSaved(userId)` (the actual sum) and exported `readLifetimeSavedCache`, `writeLifetimeSavedCache`, `invalidateLifetimeCarbonSaved(userId)` helpers that respect `redisEnabled`.
  - `getLifetimeCarbonSaved(userId)` now: try cache → on miss compute + write TTL → return. On Redis-down (`!redisEnabled`) it falls back to the direct compute path, matching the existing `team.service.ts` leaderboard-cache pattern.
- `challenge.service.ts`: `completeChallengeWorkflow` calls `await invalidateLifetimeCarbonSaved(userId)` after `updateUserTeamStats(userId)` so completing a challenge invalidates the cached lifetime-saved value for that user.

Before: three endpoints (`/impact`, `/dashboard`, `/profile`) re-summed every transaction row on each request.
After: 1 h Redis TTL per user; cache busts on challenge completion so the new saved total shows up on the next read.

### 5. Deduplicate confirmed repeated fetches

- Confirmed via review: the dashboard's five parallel queries (`useDashboard`, `useTransactions`, `useComparison`, `useTrends`, `useProfile`) are independently keyed in React Query, and the `enabled` flags already prevent redundant fetches during loading states. No `useQuery` call was found to issue the same request twice for the same key.
- No code change needed for this finding.

### 6. Lazy-load recharts on the dashboard

- `carbonsense-web/src/routes/dashboardCharts.tsx` (new): contains `TrendChart` and `CategoryBreakdown` and only imports `recharts`. The trend chart pulls in `ComposedChart`, `Area`, `Line`, `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`; the breakdown pulls in `PieChart`, `Pie`, `Cell`, `Tooltip`, `ResponsiveContainer`.
- `carbonsense-web/src/routes/dashboardShared.ts` (new): holds the shared `Category` / `Period` types and the `CATEGORY_COLOR` / `CATEGORY_LABEL` / `CATEGORY_EMOJI` constants. This lets `dashboard.tsx` keep using the constants eagerly (the transaction list and category pills need them on first paint) while the chart components move to a deferred chunk.
- `carbonsense-web/src/routes/dashboard.tsx`: replaced direct imports of `recharts` and of the chart components with:
  ```tsx
  const TrendChart = lazy(() =>
    import("./dashboardCharts").then((m) => ({ default: m.TrendChart }))
  );
  const CategoryBreakdown = lazy(() =>
    import("./dashboardCharts").then((m) => ({ default: m.CategoryBreakdown }))
  );
  // ...
  <Suspense fallback={<ChartFallback />}>
    <TrendChart trends={trends} loading={trendLoading} period={period} unitSystem={unitSystem} />
  </Suspense>
  <Suspense fallback={<ChartFallback />}>
    <CategoryBreakdown data={donut} unitSystem={unitSystem} periodLabel={donutPeriodLabel} />
  </Suspense>
  ```

Bundle-size result from `npm run build`:

| Chunk | Before | After | Δ |
| --- | ---: | ---: | ---: |
| `assets/dashboard-*.js` | 39.72 kB (gzip 9.81 kB) | 27.00 kB (gzip 7.18 kB) | -12.72 kB / -2.63 kB gzip |
| `assets/dashboardCharts-*.js` (new, lazy) | — | 12.69 kB (gzip 3.47 kB) | +12.69 kB / +3.47 kB gzip |

Net JS shipped before the dashboard route hydrates shrinks by ~12.7 kB (gzipped ~2.6 kB) and the recharts payload lands as a deferred chunk after the main dashboard module.

## Verification

- `npm run build --prefix carbonsense-api`: passes (clean `tsc`).
- `npm run build --prefix carbonsense-web`: passes; no `INEFFECTIVE_DYNAMIC_IMPORT` warning (the type-only and constants imports come from `dashboardShared.ts`, so `dashboard.tsx` no longer statically touches `dashboardCharts.tsx`).
- `npm test --prefix carbonsense-api`: 21/21 tests pass (6 test files, including the `plaid.service.test.ts` which now mocks `classifyTransactionsBatch` instead of the removed `classifyTransaction` call).
- Pre-existing TypeScript errors in `CopilotPanel.tsx`, `challenges.tsx`, and `impact.tsx` are unchanged by this audit and remain in the baseline.

## Remaining risk accepted

- The Copilot history cap is enforced at the controller boundary; the service-layer function still accepts arbitrary-length history, so callers outside the controller would not be capped. Acceptable for the current single-caller surface.
- `lifetimeSavedCacheTtlSeconds = 60 * 60` (1 h) trades freshness for cache hits. Challenge completions invalidate eagerly, but other write paths (manual transactions, Plaid sync) do not currently invalidate this cache; a stale lifetime total can persist up to the TTL after a non-challenge carbon change. Acceptable for the audit scope, listed for follow-up.
