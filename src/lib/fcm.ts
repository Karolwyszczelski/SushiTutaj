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
        if (
          ticket.details?.error === "DeviceNotRegistered" ||
          ticket.details?.error === "InvalidCredentials"
        ) {
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
  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch (err: any) {
    console.error("[fcm] getAccessToken failed:", err?.message || err);
    return deadTokens;
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
            notification: {
              channel_id: "orders",
              sound: "new_order",
              default_vibrate_timings: false,
              vibrate_timings: ["0s", "0.3s", "0.1s", "0.3s", "0.1s", "0.4s"],
              visibility: "PUBLIC" as const,
              notification_priority: "PRIORITY_MAX" as const,
            },
            // TTL 4 godziny
            ttl: "14400s",
          },
        },
      };

      try {
        const res = await fetch(fcmUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const errCode = errBody?.error?.details?.[0]?.errorCode || "";

          if (
            errCode === "UNREGISTERED" ||
            errCode === "INVALID_ARGUMENT" ||
            res.status === 404
          ) {
            deadTokens.push(token);
          }

          console.error(
            "[fcm] send error:",
            res.status,
            errCode,
            token.slice(0, 20) + "..."
          );
        }
      } catch (err: any) {
        console.error(
          "[fcm] network error:",
          err?.message,
          token.slice(0, 20) + "..."
        );
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
    // Brak natywnych urządzeń — to normalne, nie loguj jako warning
    return;
  }

  console.log(
    `[fcm] Wysyłam do ${rows.length} natywnych urządzeń dla restauracji:`,
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
