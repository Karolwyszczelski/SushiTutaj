// src/app/api/orders/status/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { orderLogger } from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

function isUuid(v?: string | null): boolean {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function isPublicId(v?: string | null): boolean {
  if (!v) return false;
  return /^[a-f0-9]{8,64}$/i.test(String(v).trim());
}

async function findOrderIdByParam(param: string): Promise<string | null> {
  // 1) jeśli UUID — to jest właściwy id
  if (isUuid(param)) return param;

  // 2) jeśli wygląda jak public_id — mapujemy na id
  if (isPublicId(param)) {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("public_id", param.toLowerCase())
      .maybeSingle();

    if (error) {
      orderLogger.error("select by public_id error", { error: error.message });
      return null;
    }
    return (data as any)?.id ? String((data as any).id) : null;
  }

  return null;
}

function normalizeHexToken(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  // tracking_token generujemy hex(32 bytes) => 64 znaki
  if (!/^[a-f0-9]{32,128}$/i.test(s)) return null;
  return s.toLowerCase();
}

// legacy HMAC token (base64url)
function normalizeLegacyToken(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(s)) return null;
  return s;
}

function buildPublicTrackingUrl(
  publicId: string | null | undefined,
  token: string | null | undefined
): string | null {
  const pid = publicId && isPublicId(publicId) ? publicId.toLowerCase() : null;
  const tok = token ? normalizeHexToken(token) : null;
  if (!pid || !tok) return null;
  return `/order/${encodeURIComponent(pid)}?t=${encodeURIComponent(tok)}`;
}

function getLegacySecret(): string | null {
  return process.env.ORDER_LINK_SECRET || process.env.ORDER_TRACKING_SECRET || null;
}

function signOrderId(orderId: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(orderId).digest("base64url");
}

