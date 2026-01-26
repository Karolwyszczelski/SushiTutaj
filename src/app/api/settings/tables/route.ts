// src/app/api/settings/tables/route.ts
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

async function requireAdminRestaurant() {
  const { user, restaurantId } = await getAdminContext();

  if (!user) return { error: json({ error: "Brak sesji." }, 401) as NextResponse };
  if (!restaurantId)
    return {
      error: json({ error: "Brak wybranego lokalu (restaurantId)." }, 403) as NextResponse,
    };

  return { user, restaurantId };
}

const tableSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).optional(),
  number_of_seats: z.coerce.number().int().positive().optional(),
  x: z.coerce.number().optional(),
  y: z.coerce.number().optional(),
});

const tablesSchema = z.array(tableSchema);

export async function GET() {
  const ctx = await requireAdminRestaurant();
  if ("error" in ctx) return ctx.error;
  const { restaurantId } = ctx;

  const { data, error } = await supabaseAdmin
    .from("restaurant_tables")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: true });

  if (error) return json({ error: error.message }, 500);
  return json(data ?? []);
}

export async function POST(request: Request) {
  const ctx = await requireAdminRestaurant();
  if ("error" in ctx) return ctx.error;
  const { restaurantId } = ctx;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Nieprawidłowy JSON." }, 400);
  }

  const parsed = tablesSchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { error: "Nieprawidłowe dane stolików.", details: parsed.error.flatten() },
      400
    );
  }

  const input = parsed.data;

  // Pusta lista = usuń wszystkie stoliki dla lokalu
  if (input.length === 0) {
    const { error: delAllErr } = await supabaseAdmin
      .from("restaurant_tables")
      .delete()
      .eq("restaurant_id", restaurantId);

    if (delAllErr) return json({ error: delAllErr.message }, 500);
    return json([]);
  }

  // Normalizacja (domyślne wartości jak w Twoim kodzie)
  const normalized = input.map((t, idx) => ({
    id: t.id,
    label: (t.label?.trim() || `Stolik ${idx + 1}`) as string,
    seats: (t.number_of_seats && t.number_of_seats > 0 ? t.number_of_seats : 4) as number,
    x: typeof t.x === "number" ? t.x : 0,
    y: typeof t.y === "number" ? t.y : 0,
  }));

  // ID obecnie istniejące dla tego lokalu
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("restaurant_tables")
    .select("id")
    .eq("restaurant_id", restaurantId);

  if (existingErr) return json({ error: existingErr.message }, 500);

  const existingIds = new Set<string>(
    ((existing ?? []) as Array<{ id: string | null }>).map(r => r.id ?? "").filter(Boolean)
  );

  const incomingIds = normalized.map(t => t.id).filter(Boolean) as string[];

  // Blokada „upsert po cudzym id”:
  // jeśli którykolwiek incoming id istnieje w DB i NIE należy do tego lokalu => 409
  if (incomingIds.length > 0) {
    const { data: foreign, error: foreignErr } = await supabaseAdmin
      .from("restaurant_tables")
      .select("id, restaurant_id")
      .in("id", incomingIds)
      .neq("restaurant_id", restaurantId);

    if (foreignErr) return json({ error: foreignErr.message }, 500);
    if ((foreign ?? []).length > 0) {
      return json({ error: "Wykryto ID stolika spoza bieżącego lokalu." }, 409);
    }
  }

  // Usuń stoliki skasowane w UI — tylko w obrębie restaurant_id
  const toDelete = [...existingIds].filter(id => !incomingIds.includes(id));
  if (toDelete.length > 0) {
    const { error: delErr } = await supabaseAdmin
      .from("restaurant_tables")
      .delete()
      .eq("restaurant_id", restaurantId)
      .in("id", toDelete);

    if (delErr) return json({ error: delErr.message }, 500);
  }

  // Upsert:
  // - zawsze dokładamy restaurant_id z kontekstu
  // - id: pozwalamy na nowe id (jeśli nie konfliktuje), bo UI często generuje uuid po stronie klienta
  const rows = normalized.map(t => ({
    ...t,
    restaurant_id: restaurantId,
  }));

  const { data, error } = await supabaseAdmin
    .from("restaurant_tables")
    .upsert(rows, { onConflict: "id" })
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: true });

  if (error) return json({ error: error.message }, 500);
  return json(data ?? []);
}
