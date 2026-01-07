// SSR/Route Handlers: rozwiąż restaurant_id z ?restaurant=slug lub z membership
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

export async function resolveRestaurantId(req: Request) {
  // Next.js 15: cookies() musi być await'owane
  const cookieStore = await cookies();
  
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" as const };

  const url = new URL(req.url);
  const wantSlug = url.searchParams.get("restaurant")?.toLowerCase() || null;

  // Używamy supabaseAdmin (service role) żeby ominąć RLS przy sprawdzaniu membershipów
  const { data: mem, error: mErr } = await supabaseAdmin
    .from("restaurant_admins")
    .select("restaurant_id, restaurants:restaurants!inner(slug)")
    .eq("user_id", user.id);

  if (mErr || !mem || mem.length === 0) return { error: "forbidden" as const };

  // jeśli podano slug, wybierz tylko gdy user ma do niego dostęp
  if (wantSlug) {
    const found = mem.find((m: any) => m.restaurants?.slug === wantSlug);
    if (!found) return { error: "forbidden" as const };
    return { restaurant_id: found.restaurant_id as string, supabase };
  }

  // fallback: pierwszy membership
  return { restaurant_id: mem[0].restaurant_id as string, supabase };
}
