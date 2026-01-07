// src/app/api/settings/deliveryZones/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getAdminContext } from "@/lib/adminContext";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const zoneSchema = z.object({
  id: z.string().uuid().optional(),
  min_distance_km: z.coerce.number().nonnegative(),
  max_distance_km: z.coerce.number().positive(),
  min_order_value: z.coerce.number().nonnegative(),
  cost: z.coerce.number().nonnegative(),
  free_over: z.coerce.number().nonnegative().nullable(),
  eta_min_minutes: z.coerce.number().int().nonnegative(),
  eta_max_minutes: z.coerce.number().int().nonnegative(),
  cost_fixed: z.coerce.number().nonnegative(),
  cost_per_km: z.coerce.number().nonnegative(),
});

const zonesSchema = z.array(zoneSchema);

async function requireAdminRestaurant() {
  const { user, restaurantId } = await getAdminContext();

  if (!user) {
    return { error: json({ error: "Brak sesji." }, 401) as NextResponse };
  }
  if (!restaurantId) {
    return {
      error: json({ error: "Brak wybranego lokalu (restaurantId)." }, 403) as NextResponse,
    };
  }

  return { user, restaurantId };
}

export async function GET() {
  const ctx = await requireAdminRestaurant();
  if ("error" in ctx) return ctx.error;
  const { restaurantId } = ctx;

  const { data, error } = await supabaseAdmin
    .from("delivery_zones")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("min_distance_km", { ascending: true });

  if (error) return json({ error: error.message }, 500);
  return json(data ?? []);
}

export async function POST(req: Request) {
  const ctx = await requireAdminRestaurant();
  if ("error" in ctx) return ctx.error;
  const { restaurantId } = ctx;

  let zonesRaw: unknown;
  try {
    zonesRaw = await req.json();
  } catch {
    return json({ error: "Nieprawidłowy JSON." }, 400);
  }

  const parsed = zonesSchema.safeParse(zonesRaw);
  if (!parsed.success) {
    return json(
      { error: "Nieprawidłowe dane stref.", details: parsed.error.flatten() },
      400
    );
  }

  const zones = parsed.data;

  // Pobierz aktualne ID stref dla tego lokalu (żeby:
  // - usuwać tylko swoje
  // - nie pozwolić na upsert po cudzym id)
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("delivery_zones")
    .select("id")
    .eq("restaurant_id", restaurantId);

  if (existingErr) return json({ error: existingErr.message }, 500);

  const existingIds = new Set<string>(
    ((existing ?? []) as Array<{ id: string | null }>).map(r => r.id ?? "").filter(Boolean)
  );

  const incomingIds = new Set<string>(zones.map(z => z.id).filter(Boolean) as string[]);

  // Jeśli UI wysłał pustą listę — traktuj jako "usuń wszystko dla lokalu"
  if (zones.length === 0) {
    const { error: delAllErr } = await supabaseAdmin
      .from("delivery_zones")
      .delete()
      .eq("restaurant_id", restaurantId);

    if (delAllErr) return json({ error: delAllErr.message }, 500);
    return json([]);
  }

  // Usuń te, których już nie ma w payload — ALE tylko dla tego restaurant_id
  const toDelete = [...existingIds].filter(id => !incomingIds.has(id));
  if (toDelete.length > 0) {
    const { error: delErr } = await supabaseAdmin
      .from("delivery_zones")
      .delete()
      .eq("restaurant_id", restaurantId)
      .in("id", toDelete);

    if (delErr) return json({ error: delErr.message }, 500);
  }

  // Upsert:
  // - wymuszamy restaurant_id po stronie serwera
  // - jeśli ktoś poda id, które nie należy do lokalu -> strip id (żeby nie dało się "trafić" w cudzy rekord)
  const normalized = zones.map(z => {
    const row: any = { ...z, restaurant_id: restaurantId };
    if (row.id && !existingIds.has(row.id)) delete row.id;
    return row;
  });

  const { data, error } = await supabaseAdmin
    .from("delivery_zones")
    .upsert(normalized, { onConflict: "id" })
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("min_distance_km", { ascending: true });

  if (error) return json({ error: error.message }, 500);
  return json(data ?? []);
}
