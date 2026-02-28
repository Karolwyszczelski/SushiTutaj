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
    //    KRYTYCZNE: Resetujemy failure_count na 0 przy każdej rejestracji!
    //    Heartbeat co 5 min z tabletu resetuje counter →
    //    nawet jeśli token miał chwilowy UNREGISTERED, apka żyje.
    //
    //    WAŻNE: ignoreDuplicates: false gwarantuje że przy konflikcie
    //    wszystkie pola (włącznie z updated_at) zostaną zaktualizowane!
    //    Bez tego Supabase może pominąć update jeśli row już istnieje.
    //
    //    FALLBACK: Jeśli kolumny failure_count/last_failure_at/last_failure_reason
    //    nie istnieją (migracja 20260225000000 nie została zastosowana),
    //    ponawiamy upsert bez tych kolumn — token MUSI być zapisany!
    const baseData = {
      user_id: userId,
      restaurant_id: restaurant.id,
      restaurant_slug: restaurantSlug,
      token,
      token_type: tokenType,
      device_info: deviceInfo,
      updated_at: new Date().toISOString(),
    };

    let { error: upsertErr } = await supabaseAdmin
      .from("admin_fcm_tokens")
      .upsert(
        {
          ...baseData,
          failure_count: 0,
          last_failure_at: null,
          last_failure_reason: null,
        },
        { onConflict: "token", ignoreDuplicates: false }
      );

    // Fallback: jeśli upsert nie powiódł się (np. brak kolumn failure_count),
    // ponów bez kolumn failure tracking — rejestracja tokena jest ważniejsza!
    if (upsertErr) {
      pushLogger.warn("[fcm-register] Upsert with failure tracking failed, retrying without", {
        error: upsertErr.message,
        code: upsertErr.code,
      });

      const { error: retryErr } = await supabaseAdmin
        .from("admin_fcm_tokens")
        .upsert(baseData, { onConflict: "token", ignoreDuplicates: false });

      upsertErr = retryErr;
    }

    if (upsertErr) {
      pushLogger.error("[fcm-register] Upsert failed", {
        error: upsertErr.message,
        code: upsertErr.code,
        slug: restaurantSlug,
        userId,
      });
      return makeRes({ error: "DB error", detail: upsertErr.message, code: upsertErr.code }, 500);
    }

    // 5b) Sprawdź czy token był już w bazie (create vs update)
    //     Pomaga debugować czy heartbeat działa prawidłowo
    const { data: tokenCheck } = await supabaseAdmin
      .from("admin_fcm_tokens")
      .select("id, created_at, updated_at")
      .eq("token", token)
      .maybeSingle();

    const isNewToken = tokenCheck && 
      new Date(tokenCheck.created_at).getTime() > Date.now() - 5000; // created < 5s ago
    
    pushLogger.info("[fcm-register] Token " + (isNewToken ? "CREATED" : "UPDATED"), {
      tokenType,
      slug: restaurantSlug,
      tokenSuffix: token.slice(-20),
      isNew: isNewToken,
      updatedAt: tokenCheck?.updated_at,
    });

    // 6) Loguj informację o web push subskrypcjach (diagnostyka)
    //    Czyszczenie web push na serwerze NIE robimy automatycznie,
    //    bo restauracja może mieć desktop + tablet.
    //    Zamiast tego natywna apka (App.tsx) aktywnie wyrejestrowuje
    //    SW + push subscription w WebView → stara subskrypcja wygasa
    //    → serwer dostanie 410 Gone → push.ts usunie ją automatycznie.
    try {
      const { count } = await supabaseAdmin
        .from("admin_push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurant.id);

      if (count && count > 0) {
        pushLogger.info(
          `[fcm-register] ℹ️ Restaurant ${restaurantSlug} ma ${count} web push subskrypcji ` +
          `+ nowy FCM token. WebView w natywnej apce wyrejestruje stare SW automatycznie.`
        );
      }
    } catch {
      // Non-critical diagnostics
    }

    return makeRes({
      ok: true,
      restaurant_id: restaurant.id,
      restaurant_slug: restaurantSlug,
      token_type: tokenType,
      web_push_cleaned: true,
    });
  } catch (e: any) {
    pushLogger.error("[fcm-register] unexpected error", {
      error: e?.message || e,
    });
    return makeRes({ error: "Internal error" }, 500);
  }
}

// DELETE — wyrejestrowanie tokena (np. logout)
// Wymaga autoryzacji — zapobiega przypadkowemu/złośliwemu usuwaniu tokenów
export async function DELETE(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return makeRes({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token.trim() : null;

    if (!token) {
      return makeRes({ error: "Missing token" }, 400);
    }

    // Usuń tylko tokeny należące do tego użytkownika
    const { error } = await supabaseAdmin
      .from("admin_fcm_tokens")
      .delete()
      .eq("token", token)
      .eq("user_id", userId);

    if (error) {
      return makeRes({ error: "DB error" }, 500);
    }

    return makeRes({ ok: true, deleted: true });
  } catch (e: any) {
    return makeRes({ error: "Internal error" }, 500);
  }
}
