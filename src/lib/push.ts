// src/lib/push.ts
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

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.warn("[push] Brak kluczy VAPID – web push będzie pomijany");
}

export type PushPayload = {
  /** np. "order" | "error" | "system" – używasz z create.ts */
  type?: string;
  title?: string;
  body?: string;
  url?: string;
};

type AdminPushSubscriptionRow = {
  id: string;
  endpoint: string | null;
  subscription: any; // tekst (JSON) albo JSONB
};

export async function sendPushForRestaurant(
  restaurantId: string,
  payload: PushPayload
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn("[push] VAPID nie skonfigurowany – pomijam push");
    return;
  }

  const { data: subs, error } = await supabaseAdmin
    .from("admin_push_subscriptions")
    .select("id, endpoint, subscription")
    .eq("restaurant_id", restaurantId);

  if (error) {
    console.error("[push] błąd pobierania subskrypcji:", error);
    return;
  }

  if (!subs || subs.length === 0) {
    console.log("[push] brak subskrypcji dla restauracji", restaurantId);
    return;
  }

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

  await Promise.all(
    (subs as AdminPushSubscriptionRow[]).map(async (row) => {
      try {
        let sub: any = row.subscription;

        // w bazie masz TEXT z JSON-em – obsługujemy też JSONB na przyszłość
        if (typeof sub === "string") {
          try {
            sub = JSON.parse(sub);
          } catch (e) {
            console.error(
              "[push] niepoprawne JSON w subscription, id:",
              row.id
            );
            return;
          }
        }

        if (!sub || !sub.endpoint) {
          // śmieciowy wpis – czyścimy
          await supabaseAdmin
            .from("admin_push_subscriptions")
            .delete()
            .eq("id", row.id);
          return;
        }

        await webpush.sendNotification(sub, payloadJson);
        console.log("[push] wysłano powiadomienie do", sub.endpoint);
      } catch (err: any) {
        console.error(
          "[push] błąd wysyłki do",
          row.endpoint,
          err?.statusCode,
          err?.message || err
        );

        // 404 / 410 = martwa subskrypcja – usuwamy
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabaseAdmin
            .from("admin_push_subscriptions")
            .delete()
            .eq("id", row.id);
        }
      }
    })
  );
}
