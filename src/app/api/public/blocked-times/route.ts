// src/app/api/public/blocked-times/route.ts
// Publiczne API do pobierania blokad czasowych dla rezerwacji (bez autoryzacji)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const restaurantSlug = searchParams.get("restaurant");

  if (!restaurantSlug || typeof restaurantSlug !== "string") {
    return json({ slots: [], error: "Brak parametru restaurant" }, 400);
  }

  // Pobierz restaurant_id po slugu
  const { data: restaurant, error: rErr } = await supabaseAdmin
    .from("restaurants")
    .select("id")
    .eq("slug", restaurantSlug)
    .maybeSingle();

  if (rErr || !restaurant?.id) {
    return json({ slots: [], error: "Nie znaleziono restauracji" }, 404);
  }

  const restaurantId = restaurant.id;

  // Pobierz blokady tylko dla rezerwacji (kind = 'reservation' lub 'both')
  // oraz tylko przyszłe/dzisiejsze daty
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: slots, error: bErr } = await supabaseAdmin
    .from("restaurant_blocked_times")
    .select("block_date, full_day, from_time, to_time, kind")
    .eq("restaurant_id", restaurantId)
    .in("kind", ["reservation", "both"])
    .gte("block_date", today)
    .order("block_date", { ascending: true });

  if (bErr) {
    return json({ slots: [], error: "Błąd pobierania blokad" }, 500);
  }

  return json({ slots: slots ?? [] }, 200);
}
