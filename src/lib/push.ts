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
  if (!HAS_VAPID) {
    console.warn("[push] Pomijam - brak kluczy VAPID");
    return;
  }

  console.log("[push] Wysyłam dla restauracji:", restaurantId);

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
  
  if (!subs.length) {
    console.warn("[push] Brak subskrypcji dla restauracji:", restaurantId);
    return;
  }
  
  console.log(`[push] Znaleziono ${subs.length} subskrypcji dla restauracji:`, restaurantId);

  // Generuj unikalne ID dla tego powiadomienia - gwarantuje że SW nie połączy go z innym
  const uniqueNotificationId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  
  // Wyciągnij orderId z tytułu jeśli jest (format: "Nowe zamówienie #123")
  const orderIdMatch = payload.title?.match(/#(\d+)/);
  const orderId = orderIdMatch ? orderIdMatch[1] : null;

  const basePayload = {
    // Unikalne ID powiadomienia - używane przez SW do tagowania
    id: uniqueNotificationId,
    // Order ID jeśli dostępne (dla grupowania po stronie użytkownika)
    orderId: orderId,
    // Unikalny tag - zapewnia że każde powiadomienie jest osobne
    tag: `order-${orderId || uniqueNotificationId}`,
    // Typ powiadomienia
    type: clampStr(payload.type, 40) ?? "order",
    title: clampStr(payload.title, 120) ?? "Nowe zamówienie",
    body:
      clampStr(payload.body, 240) ??
      clampStr(payload.title, 120) ??
      "Pojawiło się nowe zdarzenie w systemie.",
    url: clampStr(payload.url, 300) ?? "/admin/pickup-order",
    // Timestamp dla sortowania
    timestamp: Date.now(),
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

        // Retry logic - 3 próby z rosnącym opóźnieniem
        const MAX_RETRIES = 3;
        let lastError: any = null;
        
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            await webpush.sendNotification(sub, payloadJson, {
              // TTL 4 godziny (14400 sekund) - daje dużo czasu na wybudzenie urządzenia
              // z trybu uśpienia/oszczędzania baterii. Dla zamówień restauracyjnych
              // 4h to rozsądny kompromis między dostarczalnością a aktualnością.
              TTL: 60 * 60 * 4,
              
              // Urgency "high" wymusza natychmiastowe dostarczenie przez FCM/APNs
              // nawet gdy urządzenie jest w trybie Doze/uśpienia
              urgency: "high",
              
              // UWAGA: Celowo NIE używamy "topic" - topic powoduje że push service
              // nadpisuje poprzednie niedostarczone powiadomienia z tym samym topic.
              // Dla zamówień chcemy żeby KAŻDE powiadomienie dotarło osobno.
              // Zamiast tego używamy unikalnego tagu po stronie Service Workera.
            });
            // Sukces - przerywamy pętlę
            lastError = null;
            break;
          } catch (err: any) {
            lastError = err;
            const status = Number(
              err?.statusCode ?? err?.status ?? err?.status_code ?? NaN
            );
            
            // 404/410 = unsubscribed/expired - nie ma sensu ponawiać
            if (status === 404 || status === 410) {
              deadIds.push(row.id);
              return;
            }
            
            // 429 = rate limit - poczekaj dłużej
            // 5xx = błąd serwera - warto spróbować ponownie
            if (attempt < MAX_RETRIES && (status === 429 || status >= 500 || !Number.isFinite(status))) {
              // Exponential backoff: 500ms, 1000ms, 2000ms
              const delay = Math.min(500 * Math.pow(2, attempt - 1), 4000);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
            
            // Inne błędy (4xx) - nie ma sensu ponawiać
            break;
          }
        }
        
        if (lastError) {
          const status = Number(
            lastError?.statusCode ?? lastError?.status ?? lastError?.status_code ?? NaN
          );
          console.error(
            "[push] send error after retries ->",
            maskEndpoint(row.endpoint),
            Number.isFinite(status) ? status : "?",
            lastError?.message || lastError
          );
        }
      } catch (err: any) {
        // Zewnętrzny catch - łapie błędy parsowania JSON i inne nieoczekiwane
        const status = Number(
          err?.statusCode ?? err?.status ?? err?.status_code ?? NaN
        );

        if (status === 404 || status === 410) {
          deadIds.push(row.id);
          return;
        }

        console.error(
          "[push] unexpected error ->",
          maskEndpoint(row.endpoint),
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
