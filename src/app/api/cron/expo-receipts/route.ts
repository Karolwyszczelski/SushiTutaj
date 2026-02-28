// src/app/api/cron/expo-receipts/route.ts
// =============================================================================
// Cron Job: Sprawdzanie Expo Push Receipts
// 
// Expo Push API wymaga odpytywania ticketów po 15-30 minutach żeby dowiedzieć
// się czy powiadomienie naprawdę dotarło. Bez tego martwe tokeny Expo
// (DeviceNotRegistered) nigdy nie są wykrywane i zostają w bazie na zawsze.
//
// Vercel Cron: uruchamiaj co 30 minut
// vercel.json → { "crons": [{ "path": "/api/cron/expo-receipts", "schedule": "*/30 * * * *" }] }
// =============================================================================
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // max 30s na Vercel

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Ochrona endpointu — Vercel CRON_SECRET lub brak w dev
const CRON_SECRET = process.env.CRON_SECRET;

// Ile kolejnych failures żeby usunąć token
const FAILURE_THRESHOLD = 3;

export async function GET(req: Request) {
  // Weryfikacja — tylko Vercel Cron lub dev
  if (CRON_SECRET) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // 1) Pobierz pending tickety starsze niż 15 minut (Expo wymaga czekania)
    //    Limit 300 żeby zmieścić się w limicie Vercel (30s)
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data: pendingReceipts, error: fetchErr } = await supabaseAdmin
      .from("expo_push_receipts")
      .select("id, ticket_id, expo_token, restaurant_id")
      .eq("status", "pending")
      .lt("created_at", fifteenMinAgo)
      .order("created_at", { ascending: true })
      .limit(300);

    if (fetchErr) {
      console.error("[expo-receipts] DB fetch error:", fetchErr.message);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    if (!pendingReceipts || pendingReceipts.length === 0) {
      return NextResponse.json({ ok: true, checked: 0, message: "No pending receipts" });
    }

    console.log(`[expo-receipts] Sprawdzam ${pendingReceipts.length} ticketów...`);

    // 2) Expo Push Receipt API — batch do 1000 ticket IDs
    const ticketIds = pendingReceipts.map((r) => r.ticket_id);

    const receiptRes = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ids: ticketIds }),
    });

    if (!receiptRes.ok) {
      console.error("[expo-receipts] Expo API error:", receiptRes.status);
      return NextResponse.json(
        { error: `Expo API ${receiptRes.status}` },
        { status: 502 }
      );
    }

    const receiptData = await receiptRes.json();
    const receipts = receiptData?.data || {};

    // 3) Przetwórz wyniki
    const deadTokens: string[] = []; // Expo tokeny do inkrementowania failure_count
    const okReceiptIds: string[] = [];
    const errorReceiptUpdates: { id: string; errorCode: string; errorMessage: string }[] = [];
    const notReadyIds: string[] = []; // Tickety jeszcze niedostępne (Expo jeszcze przetwarza)

    for (const receipt of pendingReceipts) {
      const result = receipts[receipt.ticket_id];

      if (!result) {
        // Receipt jeszcze niedostępny — Expo jeszcze przetwarza
        // Zostaw jako pending, sprawdzimy następnym razem
        notReadyIds.push(receipt.id);
        continue;
      }

      if (result.status === "ok") {
        okReceiptIds.push(receipt.id);
      } else if (result.status === "error") {
        const errCode = result.details?.error || "UNKNOWN";
        const errMsg = result.message || "";

        errorReceiptUpdates.push({
          id: receipt.id,
          errorCode: errCode,
          errorMessage: errMsg.slice(0, 200),
        });

        // DeviceNotRegistered = token martwy
        if (errCode === "DeviceNotRegistered") {
          deadTokens.push(receipt.expo_token);
        }

        console.warn(
          "[expo-receipts] ❌ Receipt error:",
          errCode,
          receipt.expo_token.slice(0, 30),
          errMsg.slice(0, 100)
        );
      }
    }

    // 4) Batch DB updates
    const dbOps: PromiseLike<any>[] = [];

    // Oznacz OK receipty
    if (okReceiptIds.length > 0) {
      dbOps.push(
        supabaseAdmin
          .from("expo_push_receipts")
          .update({ status: "ok", checked_at: new Date().toISOString() })
          .in("id", okReceiptIds)
      );
    }

    // Oznacz error receipty
    for (const upd of errorReceiptUpdates) {
      dbOps.push(
        supabaseAdmin
          .from("expo_push_receipts")
          .update({
            status: "error",
            error_code: upd.errorCode,
            error_message: upd.errorMessage,
            checked_at: new Date().toISOString(),
          })
          .eq("id", upd.id)
      );
    }

    // 5) Inkrementuj failure_count dla dead tokenów (DeviceNotRegistered)
    //    Używamy tego samego FAILURE_THRESHOLD co FCM
    if (deadTokens.length > 0) {
      const uniqueDeadTokens = [...new Set(deadTokens)];

      for (const token of uniqueDeadTokens) {
        // Pobierz aktualny failure_count I updated_at
        // FALLBACK: Jeśli failure_count nie istnieje (brak migracji), używamy id + updated_at
        const { data: selData, error: selErr } = await supabaseAdmin
          .from("admin_fcm_tokens")
          .select("id, failure_count, updated_at")
          .eq("token", token)
          .maybeSingle();

        let tokenRow: { id: string; failure_count?: number; updated_at: string } | null = selData;

        if (selErr && (selErr.code === "42703" || selErr.message?.includes("does not exist"))) {
          const { data: fallbackData } = await supabaseAdmin
            .from("admin_fcm_tokens")
            .select("id, updated_at")
            .eq("token", token)
            .maybeSingle();
          tokenRow = fallbackData ? { ...fallbackData, failure_count: 0 } : null;
        }

        if (tokenRow) {
          const newCount = (tokenRow.failure_count || 0) + 1;

          // =====================================================================
          // KRYTYCZNA OCHRONA: taka sama jak w fcm.ts
          // NIE usuwaj tokenów które były aktywne w ciągu ostatnich 15 minut!
          // Apka robi heartbeat co 5 min → jeśli updated_at świeże, tablet żyje.
          // =====================================================================
          const tokenAge = Date.now() - new Date(tokenRow.updated_at).getTime();
          const isRecentlyActive = tokenAge < 15 * 60 * 1000; // 15 minut

          if (newCount >= FAILURE_THRESHOLD && !isRecentlyActive) {
            // Przekroczony próg I token nieaktywny → naprawdę martwy, usuń
            dbOps.push(
              supabaseAdmin
                .from("admin_fcm_tokens")
                .delete()
                .eq("id", tokenRow.id)
                .then(({ error: e }) => {
                  if (!e) {
                    console.log(
                      `[expo-receipts] 🗑️ Usunięto martwy Expo token po ${newCount} failures (ostatnia aktywność ${Math.floor(tokenAge/60000)}min temu):`,
                      token.slice(0, 30)
                    );
                  }
                })
            );
          } else if (newCount >= FAILURE_THRESHOLD && isRecentlyActive) {
            // Przekroczony próg ALE token aktywny → OCHRONA!
            dbOps.push(
              supabaseAdmin
                .from("admin_fcm_tokens")
                .update({
                  failure_count: newCount,
                  last_failure_at: new Date().toISOString(),
                  last_failure_reason: "DeviceNotRegistered (receipt)",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", tokenRow.id)
                .then(({ error: e }) => {
                  if (!e) {
                    console.warn(
                      `[expo-receipts] 🛡️ OCHRONA: Expo token ma ${newCount} failures ALE był aktywny ${Math.floor(tokenAge/60000)}min temu — NIE usuwam!`,
                      token.slice(0, 30)
                    );
                  }
                })
            );
          } else {
            // Inkrementuj
            dbOps.push(
              supabaseAdmin
                .from("admin_fcm_tokens")
                .update({
                  failure_count: newCount,
                  last_failure_at: new Date().toISOString(),
                  last_failure_reason: "DeviceNotRegistered (receipt)",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", tokenRow.id)
                .then(({ error: e }) => {
                  if (!e) {
                    console.warn(
                      `[expo-receipts] ⚠️ Expo token failure ${newCount}/${FAILURE_THRESHOLD}:`,
                      token.slice(0, 30)
                    );
                  }
                })
            );
          }
        }
      }
    }

    await Promise.allSettled(dbOps);

    // 6) Wyczyść stare dane żeby tabele nie rosły w nieskończoność
    //    (pg_cron w Supabase jest zakomentowany → Vercel cron robi cleanup)
    const cleanupOps: PromiseLike<any>[] = [
      // Expo receipts sprawdzone > 48h
      supabaseAdmin
        .from("expo_push_receipts")
        .delete()
        .neq("status", "pending")
        .lt("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()),
      // Klucze idempotentności > 24h (już niepotrzebne)
      supabaseAdmin
        .from("notification_idempotency")
        .delete()
        .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      // Logi dostarczenia > 30 dni
      supabaseAdmin
        .from("notification_delivery_log")
        .delete()
        .lt("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ];
    await Promise.allSettled(cleanupOps);

    const summary = {
      ok: true,
      checked: pendingReceipts.length,
      results: {
        ok: okReceiptIds.length,
        error: errorReceiptUpdates.length,
        notReady: notReadyIds.length,
        deadTokens: deadTokens.length,
      },
    };

    console.log("[expo-receipts] ✅ Done:", JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (err: any) {
    console.error("[expo-receipts] Unexpected error:", err?.message || err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
