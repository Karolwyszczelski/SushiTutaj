// src/lib/adminContext.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

function normalizeUuid(v?: string | null) {
  if (!v) return null;
  const x = String(v).replace(/[<>\s'"]/g, "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    x
  )
    ? x
    : null;
}

export async function getAdminContext() {
  // Next 15: cookies() jest asynchroniczne
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
          } catch {
            // w RSC nie zawsze da się ustawiać cookies — ignorujemy
          }
        },
      },
    }
  );

  // Stabilniej niż getUser() przy odświeżaniu sesji
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const user = session?.user ?? null;
  if (!user) throw new Error("Unauthorized");

  const cookieRid = normalizeUuid(cookieStore.get("restaurant_id")?.value ?? null);

  // UWAGA: jeśli typy Database nie mają restaurant_admins, TS będzie krzyczał.
  // Tymczasowo: any tylko dla tej tabeli.
  const sbAny = supabase as any;

  async function hasAccessToRestaurant(userId: string, restaurantId: string) {
    const { data, error } = await sbAny
      .from("restaurant_admins")
      .select("restaurant_id")
      .eq("user_id", userId)
      .eq("restaurant_id", restaurantId)
      .limit(1);

    if (error) return { ok: false, error };
    return { ok: (data?.length ?? 0) > 0, error: null as any };
  }

  async function firstAssignedRestaurantId(userId: string) {
    const { data, error } = await sbAny
      .from("restaurant_admins")
      .select("restaurant_id, added_at")
      .eq("user_id", userId)
      .order("added_at", { ascending: true })
      .limit(1);

    if (error) return { rid: null as string | null, error };
    const x = (data?.[0]?.restaurant_id as string | null) ?? null;
    return { rid: normalizeUuid(x), error: null as any };
  }

  let restaurantId: string | null = null;

  // 1) preferuj restaurant_id z cookie, ale TYLKO jeśli user ma do niego dostęp
  if (cookieRid) {
    const check = await hasAccessToRestaurant(user.id, cookieRid);
    if (check.error) throw new Error(check.error.message);
    if (check.ok) restaurantId = cookieRid;
  }

  // 2) fallback: pierwszy przypisany lokal
  if (!restaurantId) {
    const first = await firstAssignedRestaurantId(user.id);
    if (first.error) throw new Error(first.error.message);
    if (!first.rid) throw new Error("No restaurant access");
    restaurantId = first.rid;
  }

  // (opcjonalnie) samouzdrawianie cookie — w RSC może się nie udać i to OK
  try {
    cookieStore.set("restaurant_id", restaurantId, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
    });
  } catch {}

  return {
    supabase,
    user,
    restaurantId,
  };
}
