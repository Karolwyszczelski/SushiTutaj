// src/app/api/restaurants/ensure-cookie/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";

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

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const url = new URL(req.url);
  const search = url.searchParams;

  const paramSlugRaw =
    search.get("restaurant") ||
    search.get("slug") ||
    search.get("citySlug") ||
    search.get("city") ||
    null;

  const cookieStore = await cookies();
  const cookieId = cookieStore.get("restaurant_id")?.value ?? null;
  const cookieSlug = cookieStore.get("restaurant_slug")?.value ?? null;

  // kandydaci (z URL/cookies)
  const desiredSlug = (paramSlugRaw || cookieSlug || null)?.toLowerCase() || null;
  let restaurantId: string | null = cookieId;
  let restaurantSlug: string | null = desiredSlug;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const userId = session?.user?.id ?? null;

    // Helper: czy admin ma przypisaną restaurację o danym ID?
    async function adminHasRestaurant(id: string) {
      const { data, error } = await supabase
        .from("restaurant_admins")
        .select("restaurant_id")
        .eq("user_id", userId!)
        .eq("restaurant_id", id)
        .maybeSingle<{ restaurant_id: string }>();

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
        const { data: bySlug, error: bySlugError } = await supabase
          .from("restaurants")
          .select("id, slug")
          .eq("slug", restaurantSlug)
          .maybeSingle<RestaurantBySlugRow>();

        if (bySlugError) {
          console.error("ensure-cookie restaurants by slug error:", bySlugError.message);
          return makeRes({ error: bySlugError.message }, 500);
        }

        if (bySlug?.id) {
          const check = await adminHasRestaurant(bySlug.id);
          if (check.ok) {
            restaurantId = bySlug.id;
            restaurantSlug = bySlug.slug?.toLowerCase() ?? restaurantSlug;
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
      if (!restaurantId) {
        const { data: adminRow, error: adminError } = await supabase
          .from("restaurant_admins")
          .select("restaurant_id")
          .eq("user_id", userId)
          .order("added_at", { ascending: true })
          .limit(1)
          .maybeSingle<{ restaurant_id: string }>();

        if (adminError) {
          console.error("ensure-cookie restaurant_admins error:", adminError.message);
          return makeRes({ error: adminError.message }, 500);
        }

        if (!adminRow) {
          return makeRes({ error: "NO_RESTAURANT_FOR_ADMIN" }, 404);
        }

        restaurantId = adminRow.restaurant_id;
      }
    }

    // 1) Public (brak userId): mamy slug, brak ID → pobierz po slugu
    if (!userId && restaurantSlug && !restaurantId) {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, slug")
        .eq("slug", restaurantSlug)
        .maybeSingle<RestaurantBySlugRow>();

      if (error) {
        console.error("ensure-cookie restaurants by slug error:", error.message);
        return makeRes({ error: error.message }, 500);
      }
      if (!data) return makeRes({ error: "RESTAURANT_NOT_FOUND" }, 404);

      restaurantId = data.id;
      restaurantSlug = data.slug?.toLowerCase() ?? restaurantSlug;
    }

    // 2) Mamy ID, ale nie mamy slugu → dociągnij slug po ID (wspólne dla admin/public)
    if (restaurantId && !restaurantSlug) {
      const { data, error } = await supabase
        .from("restaurants")
        .select("slug")
        .eq("id", restaurantId)
        .maybeSingle<RestaurantSlugRow>();

      if (error) {
        console.error("ensure-cookie restaurants by id error:", error.message);
        return makeRes({ error: error.message }, 500);
      }
      restaurantSlug = data?.slug?.toLowerCase() ?? null;
    }

    // 3) Nadal nie ma ID → nie wiemy jaki lokal
    if (!restaurantId) {
      return makeRes({ error: "NO_RESTAURANT" }, 404);
    }

    // 4) Ustaw cookies + zwróć
    const res = makeRes(
      {
        restaurant_id: restaurantId,
        restaurant_slug: restaurantSlug,
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
    console.error("ensure-cookie fatal error:", e);
    return makeRes({ error: e?.message || "UNEXPECTED_ENSURE_COOKIE_ERROR" }, 500);
  }
}
