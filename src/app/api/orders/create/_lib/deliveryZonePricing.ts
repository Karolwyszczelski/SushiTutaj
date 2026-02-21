import { NextResponse } from "next/server";
import { orderLogger } from "@/lib/logger";
import { supabaseAdmin } from "./clients";
import { getDistanceKmFromGoogle } from "./distance";
import { num } from "./normalize";
import { pushAdminNotification } from "./notifications";

function roundUpToStep(value: number, step = 0.5): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return 0;
  const result = Math.ceil(value / step) * step;
  return Math.round(result * 100) / 100;
}

export async function enforceDeliveryZonePricing(
  req: Request,
  args: {
    n: any;
    restaurant_id: string;
    restRow: any;
    baseWithoutDelivery: number;
  }
): Promise<NextResponse | null> {
  const { n, restaurant_id, restRow, baseWithoutDelivery } = args;

  if (n.selected_option !== "delivery") return null;

  if (n.delivery_lat == null || n.delivery_lng == null) {
    return NextResponse.json(
      { error: "Brak współrzędnych adresu dostawy." },
      { status: 400 }
    );
  }

  const { data: zones, error: zErr } = await supabaseAdmin
    .from("delivery_zones")
    .select("*")
    .eq("restaurant_id", restaurant_id)
    .eq("active", true)
    .order("min_distance_km");

  if (zErr || !zones || zones.length === 0) {
    orderLogger.error("delivery_zones error", { error: zErr });

    await pushAdminNotification(
      restaurant_id,
      "error",
      "Błąd stref dostawy",
      zErr?.message || "Brak konfiguracji stref dostawy."
    );

    return NextResponse.json(
      { error: "Brak konfiguracji stref dostawy." },
      { status: 500 }
    );
  }

  const restLat = num(restRow?.lat, null);
  const restLng = num(restRow?.lng, null);

  if (restLat == null || restLng == null) {
    await pushAdminNotification(
      restaurant_id,
      "error",
      "Brak współrzędnych restauracji",
      "Uzupełnij współrzędne lokalu, aby działała dostawa."
    );

    return NextResponse.json(
      { error: "Nie skonfigurowano współrzędnych restauracji." },
      { status: 500 }
    );
  }

  const distance_km = await getDistanceKmFromGoogle(
    req,
    Number(restLat),
    Number(restLng),
    Number(n.delivery_lat),
    Number(n.delivery_lng)
  );

  const zone = (zones as any[]).find(
    (z) =>
      distance_km >= Number(z.min_distance_km) &&
      distance_km <= Number(z.max_distance_km)
  );

  if (!zone) {
    return NextResponse.json(
      { error: "Adres poza zasięgiem dostawy." },
      { status: 400 }
    );
  }

  // Minimalna wartość zamówienia – produkty + opakowanie (bez dostawy)
  if (baseWithoutDelivery < Number(zone.min_order_value || 0)) {
    return NextResponse.json(
      {
        error: `Minimalna wartość zamówienia to ${Number(
          zone.min_order_value || 0
        ).toFixed(2)} zł.`,
      },
      { status: 400 }
    );
  }

  const pricingType: string =
    (zone.pricing_type as string) ??
    (Number(zone.min_distance_km) === 0 ? "flat" : "per_km");

  const flatCostRaw =
    zone.cost_fixed != null ? Number(zone.cost_fixed) : Number(zone.cost ?? 0);

  const perKmRateRaw =
    zone.cost_per_km != null ? Number(zone.cost_per_km) : Number(zone.cost ?? 0);

  // POPRAWKA: dla per_km używamy cost_fixed + cost_per_km * distance_km
  const serverCost =
    pricingType === "per_km" 
      ? flatCostRaw + perKmRateRaw * distance_km 
      : flatCostRaw;

  // Darmowa dostawa wyłączona - zawsze naliczaj koszt dostawy
  // (usunięto logikę free_over)

  n.delivery_cost = roundUpToStep(Math.max(0, serverCost), 0.5);
  return null;
}
