import { trackingUrl } from "@/lib/orderLink";

export type TrackingArgs = {
  orderId: string;
  publicId?: string | null;
  token?: string | null;
};

export function buildTrackingUrlForClient(req: Request, args: TrackingArgs): string {
  const origin = process.env.APP_BASE_URL || new URL(req.url).origin;

  const publicId = args.publicId ? String(args.publicId).trim() : "";
  const token = args.token ? String(args.token).trim() : "";

  // Docelowo: public_id + tracking_token
  if (publicId && token) {
    return `${origin}/order/${encodeURIComponent(publicId)}?t=${encodeURIComponent(token)}`;
  }

  // Fallback: stary link (HMAC po UUID w orderLink)
  return trackingUrl(String(args.orderId));
}
