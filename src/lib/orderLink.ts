// src/lib/orderLink.ts
const RAW_BASE =
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

const BASE = RAW_BASE.replace(/\/+$/, "");

type WithTracking = {
  id: string;
  public_id?: string | null;
  tracking_token?: string | null;
};

export function trackingUrl(
  order: string | WithTracking,
  token?: string | null
): string {
  const id =
    typeof order === "string" ? order : order.public_id || order.id;

  const t =
    token ??
    (typeof order === "string" ? null : order.tracking_token ?? null);

  if (t) {
    return `${BASE}/order/${encodeURIComponent(id)}?t=${encodeURIComponent(t)}`;
  }

  return `${BASE}/order/${encodeURIComponent(id)}`;
}
