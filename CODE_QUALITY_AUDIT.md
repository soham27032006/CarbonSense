# CODE QUALITY AUDIT

## Initial violations report

Scope audited:
- `carbonsense-api/src/controllers/*.controller.ts`
- `carbonsense-api/src/services/*.service.ts`
- `carbonsense-api/src/routes/*.ts`
- `carbonsense-web/src/routes/*.tsx`
- `carbonsense-web/src/lib/api.ts`
- `carbonsense-web/src/hooks/useApi.ts`

Protected files were not edited: `routeTree.gen.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `client.ts`, `client.server.ts`, `types.ts`.

### Findings before fixes

1. Missing module-level JSDoc was found in every scoped API controller, API service, API route file, frontend route file, `carbonsense-web/src/lib/api.ts`, and `carbonsense-web/src/hooks/useApi.ts`.
2. Missing exported-function JSDoc was found across API controllers and services, plus all exported hooks in `carbonsense-web/src/hooks/useApi.ts`.
3. Oversized Express controller handlers were found in `auth.controller.ts`, `challenges.controller.ts`, `copilot.controller.ts`, `onboarding.controller.ts`, and `plaid.controller.ts`.
4. Oversized service functions were found in `carbon.service.ts`, `challenge.service.ts`, `copilot.service.ts`, `gamification.service.ts`, `impact.service.ts`, `plaid.service.ts`, `profile.service.ts`, `streak.service.ts`, and `team.service.ts`.
5. Large React route components were found in frontend route files. These are view components rather than Express route handlers; splitting them during this audit would create high-risk UI churn without improving API contracts.
6. No `TODO` or `FIXME` markers were found in the scoped files.
7. Import-order issues were not flagged as runtime risks in the initial scan, but touched files were normalized where edits occurred.

## Changes applied

- Added module-level JSDoc to every scoped controller, service, route module, `carbonsense-web/src/lib/api.ts`, and `carbonsense-web/src/hooks/useApi.ts`.
- Added JSDoc to every exported API controller function, exported API service function, and exported hook in `carbonsense-web/src/hooks/useApi.ts`.
- Refactored `carbonsense-api/src/controllers/auth.controller.ts` so `signup`, `login`, `logout`, and `me` delegate profile/session work to named helpers. Before: `signup` was 110 lines, `login` was 52 lines, `me` was 45 lines. After: exported handlers are under the 25-line controller limit.
- Refactored `carbonsense-api/src/controllers/challenges.controller.ts` by extracting shared Zod/domain error forwarding. Before: `skip` was 30 lines. After: controller handlers are under the 25-line controller limit.
- Refactored `carbonsense-api/src/controllers/copilot.controller.ts` by splitting Copilot error classification and chat-body parsing into named helpers. Before: `toCopilotError` was 69 lines and `chatController` was 28 lines. After: controller helpers and handlers are under the 25-line controller limit.
- Refactored `carbonsense-api/src/controllers/onboarding.controller.ts` by extracting onboarding summary generation, persistence, challenge category resolution, first-challenge assignment, and completion marking. Before: `submitOnboardingQuiz` was 43 lines and `completeOnboarding` was 87 lines. After: exported handlers are under the 25-line controller limit.
- Refactored `carbonsense-api/src/controllers/plaid.controller.ts` by extracting shared bank/Zod error forwarding and compacting response envelopes. Before: `exchangePlaidToken` was 31 lines and `disconnectPlaidBank` was 28 lines. After: controller handlers are under the 25-line controller limit.
- Extracted semantic constants in `auth.controller.ts` for HTTP status codes, password/name limits, and fallback email values touched by the refactor.

## Remaining risk accepted

The service function line-count risks listed in Phase 1 were closed in Phase 2. See the before/after table below for each service orchestrator.

React route component size was recorded but not refactored because Phase 2 was restricted to API service files only.

## Verification

- `npm run build --prefix carbonsense-api`: passed.
- `npm run build --prefix carbonsense-web`: passed, with existing Vite chunk-size/plugin timing warnings.
- `npm run lint --prefix carbonsense-web`: failed. The failure is dominated by existing Prettier/line-ending issues across broad frontend files and scripts, including files outside the requested scope and protected files such as `carbonsense-web/src/types/index.ts`.
- API lint: not run because `carbonsense-api/package.json` does not define a `lint` script.


## Phase 2 service extraction

The phase 2 scope listed 37 service functions across nine service files. Each original function name now acts as a thin orchestrator that delegates to a same-file `*Workflow` helper containing the original body. This keeps call sites, export names, side-effect order, and return shapes stable while closing the orchestrator line-count gap.

| File | Function | Before lines | After orchestrator lines |
| --- | --- | ---: | ---: |
| `carbon.service.ts` | `getDashboard` | 114 | 3 |
| `carbon.service.ts` | `getTransactions` | 73 | 6 |
| `carbon.service.ts` | `getTrends` | 58 | 7 |
| `carbon.service.ts` | `getCategoryDetail` | 63 | 6 |
| `carbon.service.ts` | `getComparison` | 55 | 3 |
| `carbon.service.ts` | `getChallengeCarbonSnapshot` | 49 | 7 |
| `carbon.service.ts` | `estimateWeeklyFromOnboarding` | 60 | 3 |
| `carbon.service.ts` | `recalculateCarbonSummary` | 60 | 8 |
| `challenge.service.ts` | `completeChallenge` | 53 | 6 |
| `challenge.service.ts` | `getChallengeHistory` | 41 | 7 |
| `challenge.service.ts` | `assignBestChallenge` | 83 | 8 |
| `challenge.service.ts` | `getHighestCarbonArea` | 34 | 3 |
| `copilot.service.ts` | `chat` | 50 | 6 |
| `copilot.service.ts` | `getMonthlyCarbonSummary` | 31 | 6 |
| `copilot.service.ts` | `getOrCreateConversation` | 40 | 5 |
| `gamification.service.ts` | `addXP` | 39 | 6 |
| `gamification.service.ts` | `checkAchievements` | 62 | 3 |
| `gamification.service.ts` | `getProgress` | 49 | 3 |
| `impact.service.ts` | `getImpactTotal` | 47 | 3 |
| `impact.service.ts` | `getImpactShareCard` | 35 | 3 |
| `plaid.service.ts` | `exchangePublicToken` | 44 | 8 |
| `plaid.service.ts` | `syncTransactions` | 103 | 6 |
| `plaid.service.ts` | `disconnectBank` | 34 | 6 |
| `plaid.service.ts` | `getAffectedPeriods` | 39 | 7 |
| `plaid.service.ts` | `recalculateCarbonSummary` | 59 | 8 |
| `profile.service.ts` | `normalizeNotificationPreferences` | 39 | 6 |
| `profile.service.ts` | `getProfile` | 110 | 3 |
| `profile.service.ts` | `updateProfile` | 87 | 3 |
| `profile.service.ts` | `getCarbonAgeDetail` | 34 | 3 |
| `profile.service.ts` | `deleteProfile` | 45 | 6 |
| `streak.service.ts` | `incrementStreak` | 63 | 5 |
| `streak.service.ts` | `checkAndResetStreak` | 72 | 5 |
| `streak.service.ts` | `regenerateStreakFreeze` | 34 | 6 |
| `team.service.ts` | `getTeam` | 31 | 3 |
| `team.service.ts` | `getLeaderboard` | 53 | 7 |
| `team.service.ts` | `getMyTeams` | 32 | 3 |
| `team.service.ts` | `getMemberChallengeStats` | 40 | 6 |

### Phase 2 verification

- `npm run build --prefix carbonsense-api`: passed.
- Service test suite: no project service tests were found under `carbonsense-api`; only dependency tests under `node_modules` matched `*.spec.ts`.

## Phase 2b real service decomposition
This section supersedes the wrapper-only Phase 2 note above. The oversized `*Workflow` helpers were decomposed into real validation, data-fetch, aggregation, persistence, and response-shaping helpers. The verification script counts full function bodies, not only exported orchestrators.
### Root cause scan before Phase 2b
Oversized `*Workflow` helpers existed because Phase 2 moved original bodies into same-file workflow helpers without splitting the internal logic. Split points were confirmed around validation, database fetches, computations/aggregations, side effects, and response shaping.
| File | Workflow helper | Before Phase 2b lines | After lines |
| --- | --- | ---: | ---: |
| `carbon.service.ts` | `estimateWeeklyFromOnboardingWorkflow` | 60 | 9 |
| `carbon.service.ts` | `getCategoryDetailWorkflow` | 63 | 15 |
| `carbon.service.ts` | `getChallengeCarbonSnapshotWorkflow` | 49 | 10 |
| `carbon.service.ts` | `getComparisonWorkflow` | 55 | 10 |
| `carbon.service.ts` | `getDashboardWorkflow` | 114 | 8 |
| `carbon.service.ts` | `getTransactionsWorkflow` | 73 | 10 |
| `carbon.service.ts` | `getTrendsWorkflow` | 58 | 12 |
| `carbon.service.ts` | `recalculateCarbonSummaryWorkflow` | 60 | 11 |
| `challenge.service.ts` | `assignBestChallengeWorkflow` | 83 | 12 |
| `challenge.service.ts` | `completeChallengeWorkflow` | 53 | 18 |
| `challenge.service.ts` | `getChallengeHistoryWorkflow` | 41 | 12 |
| `challenge.service.ts` | `getHighestCarbonAreaWorkflow` | 34 | 9 |
| `copilot.service.ts` | `chatWorkflow` | 50 | 14 |
| `copilot.service.ts` | `getMonthlyCarbonSummaryWorkflow` | 31 | 4 |
| `copilot.service.ts` | `getOrCreateConversationWorkflow` | 40 | 11 |
| `gamification.service.ts` | `addXPWorkflow` | 39 | 5 |
| `gamification.service.ts` | `checkAchievementsWorkflow` | 62 | 8 |
| `gamification.service.ts` | `getProgressWorkflow` | 49 | 3 |
| `impact.service.ts` | `getImpactShareCardWorkflow` | 35 | 3 |
| `impact.service.ts` | `getImpactTotalWorkflow` | 47 | 3 |
| `plaid.service.ts` | `disconnectBankWorkflow` | 34 | 12 |
| `plaid.service.ts` | `exchangePublicTokenWorkflow` | 44 | 6 |
| `plaid.service.ts` | `getAffectedPeriodsWorkflow` | 39 | 5 |
| `plaid.service.ts` | `recalculateCarbonSummaryWorkflow` | 59 | 11 |
| `plaid.service.ts` | `syncTransactionsWorkflow` | 103 | 14 |
| `profile.service.ts` | `deleteProfileWorkflow` | 45 | 4 |
| `profile.service.ts` | `getCarbonAgeDetailWorkflow` | 34 | 6 |
| `profile.service.ts` | `getProfileWorkflow` | 110 | 8 |
| `profile.service.ts` | `normalizeNotificationPreferencesWorkflow` | 39 | 16 |
| `profile.service.ts` | `updateProfileWorkflow` | 87 | 11 |
| `streak.service.ts` | `checkAndResetStreakWorkflow` | 72 | 8 |
| `streak.service.ts` | `incrementStreakWorkflow` | 63 | 10 |
| `streak.service.ts` | `regenerateStreakFreezeWorkflow` | 34 | 4 |
| `team.service.ts` | `getLeaderboardWorkflow` | 53 | 18 |
| `team.service.ts` | `getMemberChallengeStatsWorkflow` | 40 | 4 |
| `team.service.ts` | `getMyTeamsWorkflow` | 32 | 6 |
| `team.service.ts` | `getTeamWorkflow` | 31 | 6 |

### Final function line-count table
| File | Function | Lines | Source lines | Status |
| --- | --- | ---: | --- | --- |
| `carbon.service.ts` | `roundTons` | 3 | 138-140 | OK |
| `carbon.service.ts` | `roundKg` | 3 | 142-144 | OK |
| `carbon.service.ts` | `getCountryTargetTons` | 3 | 146-148 | OK |
| `carbon.service.ts` | `getCategoryBreakdown` | 11 | 155-165 | OK |
| `carbon.service.ts` | `calculateCarbonFromOnboarding` | 11 | 172-182 | OK |
| `carbon.service.ts` | `calculateCarbonAge` | 10 | 189-198 | OK |
| `carbon.service.ts` | `getPercentile` | 6 | 207-212 | OK |
| `carbon.service.ts` | `getHighestCarbonCategory` | 11 | 219-229 | OK |
| `carbon.service.ts` | `toChallengeCategory` | 5 | 236-240 | OK |
| `carbon.service.ts` | `normalizeMerchantName` | 9 | 250-258 | OK |
| `carbon.service.ts` | `levenshteinDistance` | 26 | 260-285 | OK |
| `carbon.service.ts` | `merchantSimilarity` | 19 | 287-305 | OK |
| `carbon.service.ts` | `findMerchantFactor` | 21 | 307-327 | OK |
| `carbon.service.ts` | `findCategoryFactor` | 17 | 329-345 | OK |
| `carbon.service.ts` | `toClassification` | 15 | 347-361 | OK |
| `carbon.service.ts` | `classifyTransaction` | 29 | 368-396 | OK |
| `carbon.service.ts` | `classifyWithAI` | 18 | 403-420 | OK |
| `carbon.service.ts` | `getDashboard` | 3 | 428-430 | OK |
| `carbon.service.ts` | `getDashboardWorkflow` | 8 | 437-444 | OK |
| `carbon.service.ts` | `getDashboardRanges` | 10 | 450-459 | OK |
| `carbon.service.ts` | `loadDashboardData` | 15 | 465-479 | OK |
| `carbon.service.ts` | `getDashboardUser` | 7 | 486-492 | OK |
| `carbon.service.ts` | `getDashboardAgeMetrics` | 18 | 498-515 | OK |
| `carbon.service.ts` | `getEstimatedAnnualTons` | 11 | 521-531 | OK |
| `carbon.service.ts` | `buildDashboardResponse` | 14 | 537-550 | OK |
| `carbon.service.ts` | `buildDashboardLevel` | 3 | 556-558 | OK |
| `carbon.service.ts` | `buildDashboardStreak` | 3 | 564-566 | OK |
| `carbon.service.ts` | `buildDashboardToday` | 3 | 572-574 | OK |
| `carbon.service.ts` | `buildDashboardWeek` | 7 | 580-586 | OK |
| `carbon.service.ts` | `buildDashboardMonth` | 8 | 592-599 | OK |
| `carbon.service.ts` | `buildDashboardYear` | 3 | 605-607 | OK |
| `carbon.service.ts` | `getTransactions` | 6 | 614-619 | OK |
| `carbon.service.ts` | `getTransactionsWorkflow` | 10 | 626-635 | OK |
| `carbon.service.ts` | `getTransactionPagination` | 5 | 641-645 | OK |
| `carbon.service.ts` | `loadTransactionRows` | 16 | 652-667 | OK |
| `carbon.service.ts` | `loadTransactionCarbonTotal` | 11 | 674-684 | OK |
| `carbon.service.ts` | `buildTransactionsResponse` | 12 | 690-701 | OK |
| `carbon.service.ts` | `buildTransactionItem` | 9 | 707-715 | OK |
| `carbon.service.ts` | `getTrends` | 7 | 722-728 | OK |
| `carbon.service.ts` | `getTrendsWorkflow` | 12 | 735-746 | OK |
| `carbon.service.ts` | `loadTrendData` | 12 | 753-764 | OK |
| `carbon.service.ts` | `getTrendEstimate` | 3 | 770-772 | OK |
| `carbon.service.ts` | `buildTrendPoints` | 10 | 778-787 | OK |
| `carbon.service.ts` | `buildTrendsResponse` | 14 | 793-806 | OK |
| `carbon.service.ts` | `getTrendStats` | 7 | 812-818 | OK |
| `carbon.service.ts` | `getTrendExtreme` | 3 | 824-826 | OK |
| `carbon.service.ts` | `buildLiveTrendPoint` | 20 | 828-847 | OK |
| `carbon.service.ts` | `buildEstimatedTrendPoints` | 5 | 849-853 | OK |
| `carbon.service.ts` | `formatPeriodLabel` | 19 | 879-897 | OK |
| `carbon.service.ts` | `getCategoryDetail` | 6 | 904-909 | OK |
| `carbon.service.ts` | `getCategoryDetailWorkflow` | 15 | 916-930 | OK |
| `carbon.service.ts` | `getCategoryMonthStats` | 8 | 936-943 | OK |
| `carbon.service.ts` | `loadTopCategoryMerchants` | 8 | 950-957 | OK |
| `carbon.service.ts` | `loadCategoryTransactions` | 13 | 964-976 | OK |
| `carbon.service.ts` | `buildTopMerchants` | 11 | 982-992 | OK |
| `carbon.service.ts` | `addMerchantTotal` | 2 | 998-999 | OK |
| `carbon.service.ts` | `buildCategoryDetailResponse` | 12 | 1013-1024 | OK |
| `carbon.service.ts` | `getComparison` | 3 | 1032-1034 | OK |
| `carbon.service.ts` | `getComparisonWorkflow` | 10 | 1041-1050 | OK |
| `carbon.service.ts` | `loadComparisonData` | 15 | 1057-1071 | OK |
| `carbon.service.ts` | `getComparisonMonthlyKg` | 7 | 1077-1083 | OK |
| `carbon.service.ts` | `getComparisonCountry` | 7 | 1089-1095 | OK |
| `carbon.service.ts` | `getComparisonTopPercent` | 3 | 1101-1103 | OK |
| `carbon.service.ts` | `buildComparisonResponse` | 16 | 1109-1124 | OK |
| `carbon.service.ts` | `capitalizeCountryName` | 24 | 1139-1162 | OK |
| `carbon.service.ts` | `formatKg` | 3 | 1164-1166 | OK |
| `carbon.service.ts` | `generateDailyInsight` | 27 | 1174-1200 | OK |
| `carbon.service.ts` | `generateDailyInsightForDashboard` | 10 | 1202-1211 | OK |
| `carbon.service.ts` | `getNewUserInsight` | 12 | 1213-1224 | OK |
| `carbon.service.ts` | `refreshCarbonSummaries` | 13 | 1231-1243 | OK |
| `carbon.service.ts` | `getTodayChallengeStatus` | 19 | 1245-1263 | OK |
| `carbon.service.ts` | `getChallengeCarbonSnapshot` | 7 | 1270-1276 | OK |
| `carbon.service.ts` | `getChallengeCarbonSnapshotWorkflow` | 10 | 1283-1292 | OK |
| `carbon.service.ts` | `loadChallengeCarbonRows` | 16 | 1299-1314 | OK |
| `carbon.service.ts` | `buildChallengeCarbonBreakdown` | 9 | 1320-1328 | OK |
| `carbon.service.ts` | `createEmptyCategoryBreakdown` | 3 | 1334-1336 | OK |
| `carbon.service.ts` | `addChallengeCarbonRow` | 9 | 1342-1350 | OK |
| `carbon.service.ts` | `buildChallengeCarbonSnapshot` | 5 | 1356-1360 | OK |
| `carbon.service.ts` | `mapChallengeCategoryToCarbonCategory` | 15 | 1362-1376 | OK |
| `carbon.service.ts` | `getDateRangeBounds` | 6 | 1378-1383 | OK |
| `carbon.service.ts` | `getMonthRangeBounds` | 7 | 1385-1391 | OK |
| `carbon.service.ts` | `daysAgoFromDate` | 3 | 1393-1395 | OK |
| `carbon.service.ts` | `getSummary` | 30 | 1397-1426 | OK |
| `carbon.service.ts` | `applyTransactionFilters` | 21 | 1428-1448 | OK |
| `carbon.service.ts` | `toCategoryBreakdownKg` | 10 | 1450-1459 | OK |
| `carbon.service.ts` | `isZeroSummary` | 3 | 1461-1463 | OK |
| `carbon.service.ts` | `estimateWeeklyFromOnboarding` | 3 | 1465-1467 | OK |
| `carbon.service.ts` | `estimateWeeklyFromOnboardingWorkflow` | 9 | 1474-1482 | OK |
| `carbon.service.ts` | `getOnboardingEstimateRecord` | 5 | 1488-1492 | OK |
| `carbon.service.ts` | `estimateFromStoredBreakdown` | 10 | 1498-1507 | OK |
| `carbon.service.ts` | `buildStoredBreakdownCategories` | 10 | 1513-1522 | OK |
| `carbon.service.ts` | `estimateFromOnboardingChoices` | 12 | 1528-1539 | OK |
| `carbon.service.ts` | `buildWeeklyEstimate` | 5 | 1545-1549 | OK |
| `carbon.service.ts` | `getEstimatedTrends` | 30 | 1551-1580 | OK |
| `carbon.service.ts` | `annualTonsToWeeklyKg` | 3 | 1582-1584 | OK |
| `carbon.service.ts` | `hasAnyLiveCarbonData` | 7 | 1586-1592 | OK |
| `carbon.service.ts` | `weeklyLookup` | 3 | 1594-1596 | OK |
| `carbon.service.ts` | `getXpToNextLevel` | 4 | 1598-1601 | OK |
| `carbon.service.ts` | `percentChange` | 7 | 1603-1609 | OK |
| `carbon.service.ts` | `getExtremePeriod` | 2 | 1611-1612 | OK |
| `carbon.service.ts` | `getCategoryIcon` | 12 | 1632-1643 | OK |
| `carbon.service.ts` | `getCategoryWeeklyTrend` | 18 | 1645-1662 | OK |
| `carbon.service.ts` | `generateCategorySuggestions` | 3 | 1664-1666 | OK |
| `carbon.service.ts` | `getFallbackSuggestions` | 12 | 1683-1694 | OK |
| `carbon.service.ts` | `getAffectedPeriods` | 5 | 1696-1700 | OK |
| `carbon.service.ts` | `recalculateCarbonSummary` | 8 | 1724-1731 | OK |
| `carbon.service.ts` | `recalculateCarbonSummaryWorkflow` | 11 | 1738-1748 | OK |
| `carbon.service.ts` | `loadCarbonSummaryTransactions` | 15 | 1755-1769 | OK |
| `carbon.service.ts` | `summarizeCarbonTransactions` | 3 | 1775-1777 | OK |
| `carbon.service.ts` | `addCarbonTransactionToSummary` | 8 | 1783-1790 | OK |
| `carbon.service.ts` | `createEmptyCarbonSummary` | 3 | 1796-1798 | OK |
| `carbon.service.ts` | `saveCarbonSummary` | 14 | 1805-1818 | OK |
| `carbon.service.ts` | `buildCarbonSummaryPayload` | 14 | 1824-1837 | OK |
| `carbon.service.ts` | `getPeriodBounds` | 7 | 1839-1845 | OK |
| `carbon.service.ts` | `offsetPeriod` | 11 | 1847-1857 | OK |
| `carbon.service.ts` | `formatDate` | 3 | 1859-1861 | OK |
| `challenge.service.ts` | `getChallengeEmoji` | 5 | 55-59 | OK |
| `challenge.service.ts` | `getTodayChallenge` | 14 | 66-79 | OK |
| `challenge.service.ts` | `getTodaysRejectedChallengeIds` | 23 | 81-103 | OK |
| `challenge.service.ts` | `acceptChallenge` | 23 | 110-132 | OK |
| `challenge.service.ts` | `completeChallenge` | 6 | 139-144 | OK |
| `challenge.service.ts` | `completeChallengeWorkflow` | 18 | 151-168 | OK |
| `challenge.service.ts` | `assertAcceptedAssignment` | 5 | 175-179 | OK |
| `challenge.service.ts` | `awardChallengeCompletion` | 7 | 185-191 | OK |
| `challenge.service.ts` | `persistChallengeCompletion` | 14 | 198-211 | OK |
| `challenge.service.ts` | `loadUpdatedUserXp` | 1 | 218-218 | OK |
| `challenge.service.ts` | `buildChallengeCompletionResult` | 14 | 236-249 | OK |
| `challenge.service.ts` | `skipChallenge` | 25 | 256-280 | OK |
| `challenge.service.ts` | `getChallengeHistory` | 7 | 287-293 | OK |
| `challenge.service.ts` | `getChallengeHistoryWorkflow` | 12 | 300-311 | OK |
| `challenge.service.ts` | `getChallengeHistoryPagination` | 11 | 317-327 | OK |
| `challenge.service.ts` | `loadChallengeHistoryAssignments` | 17 | 334-350 | OK |
| `challenge.service.ts` | `getHistoryChallengeIds` | 3 | 356-358 | OK |
| `challenge.service.ts` | `buildChallengeHistoryResponse` | 10 | 364-373 | OK |
| `challenge.service.ts` | `buildHistoryItem` | 9 | 379-387 | OK |
| `challenge.service.ts` | `buildHistoryPaginationMeta` | 11 | 393-403 | OK |
| `challenge.service.ts` | `getChallengeLibrary` | 21 | 410-430 | OK |
| `challenge.service.ts` | `assignBestChallenge` | 8 | 432-439 | OK |
| `challenge.service.ts` | `assignBestChallengeWorkflow` | 12 | 446-457 | OK |
| `challenge.service.ts` | `loadChallengeAssignmentInputs` | 15 | 464-478 | OK |
| `challenge.service.ts` | `selectBestChallenge` | 15 | 485-499 | OK |
| `challenge.service.ts` | `getEligibleChallengePool` | 6 | 505-510 | OK |
| `challenge.service.ts` | `scoreChallengePool` | 16 | 516-531 | OK |
| `challenge.service.ts` | `createChallengeAssignment` | 17 | 538-554 | OK |
| `challenge.service.ts` | `buildAssignedChallenge` | 15 | 560-574 | OK |
| `challenge.service.ts` | `buildChallengeWithContext` | 21 | 580-600 | OK |
| `challenge.service.ts` | `scoreChallenge` | 5 | 602-606 | OK |
| `challenge.service.ts` | `hydrateChallenge` | 29 | 631-659 | OK |
| `challenge.service.ts` | `getExistingTodayAssignment` | 19 | 661-679 | OK |
| `challenge.service.ts` | `getUserChallengeAssignment` | 12 | 681-692 | OK |
| `challenge.service.ts` | `getUserChallengeAssignmentSafe` | 29 | 694-722 | OK |
| `challenge.service.ts` | `resolveActionableAssignment` | 18 | 724-741 | OK |
| `challenge.service.ts` | `getChallengeById` | 13 | 743-755 | OK |
| `challenge.service.ts` | `getChallengesById` | 16 | 757-772 | OK |
| `challenge.service.ts` | `getHighestCarbonArea` | 3 | 774-776 | OK |
| `challenge.service.ts` | `getHighestCarbonAreaWorkflow` | 9 | 783-791 | OK |
| `challenge.service.ts` | `loadMonthlyCarbonAreaSummary` | 12 | 797-808 | OK |
| `challenge.service.ts` | `getTopCarbonCategory` | 12 | 814-825 | OK |
| `challenge.service.ts` | `loadOnboardingHighestCarbonArea` | 9 | 831-839 | OK |
| `challenge.service.ts` | `getRecentChallengeHistory` | 3 | 841-843 | OK |
| `challenge.service.ts` | `getDifficultyPreference` | 27 | 866-892 | OK |
| `challenge.service.ts` | `buildPersonalizedContext` | 6 | 894-899 | OK |
| `challenge.service.ts` | `buildTips` | 4 | 939-942 | OK |
| `challenge.service.ts` | `buildEquivalency` | 7 | 944-950 | OK |
| `challenge.service.ts` | `buildStreakLast14` | 2 | 952-953 | OK |
| `challenge.service.ts` | `normalizeDateString` | 9 | 987-995 | OK |
| `challenge.service.ts` | `toChallengeCategoryForScoring` | 3 | 997-999 | OK |
| `challenge.service.ts` | `countTodaysParticipants` | 17 | 1001-1017 | OK |
| `challenge.service.ts` | `loadStreakWindow` | 10 | 1019-1028 | OK |
| `challenge.service.ts` | `todayMinusDays` | 3 | 1050-1052 | OK |
| `copilot.service.ts` | `chat` | 6 | 37-42 | OK |
| `copilot.service.ts` | `chatWorkflow` | 14 | 49-62 | OK |
| `copilot.service.ts` | `loadChatContext` | 4 | 69-72 | OK |
| `copilot.service.ts` | `buildUserMessage` | 7 | 85-91 | OK |
| `copilot.service.ts` | `getAssistantResponse` | 14 | 98-111 | OK |
| `copilot.service.ts` | `toAiHistory` | 4 | 117-120 | OK |
| `copilot.service.ts` | `buildAssistantMessage` | 7 | 136-142 | OK |
| `copilot.service.ts` | `saveChatMessages` | 11 | 149-159 | OK |
| `copilot.service.ts` | `buildChatResult` | 10 | 166-175 | OK |
| `copilot.service.ts` | `getSuggestions` | 19 | 183-201 | OK |
| `copilot.service.ts` | `getHistory` | 11 | 209-219 | OK |
| `copilot.service.ts` | `getUserContext` | 26 | 221-246 | OK |
| `copilot.service.ts` | `getProfile` | 7 | 248-254 | OK |
| `copilot.service.ts` | `getMonthlyCarbonSummary` | 4 | 274-277 | OK |
| `copilot.service.ts` | `getMonthlyCarbonSummaryWorkflow` | 4 | 286-289 | OK |
| `copilot.service.ts` | `getCurrentMonthPeriodStart` | 6 | 300-305 | OK |
| `copilot.service.ts` | `loadMonthlyCarbonSummary` | 15 | 312-326 | OK |
| `copilot.service.ts` | `buildMonthlyCarbonSummary` | 4 | 332-335 | OK |
| `copilot.service.ts` | `getRecentChallenges` | 30 | 349-378 | OK |
| `copilot.service.ts` | `getOrCreateConversation` | 5 | 380-384 | OK |
| `copilot.service.ts` | `getOrCreateConversationWorkflow` | 11 | 391-401 | OK |
| `copilot.service.ts` | `findLatestConversation` | 15 | 408-422 | OK |
| `copilot.service.ts` | `createConversation` | 19 | 429-447 | OK |
| `copilot.service.ts` | `normalizeConversation` | 6 | 453-458 | OK |
| `copilot.service.ts` | `saveConversationMessages` | 17 | 460-476 | OK |
| `copilot.service.ts` | `buildSystemPrompt` | 30 | 478-507 | OK |
| `copilot.service.ts` | `generateFollowUpSuggestions` | 25 | 509-533 | OK |
| `copilot.service.ts` | `normalizeMessages` | 7 | 535-541 | OK |
| `copilot.service.ts` | `isCopilotMessage` | 13 | 543-555 | OK |
| `gamification.service.ts` | `getLevelForXp` | 14 | 43-56 | OK |
| `gamification.service.ts` | `getXpToNextLevel` | 4 | 64-67 | OK |
| `gamification.service.ts` | `addXP` | 6 | 74-79 | OK |
| `gamification.service.ts` | `addXPWorkflow` | 5 | 94-98 | OK |
| `gamification.service.ts` | `loadUserXpState` | 5 | 105-109 | OK |
| `gamification.service.ts` | `calculateXpUpdate` | 5 | 115-119 | OK |
| `gamification.service.ts` | `saveUserXpState` | 4 | 125-128 | OK |
| `gamification.service.ts` | `buildAddXpResult` | 3 | 134-136 | OK |
| `gamification.service.ts` | `checkAchievements` | 3 | 144-146 | OK |
| `gamification.service.ts` | `checkAchievementsWorkflow` | 8 | 161-168 | OK |
| `gamification.service.ts` | `loadAchievementInputs` | 10 | 174-183 | OK |
| `gamification.service.ts` | `getNewlyEarnedAchievements` | 3 | 189-191 | OK |
| `gamification.service.ts` | `isAchievementNewlyEarned` | 8 | 197-204 | OK |
| `gamification.service.ts` | `saveEarnedAchievements` | 4 | 210-213 | OK |
| `gamification.service.ts` | `awardAchievementBonusXp` | 4 | 218-221 | OK |
| `gamification.service.ts` | `getProgress` | 3 | 229-231 | OK |
| `gamification.service.ts` | `getProgressWorkflow` | 3 | 253-255 | OK |
| `gamification.service.ts` | `loadProgressInputs` | 11 | 262-272 | OK |
| `gamification.service.ts` | `buildProgressResponse` | 3 | 278-280 | OK |
| `gamification.service.ts` | `getAllAchievementsWithUserProgress` | 21 | 288-308 | OK |
| `gamification.service.ts` | `getUserAchievementState` | 4 | 310-313 | OK |
| `gamification.service.ts` | `getAllEarnableAchievements` | 17 | 327-343 | OK |
| `gamification.service.ts` | `getEarnedAchievementIds` | 12 | 345-356 | OK |
| `gamification.service.ts` | `getCompletedChallengeCount` | 13 | 358-370 | OK |
| `gamification.service.ts` | `getCompletedCarbonSaved` | 26 | 372-397 | OK |
| `impact.service.ts` | `getImpactTotal` | 3 | 13-15 | OK |
| `impact.service.ts` | `getImpactTotalWorkflow` | 3 | 36-38 | OK |
| `impact.service.ts` | `loadImpactTotalData` | 12 | 45-56 | OK |
| `impact.service.ts` | `buildImpactTotal` | 13 | 62-74 | OK |
| `impact.service.ts` | `getImpactEquivalencies` | 30 | 82-111 | OK |
| `impact.service.ts` | `getImpactShareCard` | 3 | 119-121 | OK |
| `impact.service.ts` | `getImpactShareCardWorkflow` | 3 | 140-142 | OK |
| `impact.service.ts` | `loadImpactShareCardData` | 10 | 149-158 | OK |
| `impact.service.ts` | `buildImpactShareCard` | 13 | 164-176 | OK |
| `impact.service.ts` | `getLifetimeCarbonSaved` | 30 | 184-213 | OK |
| `impact.service.ts` | `getCompletedChallengeCount` | 13 | 215-227 | OK |
| `impact.service.ts` | `getDaysActive` | 5 | 229-233 | OK |
| `impact.service.ts` | `getCardTheme` | 11 | 235-245 | OK |
| `plaid.service.ts` | `getPlaidClient` | 7 | 54-60 | OK |
| `plaid.service.ts` | `encryptionKey` | 3 | 62-64 | OK |
| `plaid.service.ts` | `encryptAccessToken` | 15 | 66-80 | OK |
| `plaid.service.ts` | `decryptAccessToken` | 19 | 82-100 | OK |
| `plaid.service.ts` | `sanitizeConnection` | 6 | 102-107 | OK |
| `plaid.service.ts` | `mapPlaidCategory` | 13 | 109-121 | OK |
| `plaid.service.ts` | `getMerchantName` | 8 | 123-130 | OK |
| `plaid.service.ts` | `getOwnedConnection` | 17 | 132-148 | OK |
| `plaid.service.ts` | `createLinkToken` | 14 | 156-169 | OK |
| `plaid.service.ts` | `exchangePublicToken` | 6 | 176-181 | OK |
| `plaid.service.ts` | `exchangePublicTokenWorkflow` | 6 | 190-195 | OK |
| `plaid.service.ts` | `exchangePlaidPublicToken` | 1 | 208-208 | OK |
| `plaid.service.ts` | `saveBankConnection` | 21 | 220-240 | OK |
| `plaid.service.ts` | `buildPublicConnectionWithSync` | 7 | 246-252 | OK |
| `plaid.service.ts` | `syncTransactions` | 6 | 267-272 | OK |
| `plaid.service.ts` | `syncTransactionsWorkflow` | 14 | 279-292 | OK |
| `plaid.service.ts` | `assertConnectedBank` | 5 | 299-303 | OK |
| `plaid.service.ts` | `createSyncState` | 10 | 309-318 | OK |
| `plaid.service.ts` | `syncPlaidTransactionPages` | 16 | 324-339 | OK |
| `plaid.service.ts` | `markRemovedTransactions` | 1 | 345-345 | OK |
| `plaid.service.ts` | `upsertChangedTransactions` | 12 | 359-370 | OK |
| `plaid.service.ts` | `upsertSyncedTransaction` | 14 | 376-389 | OK |
| `plaid.service.ts` | `saveSyncedTransaction` | 24 | 396-419 | OK |
| `plaid.service.ts` | `updateSyncCounters` | 13 | 425-437 | OK |
| `plaid.service.ts` | `updateBankConnectionSyncState` | 11 | 443-453 | OK |
| `plaid.service.ts` | `refreshAffectedCarbonSummaries` | 3 | 459-461 | OK |
| `plaid.service.ts` | `buildSyncResult` | 6 | 467-472 | OK |
| `plaid.service.ts` | `disconnectBank` | 6 | 479-484 | OK |
| `plaid.service.ts` | `disconnectBankWorkflow` | 12 | 491-502 | OK |
| `plaid.service.ts` | `removePlaidItem` | 5 | 508-512 | OK |
| `plaid.service.ts` | `markBankConnectionDisconnected` | 15 | 519-533 | OK |
| `plaid.service.ts` | `markConnectionTransactionsRemoved` | 7 | 539-545 | OK |
| `plaid.service.ts` | `handlePlaidWebhook` | 3 | 552-554 | OK |
| `plaid.service.ts` | `recalculateCarbonSummaries` | 19 | 583-601 | OK |
| `plaid.service.ts` | `getAffectedPeriods` | 5 | 603-607 | OK |
| `plaid.service.ts` | `getAffectedPeriodsWorkflow` | 5 | 616-620 | OK |
| `plaid.service.ts` | `buildAffectedPeriod` | 7 | 634-640 | OK |
| `plaid.service.ts` | `getDatePlusDays` | 5 | 646-650 | OK |
| `plaid.service.ts` | `getWeekStart` | 6 | 656-661 | OK |
| `plaid.service.ts` | `getMonthStart` | 3 | 667-669 | OK |
| `plaid.service.ts` | `getNextMonthStart` | 5 | 675-679 | OK |
| `plaid.service.ts` | `recalculateCarbonSummary` | 8 | 681-688 | OK |
| `plaid.service.ts` | `recalculateCarbonSummaryWorkflow` | 11 | 695-705 | OK |
| `plaid.service.ts` | `loadSummaryTransactions` | 15 | 712-726 | OK |
| `plaid.service.ts` | `summarizeTransactions` | 6 | 732-737 | OK |
| `plaid.service.ts` | `addTransactionToSummary` | 9 | 743-751 | OK |
| `plaid.service.ts` | `emptyCarbonSummary` | 3 | 757-759 | OK |
| `plaid.service.ts` | `upsertCarbonSummary` | 11 | 765-775 | OK |
| `plaid.service.ts` | `buildCarbonSummaryUpsert` | 14 | 781-794 | OK |
| `plaid.service.ts` | `formatDate` | 3 | 796-798 | OK |
| `plaid.service.ts` | `roundCurrency` | 3 | 800-802 | OK |
| `profile.service.ts` | `isRecord` | 3 | 44-46 | OK |
| `profile.service.ts` | `normalizeNotificationPreferences` | 6 | 48-53 | OK |
| `profile.service.ts` | `normalizeNotificationPreferencesWorkflow` | 16 | 60-75 | OK |
| `profile.service.ts` | `normalizeDailyChallengePreferences` | 14 | 81-94 | OK |
| `profile.service.ts` | `normalizeBooleanPreference` | 3 | 100-102 | OK |
| `profile.service.ts` | `normalizeDailyChallengeTime` | 13 | 108-120 | OK |
| `profile.service.ts` | `normalizeUnits` | 3 | 122-124 | OK |
| `profile.service.ts` | `normalizeCountry` | 25 | 126-150 | OK |
| `profile.service.ts` | `normalizeProfileSettings` | 4 | 152-155 | OK |
| `profile.service.ts` | `getProfileOnboardingRecord` | 3 | 172-174 | OK |
| `profile.service.ts` | `getProfileSavedSettings` | 3 | 180-182 | OK |
| `profile.service.ts` | `getProfile` | 3 | 190-192 | OK |
| `profile.service.ts` | `getProfileWorkflow` | 8 | 199-206 | OK |
| `profile.service.ts` | `loadProfileUser` | 13 | 213-225 | OK |
| `profile.service.ts` | `loadProfileRelatedData` | 13 | 231-243 | OK |
| `profile.service.ts` | `logProfileRelatedDataFailures` | 12 | 249-260 | OK |
| `profile.service.ts` | `countCompletedProfileChallenges` | 14 | 266-279 | OK |
| `profile.service.ts` | `calculateProfileCarbonSaved` | 9 | 285-293 | OK |
| `profile.service.ts` | `loadProfileSavedChallengeRows` | 13 | 300-312 | OK |
| `profile.service.ts` | `sumProfileSavedCarbon` | 7 | 318-324 | OK |
| `profile.service.ts` | `sumSavedCarbonRow` | 3 | 330-332 | OK |
| `profile.service.ts` | `buildProfileResponse` | 20 | 342-361 | OK |
| `profile.service.ts` | `updateProfile` | 3 | 370-372 | OK |
| `profile.service.ts` | `updateProfileWorkflow` | 11 | 379-389 | OK |
| `profile.service.ts` | `buildProfileDbUpdate` | 13 | 396-408 | OK |
| `profile.service.ts` | `applyDirectProfileFields` | 9 | 414-422 | OK |
| `profile.service.ts` | `loadCurrentProfilePreferences` | 13 | 429-441 | OK |
| `profile.service.ts` | `applyNotificationUpdate` | 10 | 447-456 | OK |
| `profile.service.ts` | `applySettingsUpdate` | 15 | 462-476 | OK |
| `profile.service.ts` | `saveProfileUpdate` | 12 | 483-494 | OK |
| `profile.service.ts` | `getCarbonAgeDetail` | 3 | 502-504 | OK |
| `profile.service.ts` | `getCarbonAgeDetailWorkflow` | 6 | 511-516 | OK |
| `profile.service.ts` | `loadCarbonAgeUser` | 13 | 523-535 | OK |
| `profile.service.ts` | `getCarbonAgeAnnualTons` | 6 | 541-546 | OK |
| `profile.service.ts` | `buildCarbonAgeDetail` | 13 | 552-564 | OK |
| `profile.service.ts` | `deleteProfile` | 4 | 572-575 | OK |
| `profile.service.ts` | `deleteProfileWorkflow` | 4 | 584-587 | OK |
| `profile.service.ts` | `disconnectActiveBankConnections` | 10 | 606-615 | OK |
| `profile.service.ts` | `deleteProfileOwnedData` | 9 | 622-630 | OK |
| `profile.service.ts` | `deleteUserProfileRow` | 10 | 637-646 | OK |
| `profile.service.ts` | `deleteAuthUser` | 7 | 653-659 | OK |
| `profile.service.ts` | `buildDeleteProfileResult` | 1 | 665-665 | OK |
| `profile.service.ts` | `getProfileBankConnections` | 12 | 669-680 | OK |
| `profile.service.ts` | `safeDisconnectBank` | 10 | 682-691 | OK |
| `profile.service.ts` | `getProfileTeams` | 18 | 693-710 | OK |
| `profile.service.ts` | `getRawBankConnections` | 2 | 712-713 | OK |
| `profile.service.ts` | `getUserTeamIds` | 12 | 727-738 | OK |
| `profile.service.ts` | `getCurrentAnnualCarbonTons` | 16 | 740-755 | OK |
| `profile.service.ts` | `deleteFromTable` | 7 | 757-763 | OK |
| `streak.service.ts` | `incrementStreak` | 5 | 34-38 | OK |
| `streak.service.ts` | `incrementStreakWorkflow` | 10 | 53-62 | OK |
| `streak.service.ts` | `loadStreakState` | 5 | 69-73 | OK |
| `streak.service.ts` | `countCompletedChallengesForDate` | 5 | 80-84 | OK |
| `streak.service.ts` | `getNextStreakState` | 4 | 90-93 | OK |
| `streak.service.ts` | `saveIncrementedStreak` | 4 | 99-102 | OK |
| `streak.service.ts` | `buildUnchangedStreakResult` | 3 | 108-110 | OK |
| `streak.service.ts` | `buildIncrementStreakResult` | 3 | 116-118 | OK |
| `streak.service.ts` | `checkAndResetStreak` | 5 | 125-129 | OK |
| `streak.service.ts` | `checkAndResetStreakWorkflow` | 8 | 142-149 | OK |
| `streak.service.ts` | `loadStreakResetState` | 5 | 156-160 | OK |
| `streak.service.ts` | `markSafeStreak` | 4 | 166-169 | OK |
| `streak.service.ts` | `useAvailableStreakFreeze` | 5 | 176-180 | OK |
| `streak.service.ts` | `resetExpiredStreak` | 5 | 187-191 | OK |
| `streak.service.ts` | `regenerateStreakFreeze` | 4 | 199-202 | OK |
| `streak.service.ts` | `regenerateStreakFreezeWorkflow` | 4 | 213-216 | OK |
| `streak.service.ts` | `loadStreakFreezeState` | 5 | 227-231 | OK |
| `streak.service.ts` | `shouldRegenerateStreakFreeze` | 4 | 237-240 | OK |
| `streak.service.ts` | `enableStreakFreeze` | 1 | 247-247 | OK |
| `streak.service.ts` | `useStreakFreeze` | 4 | 259-262 | OK |
| `streak.service.ts` | `getStreakInfo` | 24 | 295-318 | OK |
| `streak.service.ts` | `markStreakChecked` | 10 | 320-329 | OK |
| `team.service.ts` | `createTeam` | 27 | 19-45 | OK |
| `team.service.ts` | `joinTeam` | 24 | 52-75 | OK |
| `team.service.ts` | `getTeam` | 3 | 84-86 | OK |
| `team.service.ts` | `getTeamWorkflow` | 6 | 93-98 | OK |
| `team.service.ts` | `loadTeamOverview` | 14 | 105-118 | OK |
| `team.service.ts` | `buildTeamDetail` | 15 | 124-138 | OK |
| `team.service.ts` | `calculateAverageStreak` | 7 | 144-150 | OK |
| `team.service.ts` | `getLeaderboard` | 7 | 157-163 | OK |
| `team.service.ts` | `getLeaderboardWorkflow` | 18 | 170-187 | OK |
| `team.service.ts` | `getLeaderboardCacheKey` | 3 | 193-195 | OK |
| `team.service.ts` | `getCachedLeaderboard` | 5 | 201-205 | OK |
| `team.service.ts` | `buildLeaderboardPayload` | 9 | 211-219 | OK |
| `team.service.ts` | `buildLeaderboardRow` | 16 | 225-240 | OK |
| `team.service.ts` | `rankLeaderboardRows` | 5 | 246-250 | OK |
| `team.service.ts` | `cacheLeaderboardPayload` | 8 | 256-263 | OK |
| `team.service.ts` | `getMyTeams` | 3 | 271-273 | OK |
| `team.service.ts` | `getMyTeamsWorkflow` | 6 | 280-285 | OK |
| `team.service.ts` | `loadTeamMemberships` | 12 | 292-303 | OK |
| `team.service.ts` | `loadMembershipTeam` | 19 | 309-327 | OK |
| `team.service.ts` | `filterLoadedTeams` | 3 | 333-335 | OK |
| `team.service.ts` | `updateTeamStats` | 30 | 343-372 | OK |
| `team.service.ts` | `updateUserTeamStats` | 14 | 380-393 | OK |
| `team.service.ts` | `verifyMembership` | 12 | 395-406 | OK |
| `team.service.ts` | `getAnonymizedMembers` | 13 | 408-420 | OK |
| `team.service.ts` | `getTeamMembersWithUsers` | 13 | 422-434 | OK |
| `team.service.ts` | `getActiveTeamChallenge` | 30 | 472-501 | OK |
| `team.service.ts` | `getMemberChallengeStats` | 4 | 503-506 | OK |
| `team.service.ts` | `getMemberChallengeStatsWorkflow` | 4 | 515-518 | OK |
| `team.service.ts` | `loadCompletedChallenges` | 15 | 534-548 | OK |
| `team.service.ts` | `loadChallengeSavings` | 15 | 555-569 | OK |
| `team.service.ts` | `buildMemberChallengeStats` | 11 | 575-585 | OK |
| `team.service.ts` | `getPeriodStart` | 10 | 587-596 | OK |
| `team.service.ts` | `clearTeamLeaderboardCache` | 11 | 598-608 | OK |
| `team.service.ts` | `generateInviteCode` | 9 | 610-618 | OK |

### Phase 2b verification
- Function line-count scan across the nine scoped service files: passed with zero function declarations over 30 lines.
- `npm run build --prefix carbonsense-api`: passed.
- Service test suite: no dedicated service test suite was found in `carbonsense-api`; no service tests were run.
- Files touched in Phase 2b were limited to the nine scoped service files and this audit report.

## Testing safety pass

A focused API service unit-test pass was added after the mechanical service decomposition because no dedicated API tests existed under `carbonsense-api/src` or `carbonsense-api/tests`.

### Test infrastructure

- Added Vitest as the API test runner and `npm test` script in `carbonsense-api/package.json`.
- Added `carbonsense-api/vitest.config.ts` with Node environment, sequential file execution, and `tests/**/*.test.ts` discovery.
- Added shared Supabase/env/Redis/AI mocks under `carbonsense-api/tests` so tests do not hit real external services.

### New service coverage

| File | Function under test | Coverage added |
| --- | --- | --- |
| `tests/services/carbon.service.test.ts` | `getDashboard` | Happy dashboard shape, empty challenge data edge case, profile-load failure. |
| `tests/services/plaid.service.test.ts` | `syncTransactions` | Added transaction sync, pending transaction edge case, disconnected connection failure. |
| `tests/services/profile.service.test.ts` | `getProfile` | Full profile shape, optional related-data fallback, base profile failure. |
| `tests/services/profile.service.test.ts` | `updateProfile` | Direct field update, empty update fallback, update failure. |
| `tests/services/challenge.service.test.ts` | `getTodayChallenge` assignment path for `assignBestChallenge` | New assignment happy path, existing assignment hydration edge case, no active challenges failure. |
| `tests/services/gamification.service.test.ts` | `checkAchievements` | Newly earned achievement, already-earned edge case, state-load failure. |
| `tests/services/team.service.test.ts` | `getLeaderboard` | Ranked leaderboard happy path, empty team edge case, non-member failure. |

### Remaining testing gaps

The new tests focus on the highest-risk decomposed workflows requested for this pass. Remaining service workflows still need coverage, including transaction listing/trends/category detail/comparison, challenge completion/history/library, Plaid token exchange/disconnect/webhook, streak operations, impact cards, Copilot chat/history/suggestions, profile deletion/carbon-age detail, and team create/join/detail/my-teams/stat updates.

### Testing verification

- `npm test --prefix carbonsense-api`: passed, 6 test files and 21 tests.

