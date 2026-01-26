// src/app/api/orders/create/_lib/restaurant.ts
import "server-only";

import { NextResponse } from "next/server";
import { orderLogger } from "@/lib/logger";

type SupabaseLike = {
  from: (table: string) => any;
};

export type SelectedOption = "delivery" | "takeaway";

export type RestaurantContext = {
  restaurantSlug: string;
  restaurant_id: string;
  restRow: any;
  deliveryActive: boolean;
  takeawayActive: boolean;
};

export function readRestaurantSlug(req: Request, raw: any): string {
  const url = new URL(req.url);

  const restaurantSlug = String(
    raw?.restaurant ||
      raw?.restaurant_slug ||
      url.searchParams.get("restaurant") ||
      req.headers.get("x-restaurant-slug") ||
      ""
  )
    .trim()
    .toLowerCase();

  return restaurantSlug;
}

export async function resolveRestaurantContext(args: {
  req: Request;
  raw: any;
  supabaseAdmin: SupabaseLike;
  selectedOption?: SelectedOption | null;
}): Promise<
  | { ok: true; ctx: RestaurantContext }
  | { ok: false; res: NextResponse }
> {
  const { req, raw, supabaseAdmin, selectedOption } = args;

  const restaurantSlug = readRestaurantSlug(req, raw);
  if (!restaurantSlug) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "Brak restauracji w żądaniu." },
        { status: 400 }
      ),
    };
  }

  // Fetch restauracji + kompatybilność (kolumny per-mode mogą nie istnieć)
  let restRes = await supabaseAdmin
    .from("restaurants")
    .select(
      "id, slug, lat, lng, active, ordering_delivery_active, ordering_takeaway_active"
    )
    .eq("slug", restaurantSlug)
    .maybeSingle();

  const restMsg = String(restRes.error?.message || "");
  if (
    restRes.error &&
    /ordering_delivery_active|ordering_takeaway_active/i.test(restMsg)
  ) {
    restRes = await supabaseAdmin
      .from("restaurants")
      .select("id, slug, lat, lng, active")
      .eq("slug", restaurantSlug)
      .maybeSingle();
  }

  const restRow: any = restRes.data;
  const restErr: any = restRes.error;

  if (restErr) {
    orderLogger.error("restaurants error", { error: restErr.message });
    return {
      ok: false,
      res: NextResponse.json(
        { error: "Błąd konfiguracji restauracji." },
        { status: 500 }
      ),
    };
  }

  if (!restRow?.id) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Nieznana restauracja." }, { status: 400 }),
    };
  }

  // global off
  if (restRow.active === false) {
    return {
      ok: false,
      res: NextResponse.json(
        {
          error:
            "Ten lokal chwilowo nie przyjmuje zamówień online. Spróbuj ponownie później lub skontaktuj się z restauracją.",
        },
        { status: 400 }
      ),
    };
  }

  // per-mode flags (brak kolumn => true)
  const deliveryActive =
    typeof restRow.ordering_delivery_active === "boolean"
      ? !!restRow.ordering_delivery_active
      : true;

  const takeawayActive =
    typeof restRow.ordering_takeaway_active === "boolean"
      ? !!restRow.ordering_takeaway_active
      : true;

  // HARD BLOCK per selected_option (jeśli podano)
  if (selectedOption === "delivery" && !deliveryActive) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "Dostawa jest chwilowo wyłączona dla tego lokalu." },
        { status: 400 }
      ),
    };
  }

  if (selectedOption === "takeaway" && !takeawayActive) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "Wynos jest chwilowo wyłączony dla tego lokalu." },
        { status: 400 }
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      restaurantSlug,
      restaurant_id: String(restRow.id),
      restRow,
      deliveryActive,
      takeawayActive,
    },
  };
}
