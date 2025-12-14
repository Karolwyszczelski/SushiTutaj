// src/lib/push.ts
import "server-only";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT =
  process.env.NEXT_PUBLIC_VAPID_SUBJECT ||
  process.env.VAPID_SUBJECT ||
  "mailto:admin@example.com";

if (!SUPABASE_URL) throw new Error("[push] Brak NEXT_PUBLIC_SUPABASE_URL");
if (!SERVICE_KEY) throw new Error("[push] Brak SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.warn("[push] Brak kluczy VAPID – web push będzie pomijany");
}

export type PushPayload = {
  type?: string;
  title?: string;
  body?: string;
  url?: string;
};

type AdminPushSubscriptionRow = {
  id: string;
  endpoint: string | null;
  subscription: any; // TEXT(JSON) albo JSONB
};

const short = (s?: string | null, n = 80) =>
  !s ? "" : s.length > n ? s.slice(0, n) + "…" : s;

export async function sendPushForRestaurant(
  restaurantId: string,
  payload: PushPayload
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const { data, error } = await supabaseAdmin
    .from("admin_push_subscriptions")
    .select("id, endpoint, subscription")
    .eq("restaurant_id", restaurantId);

  if (error) {
    console.error("[push] błąd pobierania subskrypcji:", error.message);
    return;
  }

  const subs = (data as AdminPushSubscriptionRow[]) || [];
  if (!subs.length) return;

  const basePayload = {
    type: payload.type ?? "order",
    title: payload.title ?? "Nowe zamówienie",
    body:
      payload.body ??
      payload.title ??
      "Pojawiło się nowe zdarzenie w systemie.",
    url: payload.url ?? "/admin/pickup-order",
  };

  const payloadJson = JSON.stringify(basePayload);

  // zbierz martwe ID i usuń je hurtem po wysyłce
  const deadIds: string[] = [];

  await Promise.all(
    subs.map(async (row) => {
      try {
        let sub: any = row.subscription;

        if (typeof sub === "string") {
          try {
            sub = JSON.parse(sub);
          } catch {
            console.warn("[push] niepoprawny JSON subscription, id:", row.id);
            deadIds.push(row.id);
            return;
          }
        }

        if (!sub?.endpoint) {
          deadIds.push(row.id);
          return;
        }

        await webpush.sendNotification(sub, payloadJson);
        console.log("[push] sent ->", short(sub.endpoint));
      } catch (err: any) {
        const status = Number(
          err?.statusCode ?? err?.status ?? err?.status_code ?? NaN
        );

        // 404/410 = unsubscribed/expired (typowe dla FCM: https://fcm.googleapis.com/...) :contentReference[oaicite:1]{index=1}
        if (status === 404 || status === 410) {
          console.warn("[push] dead subscription ->", short(row.endpoint), status);
          deadIds.push(row.id);
          return;
        }

        console.error(
          "[push] send error ->",
          short(row.endpoint),
          status,
          err?.message || err
        );
      }
    })
  );

  if (deadIds.length) {
    const unique = Array.from(new Set(deadIds));
    const { error: delErr } = await supabaseAdmin
      .from("admin_push_subscriptions")
      .delete()
      .in("id", unique);

    if (delErr) {
      console.error("[push] cleanup delete error:", delErr.message);
    } else {
      console.log("[push] cleanup deleted:", unique.length);
    }
  }
}
