/**
 * React Query hooks for CarbonSense API resources. Provides typed cache keys, mutations, and invalidation behavior for route components.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { useAuthStore } from "@/stores/authStore";

type QueryParams = Record<string, string | number | boolean | undefined | null>;

function cleanParams(params?: QueryParams) {
  return Object.fromEntries(
    Object.entries(params ?? {}).filter(([, value]) => value !== undefined && value !== null),
  );
}

function invalidateCore(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["challenge-today"] });
  qc.invalidateQueries({ queryKey: ["streaks"] });
  qc.invalidateQueries({ queryKey: ["impact"] });
  qc.invalidateQueries({ queryKey: ["profile"] });
}

function useScopedUserId() {
  return useAuthStore((state) => state.user?.id ?? state.session?.user?.id ?? null);
}

function useAuthedQuery<TData>(options: {
  queryKey: unknown[];
  queryFn: () => Promise<TData>;
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
}) {
  const userId = useScopedUserId();

  return useQuery({
    ...options,
    queryKey: [...options.queryKey, userId],
    enabled: Boolean(userId) && (options.enabled ?? true),
  });
}

// Auth
/**
 * Provides the useCurrentUser React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useCurrentUser = () =>
  useAuthedQuery({
    queryKey: ["auth-me"],
    queryFn: () => api.get("/auth/me").then((r) => r.data),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

// Dashboard
/**
 * Provides the useDashboard React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useDashboard = () =>
  useAuthedQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get("/carbon/dashboard").then((r) => r.data),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

/**
 * Provides the useTransactions React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useTransactions = (params?: QueryParams) =>
  useAuthedQuery({
    queryKey: ["transactions", cleanParams(params)],
    queryFn: () =>
      api.get("/carbon/transactions", { params: cleanParams(params) }).then((r) => r.data),
  });

/**
 * Provides the useTrends React Query hook for CarbonSense screens.
 * @param period - Input consumed by this workflow.
 * @param range - Input consumed by this workflow.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useTrends = (period: string, range: number) =>
  useAuthedQuery({
    queryKey: ["trends", period, range],
    queryFn: () => api.get("/carbon/trends", { params: { period, range } }).then((r) => r.data),
  });

/**
 * Provides the useCategoryDetail React Query hook for CarbonSense screens.
 * @param category - Input consumed by this workflow.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useCategoryDetail = (category: string) =>
  useAuthedQuery({
    queryKey: ["category-detail", category],
    queryFn: () => api.get(`/carbon/category/${category}`).then((r) => r.data),
    enabled: Boolean(category),
  });

/**
 * Provides the useComparison React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useComparison = () =>
  useAuthedQuery({
    queryKey: ["comparison"],
    queryFn: () => api.get("/carbon/compare").then((r) => r.data),
  });

// Challenges
/**
 * Provides the useTodayChallenge React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useTodayChallenge = () =>
  useAuthedQuery({
    queryKey: ["challenge-today"],
    queryFn: () => api.get("/challenges/today").then((r) => r.data),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

/**
 * Provides the useAcceptChallenge React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useAcceptChallenge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/challenges/${id}/accept`).then((r) => r.data),
    onSuccess: () => invalidateCore(qc),
  });
};

/**
 * Provides the useCompleteChallenge React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useCompleteChallenge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/challenges/${id}/complete`).then((r) => r.data),
    onSuccess: () => invalidateCore(qc),
  });
};

/**
 * Provides the useSkipChallenge React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useSkipChallenge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/challenges/${id}/skip`, { reason }).then((r) => r.data),
    onSuccess: () => invalidateCore(qc),
  });
};

/**
 * Provides the useChallengeHistory React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useChallengeHistory = (params?: QueryParams) =>
  useAuthedQuery({
    queryKey: ["challenge-history", cleanParams(params)],
    queryFn: () =>
      api.get("/challenges/history", { params: cleanParams(params) }).then((r) => r.data),
  });

/**
 * Provides the useChallengeLibrary React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useChallengeLibrary = () =>
  useAuthedQuery({
    queryKey: ["challenge-library"],
    queryFn: () => api.get("/challenges/library").then((r) => r.data),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

// Streaks and gamification
/**
 * Provides the useStreaks React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useStreaks = () =>
  useAuthedQuery({
    queryKey: ["streaks"],
    queryFn: () => api.get("/streaks").then((r) => r.data),
  });

/**
 * Canonical streak count for the current user.
 *
 * Single source of truth — every page reads streak through this hook so
 * Home / Dashboard / Challenges / etc. can never disagree. Backed by
 * `GET /streaks`, which is invalidated on every accept/complete/skip via
 * `invalidateCore` so the value updates immediately after a mutation.
 *
 * Returns `undefined` until the first response arrives; consumers should
 * pass the value straight to a chip that already handles `undefined`
 * (e.g. `<StreakChip streak={…}>` hides itself when the number isn't ready).
 */
export const useCurrentStreak = (): number | undefined => {
  const { data } = useStreaks();
  const current = (data as { current?: number } | undefined)?.current;
  return typeof current === "number" ? current : undefined;
};

