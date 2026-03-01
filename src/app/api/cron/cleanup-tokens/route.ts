// src/app/api/cron/cleanup-tokens/route.ts
// =============================================================================
// CRON: Usuwanie naprawdę martwych FCM tokenów
// Uruchamiany raz dziennie — jedyny sposób na usunięcie tokenów z bazy!
//
// Token jest uznany za martwy TYLKO gdy:
// 1. updated_at > 30 dni temu (brak heartbeatu z tabletu od 30 dni)
// 2. failure_count >= SOFT_DISABLE_THRESHOLD (wiele błędów UNREGISTERED)
//
// Jeśli tablet żyje, heartbeat co 5 min resetuje updated_at + failure_count.
// Więc ten cron NIGDY nie usunie aktywnego tokena.
// =============================================================================
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Tokeny starsze niż 30 dni BEZ heartbeatu = naprawdę martwe
const STALE_DAYS = 30;

// Tylko tokeny z wysokim failure_count są kandydatami do usunięcia
// (aktywny token z failure_count=0 i starym updated_at = tablet offline ale token może wciąż działać)
const MIN_FAILURE_COUNT_FOR_CLEANUP = 10;

export async function GET(req: NextRequest) {
  // Weryfikacja że to Vercel Cron (nie random request)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - STALE_DAYS);
    const cutoffISO = cutoffDate.toISOString();

    // Znajdź tokeny które:
    // 1. Nie miały heartbeatu od > 30 dni
    // 2. Mają failure_count >= 10 (potwierdzenie że token nie działa)
    const { data: staleTokens, error: selectErr } = await supabaseAdmin
      .from("admin_fcm_tokens")
      .select("id, token, restaurant_id, failure_count, updated_at")
      .lt("updated_at", cutoffISO)
      .gte("failure_count", MIN_FAILURE_COUNT_FOR_CLEANUP)
      .limit(500);

    if (selectErr) {
      console.error("[cleanup-tokens] select error:", selectErr.message);
      return NextResponse.json({ error: selectErr.message }, { status: 500 });
    }

    if (!staleTokens || staleTokens.length === 0) {
      console.log("[cleanup-tokens] ✅ Brak martwych tokenów do usunięcia");
      return NextResponse.json({ deleted: 0 });
    }

    const ids = staleTokens.map((t) => t.id);
    console.log(
      `[cleanup-tokens] 🗑️ Usuwam ${ids.length} martwych tokenów:`,
      staleTokens.map((t) => ({
        suffix: t.token.slice(-20),
        restaurant: t.restaurant_id,
        failures: t.failure_count,
        lastHeartbeat: t.updated_at,
      }))
    );

    const { error: deleteErr } = await supabaseAdmin
      .from("admin_fcm_tokens")
      .delete()
      .in("id", ids);

    if (deleteErr) {
      console.error("[cleanup-tokens] delete error:", deleteErr.message);
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    console.log(`[cleanup-tokens] ✅ Usunięto ${ids.length} martwych tokenów`);
    return NextResponse.json({ deleted: ids.length });
  } catch (e: any) {
    console.error("[cleanup-tokens] unexpected error:", e?.message || e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
