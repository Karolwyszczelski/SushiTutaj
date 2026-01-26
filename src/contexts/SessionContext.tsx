"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

interface SessionContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  user: null,
  isLoading: true,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <SessionContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isLoading,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

/**
 * Hook to get the current session (compatible with useSession from auth-helpers-react)
 */
export function useSession(): Session | null {
  const { session } = useContext(SessionContext);
  return session;
}

/**
 * Hook to get the current user
 */
export function useUser(): User | null {
  const { user } = useContext(SessionContext);
  return user;
}

/**
 * Hook to check if session is still loading
 */
export function useSessionLoading(): boolean {
  const { isLoading } = useContext(SessionContext);
  return isLoading;
}

/**
 * Hook to get the full session context
 */
export function useSessionContext(): SessionContextValue {
  return useContext(SessionContext);
}
