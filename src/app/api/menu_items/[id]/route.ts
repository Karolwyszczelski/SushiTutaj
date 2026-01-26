// src/app/api/menu_items/[id]/route.ts
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

function isMissingRelation(err: any) {
  const msg = String(err?.message ?? "").toLowerCase();
  return err?.code === "42P01" || msg.includes("does not exist") || msg.includes("relation");
}

function isMissingColumn(err: any) {
  const msg = String(err?.message ?? "").toLowerCase();
  return err?.code === "42703" || msg.includes("column") || msg.includes("does not exist");
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  price: z.coerce.number().nonnegative().optional(),
  category_id: z.string().nullable().optional(),
  category: z.string().nullable().optional(), // legacy
  subcategory: z.string().nullable().optional(),
  available: z.coerce.boolean().optional(),
  order: z.coerce.number().int().optional(),
});

function toCents(v: number) {
  return Math.round((Number.isFinite(v) ? v : 0) * 100);
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

async function requireAdminAndCtx() {
  const { session, role } = await getSessionAndRole();
  if (!session || role !== "admin") {
    return { error: json({ error: "Unauthorized" }, 401) as NextResponse };
  }

  // chcemy restaurantId do scopu; jeśli brak — nadal admin, ale bezpieczniej blokować fallback na products
  const ctx = await getAdminContext();
  if (!ctx.user) return { error: json({ error: "Brak sesji." }, 401) as NextResponse };

  return { supabase: ctx.supabase, restaurantId: ctx.restaurantId ?? null };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const ctx = await requireAdminAndCtx();
  if ("error" in ctx) return ctx.error;

  const supabase = ctx.supabase as any;
  const restaurantId = ctx.restaurantId;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
  }

  const body = parsed.data;

  // -------- 1) Spróbuj legacy `menu_items` --------
  const legacyUpdate: any = {};
  if (typeof body.name !== "undefined") legacyUpdate.name = body.name;
  if (typeof body.price !== "undefined") legacyUpdate.price = body.price;
  if (typeof body.category_id !== "undefined") legacyUpdate.category_id = body.category_id;
  if (typeof body.category !== "undefined" && typeof legacyUpdate.category_id === "undefined") {
    legacyUpdate.category_id = body.category;
  }
  if (typeof body.subcategory !== "undefined") legacyUpdate.subcategory = body.subcategory ?? null;
  if (typeof body.available !== "undefined") legacyUpdate.available = body.available;
  if (typeof body.order !== "undefined") legacyUpdate.order = body.order;

  // jeśli nic nie przyszło do zmiany
  if (Object.keys(legacyUpdate).length === 0) {
    return json({ error: "Brak pól do aktualizacji." }, 400);
  }

  // scope jeśli istnieje restaurant_id w tabeli (może nie istnieć w legacy)
  const q = supabase.from("menu_items").update(legacyUpdate).eq("id", id);
  const { data: d1, error: e1 } = restaurantId
    ? await q.eq("restaurant_id", restaurantId).select().maybeSingle()
    : await q.select().maybeSingle();

  if (!e1) return json(d1);

  // brak kolumny restaurant_id -> retry bez scopu (legacy single-tenant)
  if (restaurantId && isMissingColumn(e1)) {
    const { data: d2, error: e2 } = await supabase
      .from("menu_items")
      .update(legacyUpdate)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (!e2) return json(d2);
    if (!isMissingRelation(e2)) return json({ error: e2.message }, 500);
    // jeśli relacja nie istnieje -> przechodzimy do products
  } else if (!isMissingRelation(e1)) {
    return json({ error: e1.message }, 500);
  }

  // -------- 2) Fallback: `products` (wymaga restaurantId, bo inaczej nie da się bezpiecznie scopić) --------
  if (!restaurantId) {
    return json({ error: "Brak wybranego lokalu (restaurantId)." }, 403);
  }

  const prodUpdate: any = {};

  if (typeof body.name !== "undefined") prodUpdate.name = body.name;

  if (typeof body.price !== "undefined") {
    const cents = toCents(body.price);
    prodUpdate.price_cents = cents;
    // jeśli dalej macie price w DB:
    prodUpdate.price = cents / 100;
  }

  // mapowanie category/subcategory -> subcategory (jak w poprzednim pliku)
  if (typeof body.subcategory !== "undefined") prodUpdate.subcategory = body.subcategory ?? null;
  if (typeof body.category !== "undefined" && typeof prodUpdate.subcategory === "undefined") {
    prodUpdate.subcategory = body.category ?? null;
  }

  if (typeof body.available !== "undefined") prodUpdate.available = body.available;
  if (typeof body.order !== "undefined") prodUpdate.position = body.order;

  const { data: prod, error: prodErr } = await (ctx.supabase as any)
    .from("products")
    .update(prodUpdate)
    .eq("id", id)
    .eq("restaurant_id", restaurantId) // twardy tenant scope
    .select()
    .maybeSingle();

  if (prodErr) return json({ error: prodErr.message }, 500);
  if (!prod) return json({ error: "Nie znaleziono rekordu w tym lokalu." }, 404);

  return json(mapProductToLegacyMenuItem(prod));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const ctx = await requireAdminAndCtx();
  if ("error" in ctx) return ctx.error;

  const supabase = ctx.supabase as any;
  const restaurantId = ctx.restaurantId;

  // -------- 1) Spróbuj legacy `menu_items` --------
  const q = supabase.from("menu_items").delete().eq("id", id);

  const { error: e1 } = restaurantId ? await q.eq("restaurant_id", restaurantId) : await q;

  if (!e1) return json({ success: true });

  // brak kolumny restaurant_id -> retry bez scopu (legacy single-tenant)
  if (restaurantId && isMissingColumn(e1)) {
    const { error: e2 } = await supabase.from("menu_items").delete().eq("id", id);
    if (!e2) return json({ success: true });
    if (!isMissingRelation(e2)) return json({ error: e2.message }, 500);
    // jeśli relacja nie istnieje -> przechodzimy do products
  } else if (!isMissingRelation(e1)) {
    return json({ error: e1.message }, 500);
  }

  // -------- 2) Fallback: `products` --------
  if (!restaurantId) {
    return json({ error: "Brak wybranego lokalu (restaurantId)." }, 403);
  }

  const { error: prodErr } = await (ctx.supabase as any)
    .from("products")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  if (prodErr) return json({ error: prodErr.message }, 500);

  return json({ success: true });
}
