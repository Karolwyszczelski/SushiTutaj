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

type FcmTokenRow = {
  id: string;
  token: string;
  token_type: "fcm" | "expo";
};

// =============================================================================
// EXPO PUSH (dla tokenów Expo Push)
// =============================================================================

async function sendExpoPush(
  tokens: string[],
  payload: FcmPayload
): Promise<string[]> {
  if (tokens.length === 0) return [];

  const deadTokens: string[] = [];

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
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      console.error("[fcm/expo] Push API error:", res.status);
      return deadTokens;
    }

    const result = await res.json();
    const tickets = result?.data || [];

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket?.status === "error") {
        // Usuń token TYLKO gdy urządzenie jest wyrejestrowane — to oznacza
        // że token jest naprawdę martwy i nie ma sensu go trzymać.
        // NIE usuwaj przy InvalidCredentials — to błąd konfiguracji serwera
        // (brak FCM V1 credentials w EAS), a nie problem z urządzeniem.
        if (ticket.details?.error === "DeviceNotRegistered") {
          deadTokens.push(tokens[i]);
        }
        console.error(
          "[fcm/expo] ticket error:",
          ticket.details?.error,
          tokens[i].slice(0, 30)
        );
      }
    }
  } catch (err: any) {
    console.error("[fcm/expo] send error:", err?.message || err);
  }

  return deadTokens;
}

// =============================================================================
// FCM HTTP v1 (dla natywnych FCM tokenów)
// =============================================================================

async function sendFcmNative(
  tokens: string[],
  payload: FcmPayload
): Promise<string[]> {
  if (tokens.length === 0 || !HAS_FCM) return [];

  const deadTokens: string[] = [];

  // Retry getAccessToken — przy cold start lub expiracji tokena OAuth
  let accessToken: string;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      accessToken = await getAccessToken();
      break;
    } catch (err: any) {
      console.error(`[fcm] getAccessToken attempt ${attempt}/3 failed:`, err?.message || err);
      if (attempt === 3) return deadTokens;
      // Wymuś odświeżenie cache'owanego tokena
      cachedAccessToken = null;
      tokenExpiresAt = 0;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  await Promise.allSettled(
    tokens.map(async (token) => {
      const message = {
        message: {
          token,
          notification: {
            title: payload.title || "Nowe zamówienie",
            body: payload.body || "Pojawiło się nowe zamówienie.",
          },
          data: {
            type: payload.type || "order",
            url: payload.url || "/admin/pickup-order",
            timestamp: String(Date.now()),
          },
          android: {
            priority: "HIGH" as const,
            // KRYTYCZNE: direct_boot_ok = true → powiadomienie dociera
            // nawet gdy tablet jest zablokowany PIN-em/wzorem.
            // Bez tego flaga — Android trzyma powiadomienie w kolejce
            // aż użytkownik odblokuje urządzenie!
            direct_boot_ok: true,
            notification: {
              channel_id: "orders",
              sound: "new_order",
              default_vibrate_timings: false,
              vibrate_timings: ["0s", "0.3s", "0.1s", "0.3s", "0.1s", "0.4s"],
              visibility: "PUBLIC" as const,
              notification_priority: "PRIORITY_MAX" as const,
            },
            // TTL 4 godziny — FCM trzyma wiadomość jeśli urządzenie offline
            ttl: "14400s",
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
            break;
          }

          const errBody = await res.json().catch(() => ({}));
          const errCode = errBody?.error?.details?.[0]?.errorCode || "";

          // Token martwy — nie próbuj ponownie
          if (
            errCode === "UNREGISTERED" ||
            errCode === "INVALID_ARGUMENT" ||
            res.status === 404
          ) {
            deadTokens.push(token);
            console.error(
              "[fcm] dead token:",
              res.status,
              errCode,
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

          console.error(
            "[fcm] send error after retries:",
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
          }
        }
      }
    })
  );

  return deadTokens;
}

// =============================================================================
// GŁÓWNA FUNKCJA — wysyłanie do wszystkich natywnych urządzeń restauracji
// =============================================================================

export async function sendFcmForRestaurant(
  restaurantId: string,
  payload: FcmPayload
): Promise<void> {
  // Pobierz wszystkie tokeny FCM dla restauracji
  const { data, error } = await supabaseAdmin
    .from("admin_fcm_tokens")
    .select("id, token, token_type")
    .eq("restaurant_id", restaurantId)
    .limit(200);

  if (error) {
    console.error("[fcm] błąd pobierania tokenów:", error.message);
    return;
  }

  const rows = (data as FcmTokenRow[]) || [];
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
  const [deadExpo, deadFcm] = await Promise.all([
    sendExpoPush(
      expoTokens.map((r) => r.token),
      payload
    ),
    sendFcmNative(
      fcmTokens.map((r) => r.token),
      payload
    ),
  ]);

  // Wyczyść martwe tokeny
  const allDeadTokens = [...deadExpo, ...deadFcm];
  if (allDeadTokens.length > 0) {
    const deadIds = rows
      .filter((r) => allDeadTokens.includes(r.token))
      .map((r) => r.id);

    if (deadIds.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .from("admin_fcm_tokens")
        .delete()
        .in("id", deadIds);

      if (delErr) {
        console.error("[fcm] cleanup error:", delErr.message);
      } else {
        console.log(`[fcm] Usunięto ${deadIds.length} martwych tokenów`);
      }
    }
  }
}
