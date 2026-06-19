import { useEffect } from "react";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

type HydratedAuthProfile = {
  name?: string | null;
  avatar_url?: string | null;
  onboarding_complete?: boolean | null;
  streak?: number;
  level?: number;
  level_name?: string;
};

async function hydrateProfile(userId: string, accessToken?: string): Promise<HydratedAuthProfile | null> {
  try {
    const { data } = await api.get<{ profile?: HydratedAuthProfile }>(
      "/auth/me",
      {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      },
    );
    return data.profile ?? null;
  } catch (error) {
    console.warn("[auth] Could not hydrate backend profile", { userId, error });
    return null;
  }
}

async function hydrateProgress(accessToken?: string): Promise<{
  streak?: number;
  level?: number;
  level_name?: string;
} | null> {
  try {
    const { data } = await api.get<{
      streak?: number;
      level?: number;
      level_name?: string;
    }>("/profile", {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
    if (!data || typeof data !== "object") return null;
    return {
      streak: typeof data.streak === "number" ? data.streak : undefined,
      level: typeof data.level === "number" ? data.level : undefined,
      level_name: typeof data.level_name === "string" ? data.level_name : undefined,
    };
  } catch (error) {
    console.warn("[auth] Could not hydrate progress", { error });
    return null;
  }
}

/**
 * Wires Supabase auth into the Zustand store. Mount once at the root.
 * Also hydrates `onboarding_complete` from the profiles table so the
 * onboarding gate can route correctly.
 */
export function useAuthListener() {
  const setSession = useAuthStore((s) => s.setSession);
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const reset = useAuthStore((s) => s.reset);

  useEffect(() => {
    let hydratedSessionId: string | null = null;

    const applySession = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]) => {
      const sessionId = session?.access_token ?? null;
      if (hydratedSessionId === sessionId) {
        return;
      }
      hydratedSessionId = sessionId;
      setSession(session);
      if (!session?.user) {
        setUser(null);
        return;
      }
      const profile = await hydrateProfile(session.user.id, session.access_token);
      const progress = await hydrateProgress(session.access_token);
      setUser({
        id: session.user.id,
        email: session.user.email ?? "",
        full_name:
          profile?.name ??
          ((session.user.user_metadata?.full_name as string | undefined) ?? null),
        avatar_url:
          profile?.avatar_url ??
          ((session.user.user_metadata?.avatar_url as string | undefined) ?? null),
        onboarding_complete: profile?.onboarding_complete ?? true,
        streak: progress?.streak,
        level: progress?.level,
        level_name: progress?.level_name,
      });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        hydratedSessionId = null;
        reset();
        return;
      }
      if (
        event === "SIGNED_IN" ||
        event === "USER_UPDATED" ||
        event === "INITIAL_SESSION"
      ) {
        void applySession(session);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      await applySession(data.session);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [setSession, setUser, setLoading, reset]);
}
