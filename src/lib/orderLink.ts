const BASE =
  (process.env.NEXT_PUBLIC_BASE_URL || "https://sushitutaj.pl").replace(
    /\/+$/,
    ""
  );

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
