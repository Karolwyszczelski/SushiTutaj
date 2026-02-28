// src/lib/fcm.ts
// =============================================================================
// Firebase Cloud Messaging (FCM) - wysyłanie natywnych powiadomień push
// Używane RÓWNOLEGLE z web-push (src/lib/push.ts)
// =============================================================================
import "server-only";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Firebase service account — potrzebne do wysyłania FCM
// Ustaw w env: FIREBASE_SERVICE_ACCOUNT_JSON (cały JSON jako string)
// lub FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY osobno
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "";
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || "";
const FIREBASE_PRIVATE_KEY = (process.env.FIREBASE_PRIVATE_KEY || "").replace(
  /\\n/g,
  "\n"
);

// Alternatywnie: cały service account JSON z env
let serviceAccount: any = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch {
    console.error("[fcm] Nie udało się sparsować FIREBASE_SERVICE_ACCOUNT_JSON");
  }
}

const projectId =
  serviceAccount?.project_id || FIREBASE_PROJECT_ID;
const clientEmail =
  serviceAccount?.client_email || FIREBASE_CLIENT_EMAIL;
const privateKey =
  serviceAccount?.private_key || FIREBASE_PRIVATE_KEY;

const HAS_FCM = Boolean(projectId && clientEmail && privateKey);

