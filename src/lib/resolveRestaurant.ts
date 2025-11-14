// SSR/Route Handlers: rozwiąż restaurant_id z ?restaurant=slug lub z membership
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function resolveRestaurantId(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" as const };

  const url = new URL(req.url);
  const wantSlug = url.searchParams.get("restaurant")?.toLowerCase() || null;

  // membershipy użytkownika (RLS safe, anon+session)
  const { data: mem, error: mErr } = await supabase
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
