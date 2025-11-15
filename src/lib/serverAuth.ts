// src/lib/serverAuth.ts
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";

type ProfileRoleRow = {
  role?: string | null;
};

export async function getSessionAndRole(_req?: Request) {
  // 1) Klient Supabase z ciasteczkami Next
  const supabase = createRouteHandlerClient<Database>({ cookies });

  // 2) Sesja
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { session: null, role: null };
  }

  // 3) Rola użytkownika z tabeli profiles
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle<ProfileRoleRow>();

  if (error) {
    console.error("Błąd pobierania profilu:", error);
    return { session, role: null };
  }

  return {
    session,
    role: profile?.role ?? null,
  };
}