/**
 * Provides the useUseStreakFreeze React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useUseStreakFreeze = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/streaks/freeze").then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["streaks"] }),
  });
};

/**
 * Provides the useAchievements React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useAchievements = () =>
  useAuthedQuery({
    queryKey: ["achievements"],
    queryFn: () => api.get("/achievements").then((r) => r.data),
  });

/**
 * Provides the useLevel React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useLevel = () =>
  useAuthedQuery({
    queryKey: ["level"],
    queryFn: () => api.get("/level").then((r) => r.data),
  });

// Copilot
/**
 * Provides the useCopilotChat React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useCopilotChat = () =>
  useMutation({
    mutationFn: (message: string) => api.post("/copilot/chat", { message }).then((r) => r.data),
  });

/**
 * Provides the useCopilotSuggestions React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useCopilotSuggestions = () =>
  useAuthedQuery({
    queryKey: ["copilot-suggestions"],
    queryFn: () => api.get("/copilot/suggestions").then((r) => r.data),
  });

/**
 * Provides the useCopilotHistory React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useCopilotHistory = () =>
  useAuthedQuery({
    queryKey: ["copilot-history"],
    queryFn: () => api.get("/copilot/history").then((r) => r.data),
  });

// Teams
/**
 * Provides the useMyTeams React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useMyTeams = () =>
  useAuthedQuery({
    queryKey: ["my-teams"],
    queryFn: () => api.get("/teams/my-teams").then((r) => r.data),
  });

/**
 * Provides the useCreateTeam React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useCreateTeam = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; type: string; description?: string }) =>
      api.post("/teams/create", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-teams"] }),
  });
};

/**
 * Provides the useJoinTeam React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useJoinTeam = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) =>
      api.post(`/teams/join/${encodeURIComponent(inviteCode)}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-teams"] }),
  });
};

/**
 * Provides the useTeam React Query hook for CarbonSense screens.
 * @param id - Input consumed by this workflow.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useTeam = (id: string) =>
  useAuthedQuery({
    queryKey: ["team", id],
    queryFn: () => api.get(`/teams/${id}`).then((r) => r.data),
    enabled: Boolean(id),
  });

/**
 * Provides the useTeamLeaderboard React Query hook for CarbonSense screens.
 * @param id - Input consumed by this workflow.
 * @param period - Input consumed by this workflow.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useTeamLeaderboard = (id: string, period: string) =>
  useAuthedQuery({
    queryKey: ["team-leaderboard", id, period],
    queryFn: () =>
      api.get(`/teams/${id}/leaderboard`, { params: { period } }).then((r) => r.data),
    enabled: Boolean(id),
  });

// Impact
/**
 * Provides the useImpact React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useImpact = () =>
  useAuthedQuery({
    queryKey: ["impact"],
    queryFn: () => api.get("/impact/total").then((r) => r.data),
  });

/**
 * Provides the useImpactEquivalencies React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useImpactEquivalencies = () =>
  useAuthedQuery({
    queryKey: ["impact-equivalencies"],
    queryFn: () => api.get("/impact/equivalencies").then((r) => r.data),
  });

/**
 * Provides the useShareCard React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useShareCard = () =>
  useAuthedQuery({
    queryKey: ["share-card"],
    queryFn: () => api.get("/impact/share-card").then((r) => r.data),
  });

// Profile
/**
 * Provides the useProfile React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useProfile = () =>
  useAuthedQuery({
    queryKey: ["profile"],
    queryFn: () => api.get("/profile").then((r) => r.data),
  });

/**
 * Provides the useUpdateProfile React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useUpdateProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch("/profile", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
};

/**
 * Provides the useCarbonAge React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useCarbonAge = () =>
  useAuthedQuery({
    queryKey: ["carbon-age"],
    queryFn: () => api.get("/profile/carbon-age").then((r) => r.data),
  });

/**
 * Provides the useDeleteAccount React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useDeleteAccount = () =>
  useMutation({
    mutationFn: () => api.delete("/profile").then((r) => r.data),
  });

// Plaid
/**
 * Provides the useCreateLinkToken React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useCreateLinkToken = () =>
  useMutation({
    mutationFn: () => api.post("/plaid/create-link-token").then((r) => r.data),
  });

/**
 * Provides the useExchangePlaidToken React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useExchangePlaidToken = () =>
  useMutation({
    mutationFn: (data: { public_token: string; institution: { id: string; name: string } }) =>
      api.post("/plaid/exchange-token", data).then((r) => r.data),
  });

/**
 * Provides the useSyncTransactions React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useSyncTransactions = () =>
  useMutation({
    mutationFn: (connection_id: string) =>
      api.post("/plaid/sync-transactions", { connection_id }).then((r) => r.data),
  });

/**
 * Provides the useDisconnectBank React Query hook for CarbonSense screens.
 * @returns Returns the React Query result or mutation object for the API operation.
 * @throws Surfaces request failures through React Query error state.
 */
export const useDisconnectBank = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      api.delete(`/plaid/disconnect/${connectionId}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
};
