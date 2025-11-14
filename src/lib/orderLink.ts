import crypto from "crypto";

const secret = process.env.ORDER_LINK_SECRET!;

export function sign(id: string) {
  return crypto.createHmac("sha256", secret).update(id).digest("hex").slice(0, 32);
}

export function verify(id: string, token?: string | null) {
  if (!token) return false;
  const exp = sign(id);
  try {
    return crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(token));
  } catch {
    return false;
  }
}

export function trackingUrl(origin: string, id: string) {
  const t = sign(String(id));
  return `${origin.replace(/\/+$/,"")}/order/${id}?t=${t}`;
}
