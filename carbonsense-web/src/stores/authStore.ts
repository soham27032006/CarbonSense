import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isAuthenticated: false,
  isLoading: true,
  setSession: (session) =>
    set({ session, isAuthenticated: !!session }),
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  reset: () =>
    set({ user: null, session: null, isAuthenticated: false, isLoading: false }),
}));
