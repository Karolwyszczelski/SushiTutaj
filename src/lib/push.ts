// src/lib/push.ts
import "server-only";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

const HAS_VAPID = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);

if (HAS_VAPID) {
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
  subscription: unknown; // TEXT(JSON) albo JSONB
};

function clampStr(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

function maskEndpoint(endpoint?: string | null) {
  if (!endpoint) return "";
  const s = String(endpoint);
  return s.length > 24 ? `…${s.slice(-24)}` : s;
}

export async function sendPushForRestaurant(
  restaurantId: string,
  payload: PushPayload
): Promise<void> {
  if (!HAS_VAPID) return;

  const { data, error } = await supabaseAdmin
    .from("admin_push_subscriptions")
    .select("id, endpoint, subscription")
    .eq("restaurant_id", restaurantId)
    .limit(500);

  if (error) {
    console.error("[push] błąd pobierania subskrypcji:", error.message);
    return;
  }

  const subs = (data as AdminPushSubscriptionRow[]) || [];
  if (!subs.length) return;

  const basePayload = {
    type: clampStr(payload.type, 40) ?? "order",
    title: clampStr(payload.title, 120) ?? "Nowe zamówienie",
    body:
      clampStr(payload.body, 240) ??
      clampStr(payload.title, 120) ??
      "Pojawiło się nowe zdarzenie w systemie.",
    url: clampStr(payload.url, 300) ?? "/admin/pickup-order",
  };

  const payloadJson = JSON.stringify(basePayload);

  const deadIds: string[] = [];

  const results = await Promise.allSettled(
    subs.map(async (row) => {
      try {
        let sub: any = row.subscription;

        if (typeof sub === "string") {
          try {
            sub = JSON.parse(sub);
          } catch {
            deadIds.push(row.id);
            return;
          }
        }

        if (!sub || typeof sub !== "object" || !sub.endpoint) {
          deadIds.push(row.id);
          return;
        }

        await webpush.sendNotification(sub, payloadJson, {
          TTL: 60 * 60 * 6, // 6h
          urgency: "high",
        });
      } catch (err: any) {
        const status = Number(
          err?.statusCode ?? err?.status ?? err?.status_code ?? NaN
        );

        // 404/410 = unsubscribed/expired (typowe)
        if (status === 404 || status === 410) {
          deadIds.push(row.id);
          return;
        }

        console.error(
          "[push] send error ->",
          maskEndpoint(row.endpoint),
          Number.isFinite(status) ? status : "?",
          err?.message || err
        );
      }
    })
  );

  // opcjonalny minimalny log zbiorczy (bez endpointów)
  const rejected = results.filter((r) => r.status === "rejected").length;
  if (rejected) {
    console.warn("[push] allSettled rejected count:", rejected);
  }

  if (deadIds.length) {
    const unique = Array.from(new Set(deadIds));
    const { error: delErr } = await supabaseAdmin
      .from("admin_push_subscriptions")
      .delete()
      .in("id", unique);

    if (delErr) {
      console.error("[push] cleanup delete error:", delErr.message);
    }
  }
}
