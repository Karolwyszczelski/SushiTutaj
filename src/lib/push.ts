// src/lib/push.ts
import "server-only";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { sendFcmForRestaurant } from "@/lib/fcm";

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

export type PushOptions = {
  /** Klucz idempotentności — jeśli podany, zapobiega duplikatom */
  idempotencyKey?: string;
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
  payload: PushPayload,
  options?: PushOptions
): Promise<void> {
  console.log("[push] Wysyłam dla restauracji:", restaurantId, options?.idempotencyKey ? `(key: ${options.idempotencyKey})` : "");

  // =========================================================================
  // IDEMPOTENTNOŚĆ — zapobiega duplikatom powiadomień
  // Jeśli ten sam klucz już był przetworzony, pomijamy
  // =========================================================================
  if (options?.idempotencyKey) {
    try {
      const { error: insertErr } = await supabaseAdmin
        .from("notification_idempotency")
        .insert({
          key: options.idempotencyKey,
          restaurant_id: restaurantId,
        });

      if (insertErr) {
        // Unique constraint violation = duplikat!
        if (insertErr.code === "23505") {
          console.log("[push] ⚡ Idempotency hit — pomijam duplikat:", options.idempotencyKey);
          return;
        }
        // Inny błąd — loguj ale kontynuuj (lepiej wysłać duplikat niż nic)
        console.warn("[push] idempotency check error (kontynuuję):", insertErr.message);
      }
    } catch (e: any) {
      console.warn("[push] idempotency check failed (kontynuuję):", e?.message);
    }
  }

  // =========================================================================
  // KRYTYCZNE: Uruchom FCM NATYCHMIAST równolegle z web-push!
  // Na Vercel serverless (limit 10-25s) web-push retry może zająć cały czas
  // → FCM w ogóle by się nie wykonało gdyby było sekwencyjne.
  // Promise jest await'owany na końcu funkcji.
  // =========================================================================
  const fcmPromise = sendFcmForRestaurant(restaurantId, {
    type: payload.type ?? "order",
    title: payload.title ?? "Nowe zamówienie",
    body: payload.body ?? payload.title ?? "Pojawiło się nowe zamówienie.",
    url: payload.url ?? "/admin/pickup-order",
  }).catch((fcmErr: any) => {
    console.error("[push] FCM send error (non-fatal):", fcmErr?.message || fcmErr);
  });

  // =========================================================================
  // WEB PUSH (VAPID)
  // =========================================================================
  let subs: AdminPushSubscriptionRow[] = [];

  if (!HAS_VAPID) {
    console.warn("[push] Pomijam web-push - brak kluczy VAPID");
  } else {
    const { data, error } = await supabaseAdmin
      .from("admin_push_subscriptions")
      .select("id, endpoint, subscription")
      .eq("restaurant_id", restaurantId)
      .limit(500);

    if (error) {
      console.error("[push] błąd pobierania subskrypcji:", error.message);
    } else {
      subs = (data as AdminPushSubscriptionRow[]) || [];
    }

    if (!subs.length) {
      console.warn("[push] Brak web-push subskrypcji dla restauracji:", restaurantId);
    }
  }
  
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
  // Śledzenie rzeczywistych wyników wysyłki per subskrypcja (dla delivery log)
  const webPushResults: { rowId: string; endpoint: string | null; status: "sent" | "failed" | "dead_token"; errorCode?: string; errorMessage?: string }[] = [];

  const results = await Promise.allSettled(
    subs.map(async (row) => {
      try {
        let sub: any = row.subscription;

        if (typeof sub === "string") {
          try {
            sub = JSON.parse(sub);
          } catch {
            deadIds.push(row.id);
            webPushResults.push({ rowId: row.id, endpoint: row.endpoint, status: "dead_token", errorCode: "INVALID_JSON" });
            return;
          }
        }

        if (!sub || typeof sub !== "object" || !sub.endpoint) {
          deadIds.push(row.id);
          webPushResults.push({ rowId: row.id, endpoint: row.endpoint, status: "dead_token", errorCode: "INVALID_SUB" });
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
            webPushResults.push({ rowId: row.id, endpoint: row.endpoint, status: "sent" });
            break;
          } catch (err: any) {
            lastError = err;
            const status = Number(
              err?.statusCode ?? err?.status ?? err?.status_code ?? NaN
            );
            
            // 404/410 = unsubscribed/expired - nie ma sensu ponawiać
            if (status === 404 || status === 410) {
              deadIds.push(row.id);
              webPushResults.push({ rowId: row.id, endpoint: row.endpoint, status: "dead_token", errorCode: `HTTP_${status}`, errorMessage: err?.message });
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
          // Nie udało się po retries — zapisz jako failed
          webPushResults.push({
            rowId: row.id,
            endpoint: row.endpoint,
            status: "failed",
            errorCode: Number.isFinite(status) ? `HTTP_${status}` : "UNKNOWN",
            errorMessage: (lastError?.message || String(lastError)).slice(0, 200),
          });
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
          webPushResults.push({ rowId: row.id, endpoint: row.endpoint, status: "dead_token", errorCode: `HTTP_${status}` });
          return;
        }

        webPushResults.push({
          rowId: row.id,
          endpoint: row.endpoint,
          status: "failed",
          errorCode: "UNEXPECTED",
          errorMessage: (err?.message || String(err)).slice(0, 200),
        });
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

  // =========================================================================
  // DELIVERY LOGGING — rzeczywiste wyniki per subskrypcja (nie założenia!)
  // Fire-and-forget: nie blokuje odpowiedzi
  // =========================================================================
  if (webPushResults.length > 0) {
    const webPushLogs = webPushResults.map((r) => ({
      restaurant_id: restaurantId,
      idempotency_key: options?.idempotencyKey || null,
      channel: "web_push",
      status: r.status,
      target_token_suffix: maskEndpoint(r.endpoint),
      error_code: r.errorCode || null,
      error_message: r.errorMessage || null,
      payload_title: basePayload.title.slice(0, 120),
      payload_type: basePayload.type,
    }));
    supabaseAdmin
      .from("notification_delivery_log")
      .insert(webPushLogs)
      .then(({ error: logErr }) => {
        if (logErr) console.error("[push] delivery log error:", logErr.message);
      });
  }

  // =========================================================================
  // Poczekaj na FCM (uruchomione równolegle na początku funkcji)
  // =========================================================================
  await fcmPromise;
}
