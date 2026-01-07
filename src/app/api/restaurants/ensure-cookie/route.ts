// src/app/api/restaurants/ensure-cookie/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

// Service role client - omija RLS
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, detectSessionInUrl: false } }
);

const CK_BASE = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30, // 30 dni
};

// ID tylko dla serwera
const CK_ID = {
  ...CK_BASE,
  httpOnly: true,
};

// Slug może czytać UI (np. admin sidebar)
const CK_SLUG = {
  ...CK_BASE,
  httpOnly: false,
};

function makeRes(body: any, code = 200) {
  return NextResponse.json(body, {
    status: code,
    headers: { "Cache-Control": "no-store" },
  });
}

type RestaurantBySlugRow = { id: string; slug: string | null };
type RestaurantSlugRow = { slug: string | null };

function inferSlugFromReferer(req: Request): string | null {
  const ref = req.headers.get("referer");
  if (!ref) return null;

  try {
    const u = new URL(ref);
    const seg = (u.pathname || "/").split("/").filter(Boolean)[0] || null;
    return seg ? seg.toLowerCase() : null;
  } catch {
    return null;
  }
}


export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const search = url.searchParams;

  const paramSlugRaw =
    search.get("restaurant") ||
    search.get("slug") ||
    search.get("citySlug") ||
    search.get("city") ||
    null;

  const cookieId = cookieStore.get("restaurant_id")?.value ?? null;
  const cookieSlug = cookieStore.get("restaurant_slug")?.value ?? null;

  // kandydaci (z URL/cookies)
    const refererSlug = inferSlugFromReferer(req);
  const desiredSlug =
    (paramSlugRaw || cookieSlug || refererSlug || null)?.toLowerCase() || null;

  let restaurantId: string | null = cookieId;
  let restaurantSlug: string | null = desiredSlug;

  try {
    // Używamy getUser() zamiast getSession() - bardziej niezawodne
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const userId = user?.id ?? null;

    // Helper: czy admin ma przypisaną restaurację o danym ID?
    // WAŻNE: używamy supabaseAdmin (service role) żeby ominąć RLS
    async function adminHasRestaurant(id: string) {
      const { data, error } = await supabaseAdmin
        .from("restaurant_admins")
        .select("restaurant_id")
        .eq("user_id", userId!)
        .eq("restaurant_id", id)
        .maybeSingle();

      if (error) return { ok: false, error };
      return { ok: !!data, error: null as any };
    }

    // 0) Jeśli zalogowany admin, nie pozwalamy aby stary slug/cookie podmienił restaurację
    if (userId) {
      // 0a) mamy cookieId → waliduj przypisanie
      if (restaurantId) {
        const check = await adminHasRestaurant(restaurantId);
        if (!check.ok) {
          restaurantId = null;
          restaurantSlug = null; // nie ufamy też slugowi, bo mógł wskazywać inny lokal
        }
      }

      // 0b) brak ID, ale jest slug → zamień slug na ID i waliduj przypisanie
      if (!restaurantId && restaurantSlug) {
        const { data: bySlug, error: bySlugError } = await supabaseAdmin
          .from("restaurants")
          .select("id, slug")
          .eq("slug", restaurantSlug)
          .maybeSingle();

        if (bySlugError) {
          apiLogger.error("ensure-cookie restaurants by slug error", { error: bySlugError.message });
          return makeRes({ error: bySlugError.message }, 500);
        }

        if (bySlug?.id) {
          const check = await adminHasRestaurant(bySlug.id);
          if (check.ok) {
            restaurantId = bySlug.id;
            restaurantSlug = (bySlug.slug as string)?.toLowerCase() ?? restaurantSlug;
          } else {
            // slug wskazuje restaurację, do której admin nie ma dostępu → fallback na pierwszą przypisaną
            restaurantId = null;
            restaurantSlug = null;
          }
        } else {
          // slug nie istnieje → fallback na pierwszą przypisaną
          restaurantId = null;
          restaurantSlug = null;
        }
      }

      // 0c) jeśli nadal brak ID → bierz pierwszy przypisany lokal admina
      // WAŻNE: używamy supabaseAdmin (service role) żeby ominąć RLS
      if (!restaurantId) {
        const { data: adminRow, error: adminError } = await supabaseAdmin
          .from("restaurant_admins")
          .select("restaurant_id")
          .eq("user_id", userId)
          .order("added_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (adminError) {
          apiLogger.error("ensure-cookie restaurant_admins error", { error: adminError.message });
          return makeRes({ error: adminError.message }, 500);
        }

        if (!adminRow) {
          return makeRes({ error: "NO_RESTAURANT_FOR_ADMIN" }, 404);
        }

        restaurantId = adminRow.restaurant_id as string;
      }
    }

    // 1) Public (brak userId): mamy slug, brak ID → pobierz po slugu
    if (!userId && restaurantSlug && !restaurantId) {
      const { data, error } = await supabaseAdmin
        .from("restaurants")
        .select("id, slug")
        .eq("slug", restaurantSlug)
        .maybeSingle();

      if (error) {
        apiLogger.error("ensure-cookie restaurants by slug error", { error: error.message });
        return makeRes({ error: error.message }, 500);
      }
      if (!data) return makeRes({ error: "RESTAURANT_NOT_FOUND" }, 404);

      restaurantId = data.id;
      restaurantSlug = (data.slug as string)?.toLowerCase() ?? restaurantSlug;
    }

       // 2) Mamy ID, ale nie mamy slugu → dociągnij slug po ID (wspólne dla admin/public)
    if (restaurantId && !restaurantSlug) {
      const { data, error } = await supabaseAdmin
        .from("restaurants")
        .select("slug")
        .eq("id", restaurantId)
        .maybeSingle();

      if (error) {
        apiLogger.error("ensure-cookie restaurants by id error", { error: error.message });
        return makeRes({ error: error.message }, 500);
      }

      // jeśli cookieId wskazuje nieistniejącą restaurację → traktuj jak brak kontekstu
      if (!data) {
        restaurantId = null;
        restaurantSlug = null;
      } else {
        restaurantSlug = (data.slug as string)?.toLowerCase() ?? null;
      }
    }

    // 3) Nadal nie ma ID → public: nie spamuj 404 (np. homepage "/"), admin: 404 zostaje
    if (!restaurantId) {
      if (userId) {
        return makeRes({ error: "NO_RESTAURANT" }, 404);
      }

      // public bez kontekstu – zwróć 200 i (opcjonalnie) wyczyść stare cookies
      const res = makeRes(
        { ok: false, restaurant_id: null, restaurant_slug: null, role: null },
        200
      );

      if (cookieId) res.cookies.set("restaurant_id", "", { ...CK_ID, maxAge: 0 });
      if (cookieSlug) res.cookies.set("restaurant_slug", "", { ...CK_SLUG, maxAge: 0 });

      return res;
    }

    // Pobierz rolę admina dla tej restauracji
    let adminRole: string | null = null;
    if (userId && restaurantId) {
      const { data: roleData } = await supabaseAdmin
        .from("restaurant_admins")
        .select("role")
        .eq("user_id", userId)
        .eq("restaurant_id", restaurantId)
        .limit(1)
        .maybeSingle();
      
      adminRole = (roleData?.role as string) ?? null;
    }

    // 4) Ustaw cookies + zwróć
    const res = makeRes(
      {
        restaurant_id: restaurantId,
        restaurant_slug: restaurantSlug,
        role: adminRole,
      },
      200
    );

    res.cookies.set("restaurant_id", restaurantId, CK_ID);

    if (restaurantSlug) {
      res.cookies.set("restaurant_slug", restaurantSlug, CK_SLUG);
    } else {
      // czyść, żeby nie wisiał stary slug
      res.cookies.delete("restaurant_slug");
    }

    return res;
  } catch (e: any) {
    apiLogger.error("ensure-cookie fatal error", { error: e?.message || e });
    return makeRes({ error: e?.message || "UNEXPECTED_ENSURE_COOKIE_ERROR" }, 500);
  }
}