if (!HAS_FCM) {
  console.warn(
    "[fcm] Brak konfiguracji Firebase – natywne push będą pomijane. " +
      "Ustaw FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY " +
      "lub FIREBASE_SERVICE_ACCOUNT_JSON w .env"
  );
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// =============================================================================
// FCM v1 API — wysyłanie bez firebase-admin SDK (mniejszy bundle)
// Używamy bezpośrednio FCM HTTP v1 API z OAuth2 token
// =============================================================================

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Uzyskaj OAuth2 access token dla FCM API używając service account credentials.
 * Tokenki są cache'owane i odświeżane automatycznie.
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Użyj cache'owanego tokena jeśli jest ważny (z 60s marginesem)
  if (cachedAccessToken && tokenExpiresAt > now + 60_000) {
    return cachedAccessToken;
  }

  // Tworzymy JWT ręcznie (bez zewnętrznych zależności)
  const header = { alg: "RS256", typ: "JWT" };
  const iat = Math.floor(now / 1000);
  const exp = iat + 3600; // 1 godzina

  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp,
  };

  // Kodowanie base64url
  const b64url = (obj: any) => {
    const json = JSON.stringify(obj);
    const b64 = Buffer.from(json).toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  const headerB64 = b64url(header);
  const claimB64 = b64url(claimSet);
  const signInput = `${headerB64}.${claimB64}`;

  // Podpisz JWT kluczem prywatnym
  const crypto = await import("crypto");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signInput);
  const signature = sign
    .sign(privateKey, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${signInput}.${signature}`;

  // Wymień JWT na access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`[fcm] OAuth token error: ${tokenRes.status} ${errText}`);
  }

  const tokenData = await tokenRes.json();
  cachedAccessToken = tokenData.access_token;
  tokenExpiresAt = now + (tokenData.expires_in || 3600) * 1000;

  return cachedAccessToken!;
}

// =============================================================================
// TYPY
// =============================================================================

export type FcmPayload = {
  type?: string;
  title?: string;
  body?: string;
  url?: string;
};

/**
 * Rezultat wysyłki dla pojedynczego tokena.
 * Używane do inteligentnego zarządzania cyklem życia tokenów:
 * - "sent" → token działa, resetuj failure_count
 * - "failed" + UNREGISTERED → inkrementuj failure_count, usuń po >= 3
 * - "failed" + INVALID_ARGUMENT → NIE usuwaj (błąd payloadu, nie tokena!)
 * - "failed" + inne → loguj, nie usuwaj
 */
export type TokenSendResult = {
  token: string;
  status: "sent" | "failed";
  errorCode?: string;
};

type FcmTokenRow = {
  id: string;
  token: string;
  token_type: "fcm" | "expo";
  failure_count: number;
  updated_at: string;  // KRYTYCZNE: potrzebujemy updated_at żeby chronić aktywne tokeny
};

// =============================================================================
// EXPO PUSH (dla tokenów Expo Push)
// =============================================================================

async function sendExpoPush(
  tokens: string[],
  payload: FcmPayload,
  restaurantId?: string
): Promise<TokenSendResult[]> {
  if (tokens.length === 0) return [];

  const results: TokenSendResult[] = [];

  // Expo Push API — batch do 100
  const messages = tokens.map((token) => ({
    to: token,
    sound: "new_order.mp3",
    title: payload.title || "Nowe zamówienie",
    body: payload.body || "Pojawiło się nowe zamówienie.",
    data: {
      type: payload.type || "order",
      url: payload.url || "/admin/pickup-order",
      timestamp: Date.now(),
    },
    priority: "high" as const,
    channelId: "orders",
    categoryId: "order",
  }));

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      console.error("[fcm/expo] Push API error:", res.status);
      // Serwer Expo niedostępny → wszystkie tokeny oznacz jako failed
      // ALE NIE usuwaj — to problem po stronie Expo, nie urządzenia!
      for (const token of tokens) {
        results.push({ token, status: "failed", errorCode: `EXPO_HTTP_${res.status}` });
      }
      return results;
    }

    const result = await res.json();
    const tickets = result?.data || [];

    // =====================================================================
    // EXPO PUSH RECEIPTS — zapisz ticket IDs do bazy
    // Expo wymaga sprawdzenia ticketów po 15-30 min żeby wykryć
    // DeviceNotRegistered które nie przychodzą natychmiast.
    // Bez tego martwe tokeny Expo żyją w bazie tygodniami!
    // =====================================================================
    const receiptRows: { ticket_id: string; expo_token: string; restaurant_id: string }[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const ticket = tickets[i];
      if (!ticket || ticket?.status === "error") {
        const errCode = ticket?.details?.error || "UNKNOWN";
        results.push({ token: tokens[i], status: "failed", errorCode: errCode });
        console.error(
          "[fcm/expo] ticket error:",
          errCode,
          tokens[i].slice(0, 30)
        );
      } else {
        results.push({ token: tokens[i], status: "sent" });
        // Zapisz ticket ID do późniejszego sprawdzenia receiptu
        if (ticket.id && restaurantId) {
          receiptRows.push({
            ticket_id: ticket.id,
            expo_token: tokens[i],
            restaurant_id: restaurantId,
          });
        }
      }
    }

    // Fire-and-forget: zapisz tickety do sprawdzenia później
    // UNIQUE(ticket_id) chroni przed duplikatami — ignorujemy 23505
    if (receiptRows.length > 0) {
      supabaseAdmin
        .from("expo_push_receipts")
        .insert(receiptRows)
        .then(({ error: e }) => {
          if (e && e.code !== "23505") {
            console.error("[fcm/expo] receipt insert error:", e.message);
          } else if (!e) {
            console.log(`[fcm/expo] 📝 Zapisano ${receiptRows.length} ticket(ów) do sprawdzenia`);
          }
        });
    }
  } catch (err: any) {
    console.error("[fcm/expo] send error:", err?.message || err);
    // Błąd sieci → oznacz wszystkie jako failed, NIE usuwaj
    for (const token of tokens) {
      results.push({ token, status: "failed", errorCode: "NETWORK_ERROR" });
    }
  }

  return results;
}

// =============================================================================
// FCM HTTP v1 (dla natywnych FCM tokenów)
// =============================================================================

async function sendFcmNative(
  tokens: string[],
  payload: FcmPayload
): Promise<TokenSendResult[]> {
  if (tokens.length === 0 || !HAS_FCM) return [];

  const results: TokenSendResult[] = [];

  // Retry getAccessToken — przy cold start lub expiracji tokena OAuth
  let accessToken: string;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      accessToken = await getAccessToken();
      break;
    } catch (err: any) {
      console.error(`[fcm] getAccessToken attempt ${attempt}/3 failed:`, err?.message || err);
      if (attempt === 3) {
        // OAuth failed → oznacz wszystkie tokeny jako failed (NIE usuwaj!)
        for (const token of tokens) {
          results.push({ token, status: "failed", errorCode: "OAUTH_FAILED" });
        }
        return results;
      }
      cachedAccessToken = null;
      tokenExpiresAt = 0;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  await Promise.allSettled(
    tokens.map(async (token) => {
      // =====================================================================
      // PRAWDZIWA DATA-ONLY MESSAGE
      // =====================================================================
      // BRAK klucza "notification" ORAZ BRAK "android.notification"!
      //
      // Dlaczego to KRYTYCZNE:
      // Obecność android.notification sprawia że Android System Handler
      // przejmuje kontrolę nad powiadomieniem gdy apka jest w tle/zabita.
      // System Handler IGNORUJE expo-notifications i jego callback
      // handleNotification (shouldPlaySound: true) — zamiast tego używa
      // ustawień kanału systemowego. Jeśli kanał był kiedykolwiek
      // utworzony bez dźwięku lub zresetowany przez OEM → CISZA.
      //
      // Prawdziwa data-only message (TYLKO pole "data", BEZ notification):
      // → ExpoFirebaseMessagingService.onMessageReceived() ZAWSZE się odpala
      //   (foreground + background + killed)
      // → expo-notifications buduje powiadomienie z pól data.*
      // → handleNotification callback jest konsultowany
      // → shouldPlaySound: true → dźwięk ZAWSZE gra
      //
      // Tak robią profesjonalne apki POS: Square, Uber Eats Merchant,
      // DoorDash Merchant — data-only + HIGH priority + foreground service.
      // =====================================================================
      const message = {
        message: {
          token,
          data: {
            // expo-notifications rozpoznaje te klucze i buduje powiadomienie:
            title: payload.title || "Nowe zamówienie",
            body: payload.body || "Pojawiło się nowe zamówienie.",
            // Dodatkowe dane dla naszej apki:
            type: payload.type || "order",
            url: payload.url || "/admin/pickup-order",
            // Kanał + dźwięk — expo-notifications używa tych wartości:
            channelId: "orders",
            sound: "new_order.mp3",
            categoryId: "order",
            // KRYTYCZNE: Flagi expo-notifications dla data-only messages
            // _displayInForeground → ExpoFirebaseMessagingService wywołuje
            // handleNotification callback (shouldPlaySound:true, shouldShowAlert:true)
            // Bez tego expo może potraktować wiadomość jako cichą data-only.
            _displayInForeground: "true",
            timestamp: String(Date.now()),
          },
          android: {
            // HIGH priority = FCM dostarcza natychmiast, budzi urządzenie z Doze mode
            priority: "HIGH" as const,
            // direct_boot_ok → dociera na zablokowany tablet (PIN/wzór)
            direct_boot_ok: true,
            // TTL 4h — FCM trzyma wiadomość jeśli urządzenie offline
            ttl: "14400s",
            // ❌ BRAK notification {} — to GWARANTUJE data-only behavior!
            // Z notification {} Android System Handler przejmuje kontrolę
            // w tle i dźwięk zależy od kanału systemowego (zawodny).
            // Bez notification {} → expo-notifications ZAWSZE kontroluje dźwięk.
          },
        },
      };

      // Retry logic: 3 próby z exponential backoff
      // Chroni przed: chwilowe błędy sieci, 5xx FCM, rate limiting
      const MAX_RETRIES = 3;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const res = await fetch(fcmUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken!}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(message),
          });

          if (res.ok) {
            // Sukces — powiadomienie wysłane do FCM
            results.push({ token, status: "sent" });
            break;
          }

          const errBody = await res.json().catch(() => ({}));
          const errCode = errBody?.error?.details?.[0]?.errorCode || "";
          const errMsg = errBody?.error?.message || "";

          // =================================================================
          // UNREGISTERED = token naprawdę martwy (odinstalowana apka, etc.)
          // Ale NIE usuwamy natychmiast! Inkrementujemy failure_count.
          // Usunięcie dopiero po >= 3 kolejnych UNREGISTERED.
          // =================================================================
          if (errCode === "UNREGISTERED" || res.status === 404) {
            results.push({ token, status: "failed", errorCode: "UNREGISTERED" });
            console.warn(
              "[fcm] ⚠️ UNREGISTERED token (nie usuwam od razu!):",
              res.status,
              token.slice(0, 20) + "..."
            );
            break;
          }

          // =================================================================
          // INVALID_ARGUMENT = problem z PAYLOADEM, NIE z tokenem!
          // Token jest prawidłowy, ale wiadomość ma zły format.
          // NIGDY nie usuwaj tokena! To nasz bug, nie problem urządzenia.
          // =================================================================
          if (errCode === "INVALID_ARGUMENT") {
            results.push({ token, status: "failed", errorCode: "INVALID_ARGUMENT" });
            console.error(
              "[fcm] 🐛 INVALID_ARGUMENT (bug w payloadzie, token OK!):",
              errMsg.slice(0, 200),
              token.slice(0, 20) + "..."
            );
            break;
          }

          // 401 = OAuth token wygasł w trakcie — odśwież i spróbuj ponownie
          if (res.status === 401 && attempt < MAX_RETRIES) {
            console.warn("[fcm] 401 — odświeżam OAuth token...");
            cachedAccessToken = null;
            tokenExpiresAt = 0;
            try {
              accessToken = await getAccessToken();
            } catch {}
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }

          // 429/5xx = serwer FCM chwilowo niedostępny — retry
          if (attempt < MAX_RETRIES && (res.status === 429 || res.status >= 500)) {
            console.warn(`[fcm] ${res.status} — retry ${attempt}/${MAX_RETRIES}...`);
            await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
            continue;
          }

          // Ostateczny błąd po retries — NIE usuwaj tokena!
          results.push({ token, status: "failed", errorCode: errCode || `HTTP_${res.status}` });
          console.error(
            "[fcm] send error after retries (token zachowany):",
            res.status,
            errCode,
            token.slice(0, 20) + "..."
          );
          break;
        } catch (err: any) {
          console.error(
            `[fcm] network error attempt ${attempt}/${MAX_RETRIES}:`,
            err?.message,
            token.slice(0, 20) + "..."
          );
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
          } else {
            // Wyczerpane retries z powodu sieci — NIE usuwaj tokena!
            results.push({ token, status: "failed", errorCode: "NETWORK_ERROR" });
          }
        }
      }
    })
  );

  return results;
}

// =============================================================================
// DELIVERY LOGGING — fire-and-forget do notification_delivery_log
// =============================================================================

async function logDeliveries(
  restaurantId: string,
  results: TokenSendResult[],
  payload: FcmPayload,
  channel: string
): Promise<void> {
  try {
    if (results.length === 0) return;
    const rows = results.map((r) => ({
      restaurant_id: restaurantId,
      channel,
      status: r.status,
      target_token_suffix: r.token.slice(-20),
      error_code: r.errorCode || null,
      error_message: r.errorCode && r.errorCode !== "sent" ? `Token failure: ${r.errorCode}` : null,
      payload_title: (payload.title || "").slice(0, 120),
      payload_type: payload.type || "order",
    }));
    const { error } = await supabaseAdmin
      .from("notification_delivery_log")
      .insert(rows);
    if (error) {
      console.error("[fcm] delivery log insert error:", error.message);
    }
  } catch (err: any) {
    // Delivery logging NIGDY nie powinno blokować wysyłki
    console.error("[fcm] delivery log error (non-fatal):", err?.message);
  }
}

// =============================================================================
// Kody błędów które oznaczają DEFINITYWNIE martwy token
// Tylko te mogą inkrementować failure_count
// =============================================================================
const DEAD_TOKEN_ERROR_CODES = new Set([
  "UNREGISTERED",        // FCM: token wyrejestrowany (odinstalowana apka)
  "DeviceNotRegistered", // Expo: token wyrejestrowany
  "NOT_FOUND",           // FCM HTTP 404
]);

// Kody błędów które NIGDY nie powinny wpływać na token
// (problem po stronie serwera lub payloadu, nie urządzenia)
const SAFE_ERROR_CODES = new Set([
  "INVALID_ARGUMENT",    // Zły format wiadomości — nasz bug!
  "SENDER_ID_MISMATCH", // Zła konfiguracja Firebase
  "QUOTA_EXCEEDED",     // Rate limit — chwilowy
  "INTERNAL",           // Błąd Google — chwilowy
  "UNAVAILABLE",        // FCM niedostępne — chwilowy
  "OAUTH_FAILED",       // Nasz OAuth nie działa
  "NETWORK_ERROR",      // Nasz problem z siecią
  "InvalidCredentials", // Expo: zła konfiguracja serwera
]);


// =============================================================================
// GŁÓWNA FUNKCJA — wysyłanie do wszystkich natywnych urządzeń restauracji
// =============================================================================

export async function sendFcmForRestaurant(
  restaurantId: string,
  payload: FcmPayload
): Promise<void> {
  // Pobierz wszystkie tokeny FCM dla restauracji (Z failure_count I updated_at!)
  // FALLBACK: Jeśli kolumna failure_count nie istnieje (migracja 20260225000000
  // nie została zastosowana), ponów SELECT bez niej — push MUSI być wysłany!
  const res = await supabaseAdmin
    .from("admin_fcm_tokens")
    .select("id, token, token_type, failure_count, updated_at")
    .eq("restaurant_id", restaurantId)
    .limit(200);
  let data: any[] | null = res.data;
  let error: { message: string; code?: string } | null = res.error;

  // Fallback: kolumna failure_count może nie istnieć
  if (error && (error.code === "42703" || error.message?.includes("does not exist"))) {
    console.warn("[fcm] failure_count column missing, retrying SELECT without it");
    const fallback = await supabaseAdmin
      .from("admin_fcm_tokens")
      .select("id, token, token_type, updated_at")
      .eq("restaurant_id", restaurantId)
      .limit(200);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error("[fcm] błąd pobierania tokenów:", error.message);
    return;
  }

  const rows: FcmTokenRow[] = ((data || []) as any[]).map((r) => ({
    ...r,
    failure_count: r.failure_count ?? 0,
  }));
  if (!rows.length) {
    console.error(
      "[fcm] ❌ BRAK tokenów FCM dla restauracji:",
      restaurantId,
      "— powiadomienie natywne NIE zostanie wysłane!",
      "Sprawdź tabelę admin_fcm_tokens i czy tablet jest zarejestrowany."
    );
    return;
  }

  const fcmCount = rows.filter((r) => r.token_type === "fcm").length;
  const expoCount = rows.filter((r) => r.token_type === "expo").length;
  console.log(
    `[fcm] ✅ Wysyłam do ${rows.length} urządzeń (FCM: ${fcmCount}, Expo: ${expoCount}) dla restauracji:`,
    restaurantId
  );

  // Rozdziel na tokeny Expo i natywne FCM
  const expoTokens = rows.filter((r) => r.token_type === "expo");
  const fcmTokens = rows.filter((r) => r.token_type === "fcm");

  // Wysyłaj równolegle
  const [expoResults, fcmResults] = await Promise.all([
    sendExpoPush(
      expoTokens.map((r) => r.token),
      payload,
      restaurantId
    ),
    sendFcmNative(
      fcmTokens.map((r) => r.token),
      payload
    ),
  ]);

  const allResults = [...expoResults, ...fcmResults];

  // =========================================================================
  // ZARZĄDZANIE CYKLEM ŻYCIA TOKENÓW — NIGDY NIE USUWAMY!
  // Tokeny NIGDY nie są automatycznie usuwane. Restauracja może nie mieć
  // zamówień przez wiele godzin — usunięcie tokena oznaczałoby utratę
  // powiadomień po wznowieniu zamówień. Zamiast tego:
  // - Sukces → reset failure_count do 0
  // - UNREGISTERED/DeviceNotRegistered → increment failure_count (tracking)
  // - Heartbeat co 5 min resetuje failure_count → token się regeneruje
  // - INVALID_ARGUMENT/NETWORK_ERROR → NIE ruszaj tokena!
  // =========================================================================

  const tokenToRow = new Map(rows.map((r) => [r.token, r]));

  const idsToResetFailure: string[] = [];
  const tokensToIncrement: { id: string; newCount: number; reason: string }[] = [];

  for (const result of allResults) {
    const row = tokenToRow.get(result.token);
    if (!row) continue;

    if (result.status === "sent") {
      // ✅ Sukces! Jeśli token miał wcześniejsze błędy, zresetuj counter
      if (row.failure_count > 0) {
        idsToResetFailure.push(row.id);
      }
    } else {
      // ❌ Błąd wysyłki
      const code = result.errorCode || "UNKNOWN";

      if (DEAD_TOKEN_ERROR_CODES.has(code)) {
        // Token MOŻE mieć problem — inkrementuj counter, ale NIGDY nie usuwaj.
        // Restauracja może nie mieć zamówień przez godziny — token musi przetrwać.
        // Heartbeat co 5 min zresetuje failure_count gdy tablet wróci online.
        const newCount = (row.failure_count || 0) + 1;
        tokensToIncrement.push({ id: row.id, newCount, reason: code });
        console.warn(
          `[fcm] ⚠️ Token failure ${newCount} (zachowuję — nigdy nie usuwam):`,
          code,
          row.token.slice(0, 20) + "...",
          "(heartbeat zresetuje po powrocie online)"
        );
      } else if (SAFE_ERROR_CODES.has(code)) {
        // Bezpieczny błąd — problem po naszej stronie, NIE ruszaj tokena
        console.warn(
          "[fcm] ℹ️ Bezpieczny błąd (token OK):",
          code,
          row.token.slice(0, 20) + "..."
        );
      } else {
        // Nieznany błąd — loguj ale NIE usuwaj
        console.warn(
          "[fcm] ❓ Nieznany błąd (token zachowany):",
          code,
          row.token.slice(0, 20) + "..."
        );
      }
    }
  }

  // =========================================================================
  // BATCH DB OPERATIONS
  // =========================================================================
  const dbOps: PromiseLike<any>[] = [];

  // Reset failure_count dla tokenów które pomyślnie otrzymały push
  if (idsToResetFailure.length > 0) {
    dbOps.push(
      supabaseAdmin
        .from("admin_fcm_tokens")
        .update({
          failure_count: 0,
          last_failure_at: null,
          last_failure_reason: null,
          updated_at: new Date().toISOString(),
        })
        .in("id", idsToResetFailure)
        .then(({ error: e }) => {
          if (e) console.error("[fcm] reset failure_count error:", e.message);
          else if (idsToResetFailure.length > 0)
            console.log(`[fcm] ✅ Reset failure_count dla ${idsToResetFailure.length} tokenów`);
        })
    );
  }

  // Inkrementuj failure_count dla potencjalnie martwych tokenów
  // WAŻNE: NIE aktualizujemy updated_at — to pole odzwierciedla ostatni
  // "dowód życia" (heartbeat, rejestracja, delivery ACK).
  // Failure increment NIE jest dowodem życia — jest dowodem AWARII.
  for (const { id, newCount, reason } of tokensToIncrement) {
    dbOps.push(
      supabaseAdmin
        .from("admin_fcm_tokens")
        .update({
          failure_count: newCount,
          last_failure_at: new Date().toISOString(),
          last_failure_reason: reason,
        })
        .eq("id", id)
        .then(({ error: e }) => {
          if (e) console.error("[fcm] increment failure_count error:", e.message);
        })
    );
  }

  // Delivery logging (fire-and-forget — nie blokuje odpowiedzi)
  dbOps.push(
    logDeliveries(restaurantId, fcmResults, payload, "fcm"),
    logDeliveries(restaurantId, expoResults, payload, "expo")
  );

  // Wykonaj wszystkie operacje DB równolegle
  await Promise.allSettled(dbOps);

  // Podsumowanie
  const sentCount = allResults.filter((r) => r.status === "sent").length;
  const failedCount = allResults.filter((r) => r.status === "failed").length;
  if (failedCount > 0) {
    console.warn(
      `[fcm] Podsumowanie: ${sentCount} sent, ${failedCount} failed,`,
      `${tokensToIncrement.length} z inkrementowanym failure_count (tokeny NIGDY nie usuwane)`
    );
  }
}
