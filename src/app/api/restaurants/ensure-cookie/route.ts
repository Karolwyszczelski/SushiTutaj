// src/app/api/restaurants/ensure-cookie/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";

const CK = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30, // 30 dni
};

function makeRes(body: any, code = 200) {
  return NextResponse.json(body, {
    status: code,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const url = new URL(req.url);
  const search = url.searchParams;

  // to może być ?restaurant=ciechanow, ?slug=..., ?citySlug=...
  const paramSlugRaw =
    search.get("restaurant") ||
    search.get("slug") ||
    search.get("citySlug") ||
    search.get("city") ||
    null;

  // WAŻNE: cookies() jest teraz asynchroniczne w route handlerach
  const cookieStore = await cookies();
  const cookieId = cookieStore.get("restaurant_id")?.value ?? null;
  const cookieSlug = cookieStore.get("restaurant_slug")?.value ?? null;

  let restaurantId: string | null = cookieId;
  let restaurantSlug: string | null =
    (paramSlugRaw || cookieSlug || null)?.toLowerCase() || null;

  try {
    // sesja – jeśli jesteśmy w panelu admina, będzie zalogowany user
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;

    // 1) Mamy slug z URL/cookie, ale nie mamy ID → pobierz restaurację po slugu
    if (restaurantSlug && !restaurantId) {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, slug")
        .eq("slug", restaurantSlug)
        .maybeSingle();

      if (error) {
        console.error("ensure-cookie restaurants by slug error:", error.message);
        return makeRes({ error: error.message }, 500);
      }
      if (!data) {
        return makeRes({ error: "RESTAURANT_NOT_FOUND" }, 404);
      }

      restaurantId = data.id;
      restaurantSlug = data.slug?.toLowerCase() ?? restaurantSlug;
    }

    // 2) Mamy ID, ale nie mamy slugu → dociągnij slug po ID
    if (restaurantId && !restaurantSlug) {
      const { data, error } = await supabase
        .from("restaurants")
        .select("slug")
        .eq("id", restaurantId)
        .maybeSingle();

      if (error) {
        console.error("ensure-cookie restaurants by id error:", error.message);
        return makeRes({ error: error.message }, 500);
      }

      restaurantSlug = data?.slug?.toLowerCase() ?? null;
    }

    // 3) Panel admina: brak informacji z URL/cookie → weź pierwszy lokal,
    // do którego user ma przypisanie w tabeli restaurant_admins
    if (!restaurantId && userId) {
      const { data: adminRow, error: adminError } = await supabase
        .from("restaurant_admins")
        .select("restaurant_id")
        .eq("user_id", userId)
        .order("added_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (adminError) {
        console.error(
          "ensure-cookie restaurant_admins error:",
          adminError.message
        );
        return makeRes({ error: adminError.message }, 500);
      }

      if (!adminRow) {
        // zalogowany, ale nie ma przypisanego lokalu
        return makeRes({ error: "NO_RESTAURANT_FOR_ADMIN" }, 404);
      }

      restaurantId = adminRow.restaurant_id;
    }

    // 4) Jeśli mamy ID (z kroku 3), a nadal nie mamy slugu → dociągnij slug
    if (restaurantId && !restaurantSlug) {
      const { data, error } = await supabase
        .from("restaurants")
        .select("slug")
        .eq("id", restaurantId)
        .maybeSingle();

      if (error) {
        console.error(
          "ensure-cookie restaurants by id (after admin) error:",
          error.message
        );
        return makeRes({ error: error.message }, 500);
      }

      restaurantSlug = data?.slug?.toLowerCase() ?? null;
    }

    // 5) Nadal nic sensownego → nie wiemy jaki lokal
    if (!restaurantId) {
      return makeRes({ error: "NO_RESTAURANT" }, 404);
    }

    // 6) Ustaw ciasteczka i zwróć id + slug
    const res = makeRes(
      {
        restaurant_id: restaurantId,
        restaurant_slug: restaurantSlug,
      },
      200
    );

    res.cookies.set("restaurant_id", restaurantId, CK);
    if (restaurantSlug) {
      res.cookies.set("restaurant_slug", restaurantSlug, CK);
    }

    return res;
  } catch (e: any) {
    console.error("ensure-cookie fatal error:", e);
    return makeRes(
      { error: e?.message || "UNEXPECTED_ENSURE_COOKIE_ERROR" },
      500
    );
  }
}
