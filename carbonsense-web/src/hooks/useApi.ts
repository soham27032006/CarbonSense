import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";

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

// Auth
export const useCurrentUser = () =>
  useQuery({
    queryKey: ["auth-me"],
    queryFn: () => api.get("/auth/me").then((r) => r.data),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

// Dashboard
export const useDashboard = () =>
  useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get("/carbon/dashboard").then((r) => r.data),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

export const useTransactions = (params?: QueryParams) =>
  useQuery({
    queryKey: ["transactions", cleanParams(params)],
    queryFn: () =>
      api.get("/carbon/transactions", { params: cleanParams(params) }).then((r) => r.data),
  });

export const useTrends = (period: string, range: number) =>
  useQuery({
    queryKey: ["trends", period, range],
    queryFn: () => api.get("/carbon/trends", { params: { period, range } }).then((r) => r.data),
  });

export const useCategoryDetail = (category: string) =>
  useQuery({
    queryKey: ["category-detail", category],
    queryFn: () => api.get(`/carbon/category/${category}`).then((r) => r.data),
    enabled: Boolean(category),
  });

export const useComparison = () =>
  useQuery({
    queryKey: ["comparison"],
    queryFn: () => api.get("/carbon/compare").then((r) => r.data),
  });

// Challenges
export const useTodayChallenge = () =>
  useQuery({
    queryKey: ["challenge-today"],
    queryFn: () => api.get("/challenges/today").then((r) => r.data),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

export const useAcceptChallenge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/challenges/${id}/accept`).then((r) => r.data),
    onSuccess: () => invalidateCore(qc),
  });
};

export const useCompleteChallenge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/challenges/${id}/complete`).then((r) => r.data),
    onSuccess: () => invalidateCore(qc),
  });
};

export const useSkipChallenge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/challenges/${id}/skip`, { reason }).then((r) => r.data),
    onSuccess: () => invalidateCore(qc),
  });
};

export const useChallengeHistory = (params?: QueryParams) =>
  useQuery({
    queryKey: ["challenge-history", cleanParams(params)],
    queryFn: () =>
      api.get("/challenges/history", { params: cleanParams(params) }).then((r) => r.data),
  });

export const useChallengeLibrary = () =>
  useQuery({
    queryKey: ["challenge-library"],
    queryFn: () => api.get("/challenges/library").then((r) => r.data),
  });

// Streaks and gamification
export const useStreaks = () =>
  useQuery({
    queryKey: ["streaks"],
    queryFn: () => api.get("/streaks").then((r) => r.data),
  });

export const useUseStreakFreeze = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/streaks/freeze").then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["streaks"] }),
  });
};

export const useAchievements = () =>
  useQuery({
    queryKey: ["achievements"],
    queryFn: () => api.get("/achievements").then((r) => r.data),
  });

export const useLevel = () =>
  useQuery({
    queryKey: ["level"],
    queryFn: () => api.get("/level").then((r) => r.data),
  });

// Copilot
export const useCopilotChat = () =>
  useMutation({
    mutationFn: (message: string) => api.post("/copilot/chat", { message }).then((r) => r.data),
  });

export const useCopilotSuggestions = () =>
  useQuery({
    queryKey: ["copilot-suggestions"],
    queryFn: () => api.get("/copilot/suggestions").then((r) => r.data),
  });

export const useCopilotHistory = () =>
  useQuery({
    queryKey: ["copilot-history"],
    queryFn: () => api.get("/copilot/history").then((r) => r.data),
  });

// Teams
export const useMyTeams = () =>
  useQuery({
    queryKey: ["my-teams"],
    queryFn: () => api.get("/teams/my-teams").then((r) => r.data),
  });

export const useCreateTeam = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; type: string; description?: string }) =>
      api.post("/teams/create", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-teams"] }),
  });
};

export const useJoinTeam = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) =>
      api.post(`/teams/join/${encodeURIComponent(inviteCode)}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-teams"] }),
  });
};

export const useTeam = (id: string) =>
  useQuery({
    queryKey: ["team", id],
    queryFn: () => api.get(`/teams/${id}`).then((r) => r.data),
    enabled: Boolean(id),
  });

export const useTeamLeaderboard = (id: string, period: string) =>
  useQuery({
    queryKey: ["team-leaderboard", id, period],
    queryFn: () =>
      api.get(`/teams/${id}/leaderboard`, { params: { period } }).then((r) => r.data),
    enabled: Boolean(id),
  });

// Impact
export const useImpact = () =>
  useQuery({
    queryKey: ["impact"],
    queryFn: () => api.get("/impact/total").then((r) => r.data),
  });

export const useImpactEquivalencies = () =>
  useQuery({
    queryKey: ["impact-equivalencies"],
    queryFn: () => api.get("/impact/equivalencies").then((r) => r.data),
  });

export const useShareCard = () =>
  useQuery({
    queryKey: ["share-card"],
    queryFn: () => api.get("/impact/share-card").then((r) => r.data),
  });

// Profile
export const useProfile = () =>
  useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get("/profile").then((r) => r.data),
  });

export const useUpdateProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch("/profile", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
};

export const useCarbonAge = () =>
  useQuery({
    queryKey: ["carbon-age"],
    queryFn: () => api.get("/profile/carbon-age").then((r) => r.data),
  });

export const useDeleteAccount = () =>
  useMutation({
    mutationFn: () => api.delete("/profile").then((r) => r.data),
  });

// Plaid
export const useCreateLinkToken = () =>
  useMutation({
    mutationFn: () => api.post("/plaid/create-link-token").then((r) => r.data),
  });

export const useExchangePlaidToken = () =>
  useMutation({
    mutationFn: (data: { public_token: string; institution: { id: string; name: string } }) =>
      api.post("/plaid/exchange-token", data).then((r) => r.data),
  });

export const useSyncTransactions = () =>
  useMutation({
    mutationFn: (connection_id: string) =>
      api.post("/plaid/sync-transactions", { connection_id }).then((r) => r.data),
  });

export const useDisconnectBank = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      api.delete(`/plaid/disconnect/${connectionId}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
};
