import crypto from "crypto";

export const P24_ENV = (process.env.P24_ENV || "prod").toLowerCase();
export const isProd = P24_ENV === "prod";
export const P24_BASE = isProd
  ? "https://secure.przelewy24.pl"
  : "https://sandbox.przelewy24.pl";

export const hostFromEnv = () => (isProd ? "secure.przelewy24.pl" : "sandbox.przelewy24.pl");

// ---- helpers ----
const CRC = (process.env.P24_CRC_KEY || "").trim();
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");

// API v3.2 (legacy) – md5(sessionId|merchantId|amount|currency|crc)
export function p24SignRegisterMD5(
  sessionId: string,
  merchantId: string | number,
  amountGr: number,
  currency: string,
  crcOverride?: string
) {
  const key = (crcOverride ?? CRC).trim();
  return md5(`${String(sessionId)}|${String(merchantId)}|${String(amountGr)}|${String(currency)}|${key}`);
}

// API v3.2 (legacy) verify – md5(sessionId|orderId|amount|currency|crc)
export function p24SignVerifyMD5(args: {
  sessionId: string;
  orderId: string | number;
  amount: number;
  currency: string;
}) {
  return md5(
    `${String(args.sessionId)}|${String(args.orderId)}|${String(args.amount)}|${String(args.currency)}|${CRC}`
  );
}

export function amountToGrosze(amountPln: number | string) {
  const n = typeof amountPln === "string" ? Number(String(amountPln).replace(",", ".")) : amountPln;
  return Math.max(1, Math.round((Number.isFinite(n) ? n : 0) * 100));
}

export function extractOrderIdFromSession(sessionId: unknown) {
  if (!sessionId) return null;
  const raw = String(sessionId).trim();
  if (!raw) return null;
  const prefix = "sisi-";
  const withoutPrefix = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  const normalized = withoutPrefix.trim();
  return normalized || null;
}

/** Zwraca kwotę w groszach. Jeśli string zawiera separator, traktuje wartość jako PLN. */
export function parseP24Amount(value: unknown, _currency?: string): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).replace(",", ".").trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  return raw.includes(".") ? Math.round(numeric * 100) : Math.round(numeric);
}
