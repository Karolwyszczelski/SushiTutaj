// src/app/api/menu_items/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionAndRole } from "@/lib/serverAuth";
import { getAdminContext } from "@/lib/adminContext";

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const insertSchema = z.object({
  name: z.string().min(1),
  price: z.coerce.number().nonnegative(),
  // legacy: UI wysyła "category" (string)
  // nowsze: czasem "category_id"
  category: z.string().optional(),
  category_id: z.string().optional(),
  subcategory: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  ingredients: z.array(z.string()).optional(),
});

function toCents(v: number) {
  // 12.5 -> 1250
  return Math.round((Number.isFinite(v) ? v : 0) * 100);
}

function isMissingRelation(err: any) {
  const msg = String(err?.message ?? "").toLowerCase();
  return err?.code === "42P01" || msg.includes("does not exist") || msg.includes("relation");
}

function isMissingColumn(err: any) {
  const msg = String(err?.message ?? "").toLowerCase();
  return err?.code === "42703" || msg.includes("column") || msg.includes("does not exist");
}

async function requireAdminAndRestaurant() {
  const { session, role } = await getSessionAndRole();
  if (!session || role !== "admin") {
    return { error: json({ error: "Unauthorized" }, 401) as NextResponse };
  }

  // restaurantId z cookie / mapowania
  try {
    const ctx = await getAdminContext();
    if (!ctx.user) return { error: json({ error: "Brak sesji." }, 401) as NextResponse };
    // restaurantId bywa null w legacy – wtedy nadal trzymamy “admin-only”, ale bez scopu
    return { supabase: ctx.supabase, restaurantId: ctx.restaurantId ?? null };
  } catch {
    // jeśli getAdminContext rzuci (np. brak przypisanego lokalu),
    // to nadal admin jest zweryfikowany — zwracamy bez restaurantId
    return { supabase: null as any, restaurantId: null as string | null };
  }
}

function mapProductToLegacyMenuItem(p: any) {
  const price =
    (typeof p?.price === "number" && Number.isFinite(p.price) ? p.price : null) ??
    (typeof p?.price_cents === "number" ? p.price_cents / 100 : 0);

  return {
    id: p.id,
    name: p.name,
    price,
    category: p.subcategory ?? "Pozostałe",
    subcategory: null,
    description: p.description ?? null,
    ingredients: [],
    available: p.available ?? true,
    order: p.position ?? 0,
    image_url: p.image_url ?? null,
  };
}

export async function GET() {
  const ctx = await requireAdminAndRestaurant();
  if ("error" in ctx) return ctx.error;

  // ctx.supabase bywa null jeśli getAdminContext nie dał rady – wtedy i tak nie chcemy publicznego dostępu
  const supabase = ctx.supabase;
  const restaurantId = ctx.restaurantId;

  // 1) Spróbuj legacy `menu_items`
  if (supabase) {
    const q = (supabase as any)
      .from("menu_items")
      .select("*")
      .order("order", { ascending: true });

    const { data, error } = restaurantId
      ? await q.eq("restaurant_id", restaurantId)
      : await q;

    if (!error) return json(data ?? []);

    // brak kolumny restaurant_id -> retry bez scopu (legacy single-tenant)
    if (restaurantId && isMissingColumn(error)) {
      const { data: data2, error: err2 } = await (supabase as any)
        .from("menu_items")
        .select("*")
        .order("order", { ascending: true });

      if (!err2) return json(data2 ?? []);
      if (!isMissingRelation(err2)) return json({ error: err2.message }, 500);
      // jeśli to jednak brak tabeli — przejdziemy do products
    } else if (!isMissingRelation(error)) {
      return json({ error: error.message }, 500);
    }
  }

  // 2) Fallback: `products` (aktualna tabela w Twoich typach)
  //    Jeśli nie mamy supabase z getAdminContext (rzucił), to i tak nie mamy jak bezpiecznie czytać.
  if (!supabase) return json({ error: "Brak kontekstu lokalu." }, 403);

  let qb = supabase.from("products").select("*").order("position", { ascending: true });
  if (restaurantId) qb = qb.eq("restaurant_id", restaurantId);

  const { data: prod, error: prodErr } = await qb;
  if (prodErr) return json({ error: prodErr.message }, 500);

  return json((prod ?? []).map(mapProductToLegacyMenuItem));
}

export async function POST(request: Request) {
  const ctx = await requireAdminAndRestaurant();
  if ("error" in ctx) return ctx.error;

  const supabase = ctx.supabase;
  const restaurantId = ctx.restaurantId;

  if (!supabase) return json({ error: "Brak kontekstu lokalu." }, 403);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const parsed = insertSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
  }

  const body = parsed.data;

  // legacy payload -> minimalnie kompatybilny insert
  const legacyInsert: any = {
    name: body.name,
    price: body.price,
    category_id: body.category_id ?? body.category ?? null,
    subcategory: body.subcategory ?? null,
    description: body.description ?? null,
    ingredients: body.ingredients ?? [],
    available: true,
    order: 0,
  };

  // 1) Spróbuj legacy `menu_items`
  const tryMenuItems = async () => {
    const payload = { ...legacyInsert };
    if (restaurantId) payload.restaurant_id = restaurantId;

    const { data, error } = await (supabase as any)
      .from("menu_items")
      .insert(payload)
      .select()
      .single();

    return { data, error };
  };

  const r1 = await tryMenuItems();

  if (!r1.error) return json(r1.data);

  // brak kolumny restaurant_id -> retry bez niej
  if (restaurantId && isMissingColumn(r1.error)) {
    const { restaurant_id: _rid, ...withoutRid } = { ...legacyInsert, restaurant_id: restaurantId } as any;

    const { data, error } = await (supabase as any)
      .from("menu_items")
      .insert(withoutRid)
      .select()
      .single();

    if (!error) return json(data);
    if (!isMissingRelation(error)) return json({ error: error.message }, 500);
    // jeśli to jednak brak tabeli — lecimy do products
  } else if (!isMissingRelation(r1.error)) {
    return json({ error: r1.error.message }, 500);
  }

  // 2) Fallback: insert do `products`
  if (!restaurantId) return json({ error: "Brak wybranego lokalu (restaurantId)." }, 403);

  const cents = toCents(body.price);

  const productInsert: any = {
    restaurant_id: restaurantId,
    name: body.name,
    description: body.description ?? null,
    subcategory: (body.subcategory ?? body.category ?? null) as string | null,
    available: true,
    is_active: true,
    has_variants: false,
    position: 0,
    price_cents: cents,
    // jeśli u Ciebie `price` jest nadal używane — ustawiamy też
    price: cents / 100,
  };

  const { data: prod, error: prodErr } = await supabase
    .from("products")
    .insert(productInsert)
    .select()
    .single();

  if (prodErr) return json({ error: prodErr.message }, 500);

  return json(mapProductToLegacyMenuItem(prod));
}
