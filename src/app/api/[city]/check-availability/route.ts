// src/app/api/[city]/check-availability/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  isOrderingOpenNow,
  isAddressBlocked,
  getDrivingDistanceKm,
} from "@/lib/serverChecks";
import { getRestaurantBySlug } from "@/lib/tenant";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ city: string }> }
) {
  // w Next 15 params jest Promise – trzeba je awaitować
  const { city } = await params;

  const r = await getRestaurantBySlug(city);
  if (!r) {
    return NextResponse.json({ error: "Brak restauracji" }, { status: 404 });
  }

  const { address, method } = await req.json();

  const open = await isOrderingOpenNow(r.id, new Date());
  if (!open) {
    return NextResponse.json(
      { error: "Zamówienia chwilowo wstrzymane" },
      { status: 403 }
    );
  }

  if (method === "delivery") {
    const stringAddress = String(address ?? "");

    const blocked = await isAddressBlocked(r.id, stringAddress);
    if (blocked) {
      return NextResponse.json(
        { error: "Adres zablokowany" },
        { status: 403 }
      );
    }

    const { km, maxKm } = await getDrivingDistanceKm(r.id, stringAddress);
    if (km != null && maxKm != null && km > maxKm) {
      return NextResponse.json(
        { error: `Poza zasięgiem (${km.toFixed(1)} km)` },
        { status: 403 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}
