// src/lib/serverAuth.ts
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";

type AdminRow = {
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

  // 3) Rola użytkownika z tabeli restaurant_admins (ZAMIAST profiles.role)
  const { data, error } = await supabase
    .from("restaurant_admins")
    .select("role")
    .eq("user_id", session.user.id)
    .order("added_at", { ascending: false })
    .limit(1)
    .maybeSingle<AdminRow>();

  if (error) {
    console.error("Błąd pobierania roli z restaurant_admins:", error);
    return { session, role: null };
  }

  const rawRole = data?.role ?? null;

  // Opcjonalne mapowanie – jeśli w bazie masz 'owner', traktuj go jak 'admin'
  let role: string | null = rawRole;
  if (rawRole === "owner") {
    role = "admin";
  }

  return {
    session,
    role,
  };
}
