import { createFileRoute, redirect } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login" });
    }
    const { data: me } = await api.get<{
      profile?: { onboarding_complete?: boolean | null };
    }>("/auth/me");
    if (me.profile?.onboarding_complete) {
      throw redirect({ to: "/home" });
    }
    throw redirect({ to: "/onboarding" });
  },
  component: () => null,
});
