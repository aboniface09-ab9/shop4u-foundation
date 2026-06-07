import { useEffect } from "react";
import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

/**
 * Auth store — a thin mirror of Supabase's auth state into Zustand
 * so any component can read the current user without touching
 * supabase.auth directly.
 *
 * Bootstrap by calling useAuthBootstrap() once from __root.tsx — it
 * reads the existing session from localStorage on mount and subscribes
 * to onAuthStateChange to keep the store in sync.
 */
type AuthState = {
  session: Session | null;
  user: User | null;
  isLoading: boolean; // true until the initial session check completes
  setSession: (s: Session | null) => void;
  setLoading: (b: boolean) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setLoading: (isLoading) => set({ isLoading }),
}));

/**
 * Sign in with email + password. Returns the error (if any) so the
 * login form can render it.
 */
export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error;
}

/** Sign out the current user. */
export async function signOut() {
  await supabase.auth.signOut();
}

/**
 * Hydrate the auth store from Supabase's existing session, and keep it
 * in sync with future sign-in / sign-out events. Call once from
 * __root.tsx — multiple calls are safe but wasteful.
 */
export function useAuthBootstrap() {
  const setSession = useAuthStore((s) => s.setSession);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    let mounted = true;

    // Initial check — Supabase persists sessions to localStorage by
    // default, but we explicitly disabled that in supabase.ts for the
    // anonymous client. Even so, getSession() works in-memory and won't
    // throw.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [setSession, setLoading]);
}

// Convenience selectors
export const useAuthUser = () => useAuthStore((s) => s.user);
export const useIsAuthenticated = () => useAuthStore((s) => !!s.user);
export const useAuthLoading = () => useAuthStore((s) => s.isLoading);
