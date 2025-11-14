// src/lib/serverAuth.ts
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";

export async function getSessionAndRole() {
  // 1) Tworzymy klienta z dostępem do ciasteczek
  const supabase = createRouteHandlerClient<Database>({ cookies });

  // 2) Pobieramy sesję
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { session: null, role: null };
  }

  // 3) Pobieramy rolę użytkownika
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (error) {
    console.error("Błąd pobierania profilu:", error);
    return { session, role: null };
  }

  return {
    session,
    role: profile?.role ?? null,
  };
}
