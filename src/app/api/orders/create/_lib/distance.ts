// src/app/api/orders/create/_lib/distance.ts
import "server-only";
import { orderLogger } from "@/lib/logger";

/* ===== Haversine ===== */
export const haversineKm = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s1));
};

// dystans z Google (przez /api/distance), fallback na Haversine
export async function getDistanceKmFromGoogle(
  req: Request,
  restLat: number,
  restLng: number,
  custLat: number,
  custLng: number
): Promise<number> {
  let distance_km = haversineKm(
    { lat: restLat, lng: restLng },
    { lat: custLat, lng: custLng }
  );

  try {
    const originBase = process.env.APP_BASE_URL || new URL(req.url).origin;
    const resp = await fetch(
      `${originBase}/api/distance?origin=${restLat},${restLng}&destination=${custLat},${custLng}`
    );
    if (!resp.ok) return distance_km;

    const json = await resp.json();
    if (typeof json.distance_km === "number") {
      distance_km = json.distance_km;
    }
  } catch (e) {
    orderLogger.error("/api/distance error", { error: e });
  }

  return distance_km;
}
