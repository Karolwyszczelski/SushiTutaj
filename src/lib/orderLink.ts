// src/lib/orderLink.ts
import crypto from "node:crypto";
import "server-only";

const RAW_BASE =
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const BASE = RAW_BASE.replace(/\/+$/, "");

/** Nowy tracking z bazy (orders.public_id + orders.tracking_token) */
export type OrderTrackingRef = {
  id: string; // UUID (zawsze istnieje w DB)
  public_id?: string | null; // hex
  tracking_token?: string | null; // hex
};

function normalizeHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (!s) return null;
  // public_id: zwykle 16 hex, ale tolerujemy przyszłościowo
  // tracking_token: zwykle 64 hex, ale tolerujemy przyszłościowo
  if (!/^[a-f0-9]{8,128}$/.test(s)) return null;
  return s;
}

function getLegacySecretOrThrow(): string {
  const s = process.env.ORDER_LINK_SECRET || process.env.ORDER_TRACKING_SECRET || "";
  if (!s) {
    // tylko legacy wymaga sekretu
    throw new Error("[orderLink] Missing ORDER_LINK_SECRET / ORDER_TRACKING_SECRET (legacy mode)");
  }
  return s;
}

function signOrderId(orderId: string, secret: string): string {
  // krótkie i URL-safe
  return crypto.createHmac("sha256", secret).update(orderId).digest("base64url");
}

/**
 * trackingUrl:
 * - NOWE: /order/{public_id}?t={tracking_token}
 * - LEGACY: /orders/success?orderId={uuid}&t={hmac}
 */
export function trackingUrl(orderId: string): string;
export function trackingUrl(ref: OrderTrackingRef): string;
export function trackingUrl(arg: string | OrderTrackingRef): string {
  // ===== NOWE: public_id + tracking_token =====
  if (typeof arg === "object" && arg) {
    const publicId = normalizeHex(arg.public_id);
    const tokenHex = normalizeHex(arg.tracking_token);

    if (publicId && tokenHex) {
      return `${BASE}/order/${encodeURIComponent(publicId)}?t=${encodeURIComponent(tokenHex)}`;
    }

    // fallback do legacy po UUID (gdy np. brak kolumn / stary rekord)
    const id = String(arg.id || "").trim();
    if (!id) throw new Error("[orderLink] Missing id in tracking ref");

    const token = signOrderId(id, getLegacySecretOrThrow());
    return `${BASE}/orders/success?orderId=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`;
  }

  // ===== LEGACY: uuid + HMAC =====
  const id = String(arg || "").trim();
  if (!id) throw new Error("[orderLink] Missing orderId");

  // Guard: jeśli ktoś poda public_id jako string, nie mamy tracking_token -> nie zrobimy nowego linku.
  // Lepiej fail-fast niż generować zepsuty legacy URL.
  if (normalizeHex(id)) {
    throw new Error(
      "[orderLink] trackingUrl(string) received hex id (looks like public_id). Pass OrderTrackingRef with tracking_token."
    );
  }

  const token = signOrderId(id, getLegacySecretOrThrow());
  return `${BASE}/orders/success?orderId=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`;

}
