// src/lib/serverAuth.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

// Service role client - omija RLS dla restaurant_admins
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, detectSessionInUrl: false } }
);

type AdminRow = {
  role?: string | null;
};

export async function getSessionAndRole(_req?: Request) {
  // Next.js 15: cookies() musi być await'owane
  const cookieStore = await cookies();
  
  // 1) Klient Supabase z ciasteczkami Next
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );

  // 2) Użytkownik (getUser weryfikuje z serwerem auth)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { session: null, role: null };
  }

  // 3) Rola użytkownika z tabeli restaurant_admins (używamy service role żeby ominąć RLS)
  const { data, error } = await supabaseAdmin
    .from("restaurant_admins")
    .select("role")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Błąd pobierania roli z restaurant_admins:", error);
    return { session: { user }, role: null };
  }

  const rawRole = (data as AdminRow)?.role ?? null;

  // Opcjonalne mapowanie – jeśli w bazie masz 'owner', traktuj go jak 'admin'
  let role: string | null = rawRole;
  if (rawRole === "owner") {
    role = "admin";
  }

  return {
    session: { user },
    role,
  };
}
