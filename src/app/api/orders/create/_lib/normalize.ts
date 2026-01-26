// src/app/api/orders/create/_lib/normalize.ts
import "server-only";
import { TERMS_VERSION, PRIVACY_VERSION } from "./clients";

export type LoyaltyChoice = "keep" | "use_4" | "use_8";

type Any = Record<string, any>;

/* ===== Utils: num / arrays / ip ===== */
export const num = (v: any, d: number | null = null): number | null => {
  if (v == null) return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const toArray = (val: any): any[] =>
  Array.isArray(val) ? val : val == null ? [] : [val];

export const clientIp = (req: Request) => {
  const xff =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "";
  return xff.split(",")[0].trim() || null;
};

/* ===== Phone / user extraction ===== */
export const normalizePhone = (phone?: string | null) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 9) return `+48${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (!String(phone).startsWith("+") && digits.length > 9) return `+${digits}`;
  return String(phone);
};

export const extractPhone = (base: any): string | null => {
  const candidates = [
    base?.phone,
    base?.phone_number,
    base?.phoneNumber,
    base?.contact_phone,
    base?.telefon,
    base?.tel,
    base?.mobile,
    base?.msisdn,
    base?.customer?.phone,
    base?.user?.phone,
  ];
  for (const v of candidates) {
    if (v) return normalizePhone(v);
  }
  return null;
};

export const extractUserId = (base: any): string | null => {
  const cands = [
    base?.user_id,
    base?.userId,
    base?.user?.id,
    typeof base?.user === "string" ? base.user : null,
  ].filter(Boolean);
  return (cands[0] as string) ?? null;
};

/* ===== Ingredients parsing ===== */
export const parseIngredients = (v: any): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);

  if (typeof v === "object") {
    const vals = Object.values(v);
    return vals.map(String).filter(Boolean);
  }

  if (typeof v === "string") {
    return v
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [];
};

/* ===== String normalization (sauce, lunch, etc.) ===== */
// UWAGA: normalizePlainServer jest w pricing.ts (wersja pełna z logiką sosów)
// Importuj z pricing.ts zamiast z normalize.ts

/* ===== Statusy ===== */
const ALLOWED_ORDER_STATUSES = [
  "new",
  "placed",
  "accepted",
  "cancelled",
  "completed",
] as const;

export type AllowedOrderStatus = (typeof ALLOWED_ORDER_STATUSES)[number];

export function sanitizeOrderStatus(raw: unknown): AllowedOrderStatus {
  const s0 = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const map: Record<string, AllowedOrderStatus> = {
    pending: "new",
    created: "new",
    confirmed: "accepted",
    processing: "accepted",
    inprogress: "accepted",
    done: "completed",
    delivered: "completed",
    canceled: "cancelled",
  };
  const s = map[s0] ?? s0;
  return (ALLOWED_ORDER_STATUSES as readonly string[]).includes(s)
    ? (s as AllowedOrderStatus)
    : "new";
}

/* ===== Normalizacja BODY ===== */
export function normalizeBody(raw: any, req: Request) {
  const base = raw?.orderPayload ? raw.orderPayload : raw;

  const rawItems =
    raw?.items ??
    base?.items ??
    raw?.order_items ??
    raw?.cart ??
    raw?.products ??
    raw?.itemsPayload ??
    [];

  const itemsArray: Any[] =
    typeof rawItems === "string"
      ? (() => {
          try {
            return JSON.parse(rawItems);
          } catch {
            return [];
          }
        })()
      : Array.isArray(rawItems)
      ? rawItems
      : [];

  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  const ua = req.headers.get("user-agent") || null;
  const accepted_at = new Date().toISOString();

  const legal_accept =
    base?.legal_accept && typeof base.legal_accept === "object"
      ? {
          terms_version: base.legal_accept.terms_version || TERMS_VERSION,
          privacy_version:
            base.legal_accept.privacy_version || PRIVACY_VERSION,
          marketing_opt_in: !!base.legal_accept.marketing_opt_in,
          accepted_at: base.legal_accept.accepted_at || accepted_at,
          ip: base.legal_accept.ip || ip,
          ua: base.legal_accept.ua || ua,
        }
      : {
          terms_version: TERMS_VERSION,
          privacy_version: PRIVACY_VERSION,
          marketing_opt_in: !!base?.marketing_opt_in,
          accepted_at,
          ip,
          ua,
        };

  // ilość pałeczek – różne nazwy
  const sticksRaw =
    base?.chopsticks_qty ??
    base?.chopsticks ??
    base?.sticks_qty ??
    base?.sticks ??
    base?.paleczki ??
    base?.ilosc_paleczek ??
    0;
  const chopsticks_qty = Math.max(
    0,
    Math.min(
      10,
      Number.isFinite(Number(sticksRaw)) ? Number(sticksRaw) : 0
    )
  );

  // sposób realizacji z payloadu
  const selected_option: "delivery" | "takeaway" =
    (base?.selected_option as any) === "delivery" ? "delivery" : "takeaway";

  // surowy address i note z payloadu
  const rawAddress = base?.address ?? null;
  const rawNote =
    base?.note ??
    base?.order_note ??
    base?.orderNote ??
    base?.comments ??
    base?.comment ??
    null;

  // Dla dostawy: address = adres, note = notatka z osobnego pola
  // Dla "na wynos": address = null, note = osobne pole LUB (fallback) to,
  // co stary frontend wysyłał w address
  const address =
    selected_option === "delivery" ? rawAddress : null;

  const note =
    rawNote ??
    (selected_option === "takeaway" ? rawAddress : null);

  return {
    name: base?.name ?? base?.customer_name ?? null,
    phone: extractPhone(base),
    contact_email: base?.contact_email ?? base?.email ?? null,
    address,
    street: base?.street ?? null,
    postal_code: base?.postal_code ?? null,
    city: base?.city ?? null,
    flat_number: base?.flat_number ?? null,
    selected_option,
    payment_method: "Gotówka",
    payment_status: "unpaid",
    total_price: num(base?.total_price, 0),
    promo_code: base?.promo_code ?? null,
    discount_amount: num(base?.discount_amount, 0) ?? 0,
    delivery_cost: num(base?.delivery_cost, null),
    delivery_lat: num(base?.delivery_lat ?? base?.lat, null),
    delivery_lng: num(base?.delivery_lng ?? base?.lng, null),
    status: sanitizeOrderStatus(base?.status),
    client_delivery_time:
      base?.client_delivery_time ?? base?.delivery_time ?? null,
    deliveryTime: null,
    eta: base?.eta ?? null,
    user_id: extractUserId(base),
    legal_accept,
    itemsArray,
    chopsticks_qty,
    reservation_id: base?.reservation_id ?? base?.reservationId ?? null,
    loyalty_choice:
      (base?.loyalty_choice as LoyaltyChoice | null) ??
      (base?.loyaltyChoice as LoyaltyChoice | null) ??
      null,
    loyalty_free_roll_name:
      typeof base?.loyalty_free_roll_name === "string"
        ? base.loyalty_free_roll_name.trim() || null
        : null,
    note,
  };
}

/* ===== Recompute total from items ===== */
// UWAGA: recomputeTotalFromItems jest w pricing.ts (wersja pełna z logiką addon cost)
// Importuj z pricing.ts zamiast z normalize.ts
