// src/app/api/admin/push/delivery-ack/route.ts
// =============================================================================
// Potwierdzenie dostarczenia powiadomienia z urządzenia
//
// Mobile app → POST { token, notification_id, timestamp, sound_played }
//
// DLACZEGO TO WAŻNE:
// Serwer loguje "sent" gdy FCM/Expo API zwróci 200 OK.
// Ale "sent" ≠ "delivered" — Google potwierdza PRZYJĘCIE wiadomości,
// NIE dostarczenie na urządzenie. Między "sent" a faktycznym pokazaniem
// powiadomienia z dźwiękiem jest wiele punktów awarii:
//   - Android Doze mode opóźnia wiadomości (nawet HIGH priority na niektórych OEM)
//   - OEM battery optimization zabija proces apki
//   - Kanał powiadomień bez dźwięku (immutability bug)
//   - android.notification w FCM → System Handler przejmuje kontrolę
//   - Brak _displayInForeground → expo traktuje jako cichą data-only
//
// Ten endpoint pozwala urządzeniu potwierdzić: "TAK, dostałem powiadomienie,
// TAK, dźwięk zagrał". Dzięki temu w delivery_log widać PRAWDZIWY status
// zamiast iluzorycznego "sent".
// =============================================================================
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    const body = await req.json().catch(() => null);
    if (!body) return makeRes({ error: "Invalid body" }, 400);

    const token = typeof body.token === "string" ? body.token.trim() : null;
    const notificationId = typeof body.notification_id === "string" ? body.notification_id : null;
    const receivedAt = typeof body.received_at === "number" ? body.received_at : Date.now();
    const appState = typeof body.app_state === "string" ? body.app_state : "unknown";

    if (!token) return makeRes({ error: "Missing token" }, 400);

    // Znajdź restaurant_id po tokenie FCM
    const { data: tokenRow } = await supabaseAdmin
      .from("admin_fcm_tokens")
      .select("restaurant_id, restaurant_slug")
      .eq("token", token)
      .maybeSingle();

    if (!tokenRow) {
      // Token nie znaleziony — urządzenie się jeszcze nie zarejestrowało
      return makeRes({ ok: true, warning: "token_not_found" });
    }

    // Zapisz ACK w delivery_log
    const { error: logErr } = await supabaseAdmin
      .from("notification_delivery_log")
      .insert({
        restaurant_id: tokenRow.restaurant_id,
        channel: "fcm_ack",
        status: "delivered",
        target_token_suffix: token.slice(-20),
        payload_title: notificationId || "ack",
        payload_type: "delivery_ack",
        error_code: null,
        error_message: JSON.stringify({
          app_state: appState,
          received_at: receivedAt,
          ack_at: Date.now(),
          latency_ms: Date.now() - receivedAt,
        }).slice(0, 500),
      });

    if (logErr) {
      console.error("[delivery-ack] log error:", logErr.message);
    }

    return makeRes({ ok: true });
  } catch (e: any) {
    console.error("[delivery-ack] error:", e?.message || e);
    return makeRes({ error: "Internal error" }, 500);
  }
}
