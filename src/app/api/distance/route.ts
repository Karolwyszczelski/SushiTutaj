// app/api/distance/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY; // tylko serwerowe
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || ""; // dodaj w ENV

// Upstash
const hasUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasUpstash ? Redis.fromEnv() : null;

// limit: 60 zapytań / 5 min na IP
const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "5 m"),
      analytics: true,
      prefix: "rl:distance",
    })
  : null;

// cache wyników (żeby nie palić Google) — 24h
const CACHE_TTL_SEC = 60 * 60 * 24;

function json(body: any, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function clientIp(req: Request) {
  const xff =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "";
  return xff.split(",")[0].trim() || "anon";
}

// tylko "lat,lng"
function parseLatLng(input: string | null): { lat: number; lng: number } | null {
  if (!input) return null;
  const s = input.trim();
  if (s.length > 64) return null;

  const m = s.match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;

  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function normCoord(n: number) {
  // stabilny klucz cache (ok. 1m precyzji)
  return n.toFixed(5);
}

function cacheKey(o: { lat: number; lng: number }, d: { lat: number; lng: number }) {
  return `dist:${normCoord(o.lat)},${normCoord(o.lng)}:${normCoord(d.lat)},${normCoord(d.lng)}`;
}

function getTurnstileToken(req: Request) {
  // wspieramy: header lub query (łatwo podpiąć w fetch)
  const url = new URL(req.url);
  return (
    req.headers.get("x-turnstile-token") ||
    url.searchParams.get("turnstileToken") ||
    url.searchParams.get("cf-turnstile-response") ||
    ""
  ).trim();
}

async function verifyTurnstile(req: Request) {
  // dev: pozwól działać bez Turnstile
  if (process.env.NODE_ENV !== "production") return true;

  // prod: jeśli brak TURNSTILE_SECRET, polegamy tylko na rate limit
  if (!TURNSTILE_SECRET) return true;

  const token = getTurnstileToken(req);
  // Jeśli brak tokenu, pozwól - polegamy na rate limit
  // (frontend nie przesyła Turnstile do tego endpointu)
  if (!token) return true;

  const ip = clientIp(req);

  const form = new URLSearchParams();
  form.set("secret", TURNSTILE_SECRET);
  form.set("response", token);
  if (ip && ip !== "anon") form.set("remoteip", ip);

  // timeout weryfikacji
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) return false;
    const data = await res.json();
    return !!data?.success;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: Request) {
  if (!GOOGLE_KEY) {
    return json({ error: "Brak konfiguracji GOOGLE_MAPS_API_KEY" }, 500);
  }

  // Turnstile (P0 koszty/abuse)
  const okTurnstile = await verifyTurnstile(req);
  if (!okTurnstile) {
    return json(
      {
        error: "TURNSTILE_REQUIRED",
        message:
          "Wymagana weryfikacja Turnstile (przekaż token w nagłówku x-turnstile-token lub w query turnstileToken).",
      },
      403
    );
  }

  // Rate limit (P0)
  if (ratelimit) {
    const ip = clientIp(req);
    const { success, reset } = await ratelimit.limit(ip);
    if (!success) {
      const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: "RATE_LIMIT", retry_after: retryAfterSec },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(retryAfterSec),
          },
        }
      );
    }
  }

  const { searchParams } = new URL(req.url);
  const originRaw = searchParams.get("origin");
  const destinationRaw = searchParams.get("destination");

  const origin = parseLatLng(originRaw);
  const destination = parseLatLng(destinationRaw);

  if (!origin || !destination) {
    return json(
      { error: "INVALID_PARAMS", message: "Wymagane origin i destination w formacie lat,lng" },
      400
    );
  }

  // Redis cache (żeby nie palić Google)
  const ck = cacheKey(origin, destination);
  if (redis) {
    const cached = await redis.get<{ distance_km: number; duration_sec: number }>(ck);
    if (cached && typeof cached.distance_km === "number" && typeof cached.duration_sec === "number") {
      return NextResponse.json(cached, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Distance-Cache": "HIT",
        },
      });
    }
  }

  // URL Distance Matrix (metric, driving)
  const url =
    "https://maps.googleapis.com/maps/api/distancematrix/json" +
    `?origins=${encodeURIComponent(`${origin.lat},${origin.lng}`)}` +
    `&destinations=${encodeURIComponent(`${destination.lat},${destination.lng}`)}` +
    `&mode=driving&units=metric&key=${encodeURIComponent(GOOGLE_KEY)}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return json({ error: `Google API returned ${res.status}` }, 502);
    }

    const data = await res.json();

    if (data.status !== "OK") {
      return json({ error: data.error_message || data.status || "GOOGLE_ERROR" }, 502);
    }

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") {
      return json({ error: element?.status || "No route found" }, 404);
    }

    const distance_km = Number(element.distance?.value || 0) / 1000;
    const duration_sec = Number(element.duration?.value || 0);

    const payload = { distance_km, duration_sec };

    if (redis) {
      // best-effort cache
      await redis.set(ck, payload, { ex: CACHE_TTL_SEC });
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Distance-Cache": "MISS",
      },
    });
  } catch (e: any) {
    const isAbort = String(e?.name || "").toLowerCase().includes("abort");
    return json({ error: isAbort ? "TIMEOUT" : "UPSTREAM_ERROR" }, isAbort ? 504 : 502);
  } finally {
    clearTimeout(t);
  }
}
