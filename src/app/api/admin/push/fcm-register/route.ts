// src/app/api/admin/push/fcm-register/route.ts
// =============================================================================
// Rejestracja FCM tokena z natywnej aplikacji Expo
// Mobile app → POST { token, token_type, restaurant_slug, device_info }
// =============================================================================
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pushLogger } from "@/lib/logger";
import { getUserIdFromRequest } from "@/app/api/_auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, detectSessionInUrl: false } }
);

function makeRes(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  try {
    // 1) Autoryzacja — bearer token lub cookie-based session (obsługuje chunked cookies)
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      pushLogger.error("[fcm-register] Unauthorized — no valid session");
      return makeRes({ error: "Unauthorized" }, 401);
    }

    // 2) Parse body
    const body = await req.json().catch(() => null);
    if (!body) {
      return makeRes({ error: "Invalid body" }, 400);
    }

    const token = typeof body.token === "string" ? body.token.trim() : null;
    const tokenType: "expo" | "fcm" =
      body.token_type === "fcm" ? "fcm" : "expo";
    const restaurantSlug =
      typeof body.restaurant_slug === "string"
        ? body.restaurant_slug.toLowerCase().trim()
        : null;
    const deviceInfo =
      typeof body.device_info === "string"
        ? body.device_info.slice(0, 500)
        : null;

    if (!token || token.length < 10 || token.length > 4096) {
      return makeRes({ error: "Invalid token" }, 400);
    }

    if (!restaurantSlug) {
      return makeRes({ error: "Missing restaurant_slug" }, 400);
    }

    // 3) Znajdź restaurację po slug
    const { data: restaurant, error: restErr } = await supabaseAdmin
      .from("restaurants")
      .select("id, slug")
      .eq("slug", restaurantSlug)
      .maybeSingle();

    if (restErr || !restaurant) {
      pushLogger.error("[fcm-register] Restaurant not found", {
        slug: restaurantSlug,
        error: restErr?.message,
      });
      return makeRes({ error: "Restaurant not found" }, 404);
    }

    // 4) Sprawdź czy user jest adminem tej restauracji
    const { data: access } = await supabaseAdmin
      .from("restaurant_admins")
      .select("restaurant_id")
      .eq("user_id", userId)
      .eq("restaurant_id", restaurant.id)
      .limit(1);

    if (!access || access.length === 0) {
      pushLogger.error("[fcm-register] User not admin of restaurant", {
        userId,
        restaurantId: restaurant.id,
      });
      return makeRes({ error: "Forbidden" }, 403);
    }

    // 5) Upsert FCM token (on conflict on token kolumna)
    const { error: upsertErr } = await supabaseAdmin
      .from("admin_fcm_tokens")
      .upsert(
        {
          user_id: userId,
          restaurant_id: restaurant.id,
          restaurant_slug: restaurantSlug,
          token,
          token_type: tokenType,
          device_info: deviceInfo,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "token" }
      );

    if (upsertErr) {
      pushLogger.error("[fcm-register] Upsert failed", {
        error: upsertErr.message,
        code: upsertErr.code,
      });
      return makeRes({ error: "DB error" }, 500);
    }

    pushLogger.info("[fcm-register] Token registered", {
      tokenType,
      slug: restaurantSlug,
      tokenSuffix: token.slice(-20),
    });

    return makeRes({
      ok: true,
      restaurant_id: restaurant.id,
      restaurant_slug: restaurantSlug,
      token_type: tokenType,
    });
  } catch (e: any) {
    pushLogger.error("[fcm-register] unexpected error", {
      error: e?.message || e,
    });
    return makeRes({ error: "Internal error" }, 500);
  }
}

// DELETE — wyrejestrowanie tokena (np. logout)
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token.trim() : null;

    if (!token) {
      return makeRes({ error: "Missing token" }, 400);
    }

    const { error } = await supabaseAdmin
      .from("admin_fcm_tokens")
      .delete()
      .eq("token", token);

    if (error) {
      return makeRes({ error: "DB error" }, 500);
    }

    return makeRes({ ok: true, deleted: true });
  } catch (e: any) {
    return makeRes({ error: "Internal error" }, 500);
  }
}