function verifyLegacyHmac(orderId: string, token: string, secret: string): boolean {
  const expected = signOrderId(orderId, secret);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// mapujemy różne wartości z bazy na "delivery" | "takeaway"
function normalizeOption(raw?: string | null): "delivery" | "takeaway" {
  if (!raw) return "takeaway";
  const v = String(raw).toLowerCase();

  if (v === "delivery" || v === "dostawa") return "delivery";
  if (
    v === "takeaway" ||
    v === "na_wynos" ||
    v === "local" ||
    v === "pickup" ||
    v.includes("odbior")
  ) {
    return "takeaway";
  }

  return "takeaway";
}

/**
 * ETA (godzina realizacji / odbioru)
 * Zwracamy ISO albo HH:mm.
 */
function resolveEta(row: any): string | null {
  if (row?.deliveryTime) return String(row.deliveryTime);
  if (row?.scheduled_delivery_at) return String(row.scheduled_delivery_at);

  const cdt = row?.client_delivery_time as string | null;
  if (cdt && String(cdt).toLowerCase() !== "asap") return String(cdt);

  if (!row?.created_at) return null;

  try {
    const created = new Date(row.created_at);
    if (Number.isNaN(created.getTime())) return null;

    const isDelivery = normalizeOption(row.selected_option) === "delivery";
    const minutes = isDelivery ? 40 : 20;

    return new Date(created.getTime() + minutes * 60 * 1000).toISOString();
  } catch {
    return null;
  }
}

function resolveClientRequestedTime(row: any): string | null {
  const val =
    row?.client_delivery_time ??
    row?.scheduled_delivery_at ??
    row?.deliveryTime ??
    null;

  return val ? String(val) : null;
}

function parseNumeric(v: any): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// Next 15: ctx jako any
export async function GET(request: Request, ctx: any) {
  const keyRaw = (ctx?.params?.id as string | undefined) ?? "";
  const key = String(keyRaw).trim();

  if (!key) {
    return json({ error: "Brak identyfikatora zamówienia" }, 400);
  }

  const url = new URL(request.url);
  const tokenRaw =
    url.searchParams.get("t") ||
    url.searchParams.get("token") ||
    request.headers.get("x-order-token") ||
    "";

  if (!tokenRaw) {
    return json({ error: "Brak tokena" }, 401);
  }

  const tokenHex = normalizeHexToken(tokenRaw);
  const tokenLegacy = normalizeLegacyToken(tokenRaw);

  try {
    // ==========================
    // 1) NOWY tryb: public_id + tracking_token (HEX)
    //    + fallback: public_id + legacy HMAC
    // ==========================
    if (isPublicId(key)) {
      const keyLower = key.toLowerCase();

      // 1A) Preferowany: public_id + tracking_token (hex)
      if (tokenHex) {
        const { data, error } = await supabaseAdmin
          .from("orders")
          .select(
            `
            public_id,
            status,
            total_price,
            created_at,
            selected_option,
            client_delivery_time,
            scheduled_delivery_at,
            "deliveryTime"
          `
          )
          .eq("public_id", keyLower)
          .eq("tracking_token", tokenHex)
          .maybeSingle();

        if (error) {
          orderLogger.error("select(public_id+token) error", { error: error.message });
          return json({ error: "Błąd serwera" }, 500);
        }

        if (!data) {
          // celowo 404 (żeby nie rozróżniać: zły token vs brak zamówienia)
          return json({ error: "Nie znaleziono zamówienia" }, 404);
        }

        const row: any = data;
        const option = normalizeOption(row.selected_option);
        const eta = resolveEta(row);
        const clientRequestedTime = resolveClientRequestedTime(row);

        return json(
          {
            id: row.public_id, // nie zwracamy UUID
            publicId: row.public_id ?? keyLower,
            trackingUrl: buildPublicTrackingUrl(row.public_id ?? keyLower, tokenHex),
            status: row.status ?? "new",
            eta,
            option,
            total: parseNumeric(row.total_price),
            placedAt: row.created_at ?? new Date().toISOString(),
            clientRequestedTime,
          },
          200
        );
      }

      // 1B) Fallback: public_id + legacy HMAC(secret)
      const secret = getLegacySecret();
      if (secret && tokenLegacy) {
        const orderId = await findOrderIdByParam(keyLower);
        if (!orderId) {
          return json({ error: "Nie znaleziono zamówienia" }, 404);
        }

        if (!verifyLegacyHmac(orderId, tokenLegacy, secret)) {
          return json({ error: "Nie znaleziono zamówienia" }, 404);
        }

        const { data, error } = await supabaseAdmin
          .from("orders")
          .select(
            `
            id,
            public_id,
            tracking_token,
            status,
            total_price,
            created_at,
            selected_option,
            client_delivery_time,
            scheduled_delivery_at,
            "deliveryTime"
          `
          )
          .eq("id", orderId)
          .maybeSingle();

        if (error) {
          orderLogger.error("select(public_id legacy->id) error", { error: error.message });
          return json({ error: "Błąd serwera" }, 500);
        }

        if (!data) {
          return json({ error: "Nie znaleziono zamówienia" }, 404);
        }

        const row: any = data;
        const option = normalizeOption(row.selected_option);
        const eta = resolveEta(row);
        const clientRequestedTime = resolveClientRequestedTime(row);

        return json(
          {
            id: row.public_id ?? keyLower,
            publicId: row.public_id ?? null,
            trackingUrl: buildPublicTrackingUrl(row.public_id, row.tracking_token),
            status: row.status ?? "new",
            eta,
            option,
            total: parseNumeric(row.total_price),
            placedAt: row.created_at ?? new Date().toISOString(),
            clientRequestedTime,
          },
          200
        );
      }

      // jeśli token nie ma formatu hex i nie jest legacy hmac => odrzucamy
      return json({ error: "Nieprawidłowy token" }, 403);
    }

    // ==========================
    // 2) Przejściowy tryb: UUID + tracking_token(hex)
    // ==========================
    if (isUuid(key) && tokenHex) {
      const { data, error } = await supabaseAdmin
        .from("orders")
        .select(
          `
          id,
          public_id,
          status,
          total_price,
          created_at,
          selected_option,
          client_delivery_time,
          scheduled_delivery_at,
          "deliveryTime"
        `
        )
        .eq("id", key)
        .eq("tracking_token", tokenHex)
        .maybeSingle();

      if (error) {
        orderLogger.error("select(uuid+token) error", { error: error.message });
        return json({ error: "Błąd serwera" }, 500);
      }

      if (data) {
        const row: any = data;
        const option = normalizeOption(row.selected_option);
        const eta = resolveEta(row);
        const clientRequestedTime = resolveClientRequestedTime(row);

        return json(
          {
            id: row.id, // kompatybilnie: request już miał UUID
            publicId: row.public_id ?? null,
            trackingUrl: buildPublicTrackingUrl(row.public_id, tokenHex),
            status: row.status ?? "new",
            eta,
            option,
            total: parseNumeric(row.total_price),
            placedAt: row.created_at ?? new Date().toISOString(),
            clientRequestedTime,
          },
          200
        );
      }

      // celowo 404 (zły token vs brak rekordu)
      return json({ error: "Nie znaleziono zamówienia" }, 404);
    }

    // ==========================
    // 3) LEGACY: UUID + HMAC(secret)
    // ==========================
    if (isUuid(key)) {
      const secret = getLegacySecret();
      if (!secret || !tokenLegacy) {
        // brak sekretu albo token nie wygląda jak base64url
        return json({ error: "Nie znaleziono zamówienia" }, 404);
      }

      if (!verifyLegacyHmac(key, tokenLegacy, secret)) {
        return json({ error: "Nie znaleziono zamówienia" }, 404);
      }

      const { data, error } = await supabaseAdmin
        .from("orders")
        .select(
          `
          id,
          public_id,
          tracking_token,
          status,
          total_price,
          created_at,
          selected_option,
          client_delivery_time,
          scheduled_delivery_at,
          "deliveryTime"
        `
        )
        .eq("id", key)
        .maybeSingle();

      if (error) {
        orderLogger.error("select(legacy uuid) error", { error: error.message });
        return json({ error: "Błąd serwera" }, 500);
      }

      if (!data) {
        return json({ error: "Nie znaleziono zamówienia" }, 404);
      }

      const row: any = data;
      const option = normalizeOption(row.selected_option);
      const eta = resolveEta(row);
      const clientRequestedTime = resolveClientRequestedTime(row);

      return json(
        {
          id: row.id,
          publicId: row.public_id ?? null,
          trackingUrl: buildPublicTrackingUrl(row.public_id, row.tracking_token),
          status: row.status ?? "new",
          eta,
          option,
          total: parseNumeric(row.total_price),
          placedAt: row.created_at ?? new Date().toISOString(),
          clientRequestedTime,
        },
        200
      );
    }

    // Jeśli to nie wygląda ani jak public_id ani UUID -> nie obsługujemy
    return json({ error: "Nieprawidłowy identyfikator" }, 400);
  } catch (err: any) {
    orderLogger.error("exception", { error: err?.message || err });
    return json({ error: "Błąd serwera" }, 500);
  }
}
