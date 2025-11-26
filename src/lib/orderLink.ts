// src/lib/orderLink.ts
import crypto from "crypto";

/**
 * Sekretny klucz do podpisywania linków śledzenia.
 * - PROD: ustaw ORDER_LINK_SECRET w env (Vercel).
 * - DEV: jeśli brak, używamy bezpiecznego, lokalnego fallbacku,
 *   żeby nie wywalać błędów przy developmencie.
 */
const ORDER_LINK_SECRET =
  process.env.ORDER_LINK_SECRET ||
  "dev-order-link-secret-change-me";

/** Podpis zamówienia (HMAC-SHA256, skrócony do 32 znaków hex) */
export function sign(id: string): string {
  return crypto
    .createHmac("sha256", ORDER_LINK_SECRET)
    .update(id)
    .digest("hex")
    .slice(0, 32);
}

/** Weryfikacja podpisu z linku */
export function verify(id: string, token?: string | null): boolean {
  if (!token) return false;
  const expected = sign(id);

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(String(token));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Link do śledzenia zamówienia.
 *
 * origin – np. https://sushitutaj.pl
 * id     – UUID zamówienia
 * restaurantSlug – opcjonalny slug restauracji (np. "ciechanow").
 *
 * Przykłady:
 *  trackingUrl("https://sushitutaj.pl", id, "ciechanow")
 *    => https://sushitutaj.pl/ciechanow/order/<id>?t=<token>
 *
 *  trackingUrl("https://sushitutaj.pl", id)
 *    => https://sushitutaj.pl/order/<id>?t=<token>
 */
export function trackingUrl(
  origin: string,
  id: string,
  restaurantSlug?: string | null
): string {
  const base = origin.replace(/\/+$/, ""); // bez końcowego /
  const token = sign(String(id));

  const path =
    restaurantSlug && restaurantSlug.trim().length
      ? `/${encodeURIComponent(restaurantSlug)}/order/${id}`
      : `/order/${id}`;

  return `${base}${path}?t=${encodeURIComponent(token)}`;
}
