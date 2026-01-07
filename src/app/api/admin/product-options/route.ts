// src/app/api/admin/product-options/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { AdminAuthError, requireRestaurantAccess } from "@/lib/requireAdmin";

const ALLOWED_KEYS = [
  "ramune",
  "bubble_tea",
  "juice",
  "lipton",
  "cola",
  "water",
  "gyoza",
  "sushi_specjal",
] as const;

const AllowedKey = z.enum(ALLOWED_KEYS);

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

const CreateBody = z
  .object({
    // legacy/kompatybilność – ignorujemy w logice (restaurant bierzemy z ctx)
    restaurantSlug: z.string().optional(),
    restaurant: z.string().optional(),

    group_key: AllowedKey,
    value: z.string().min(1).max(64),
    active: z.boolean().optional(),
  })
  .strict();

const PatchBody = z
  .object({
    id: z.string().min(1).max(64),
    active: z.boolean().optional(),
    sort: z.number().finite().optional(),
  })
  .strict();

function cleanId(v: unknown, max = 64) {
  return String(v ?? "").trim().slice(0, max);
}

async function getCtx() {
  try {
    return await requireRestaurantAccess(["admin", "employee"]);
  } catch (e: any) {
    if (e instanceof AdminAuthError) {
      throw e;
    }
    throw new AdminAuthError(401, "UNAUTHORIZED", "Unauthorized");

  }
}

export async function GET(_req: Request) {
  try {
    const ctx = await getCtx();

    const { data, error } = await ctx.supabase
      .from("restaurant_addon_options" as any)
      .select("id, group_key, value, active, sort, created_at")
      .eq("restaurant_id", ctx.restaurantId)
      .order("group_key", { ascending: true })
      .order("sort", { ascending: true })
      .order("value", { ascending: true });

    if (error) return json({ error: error.message }, 500);
    return json({ items: data || [] }, 200);
  } catch (e: any) {
    if (e instanceof AdminAuthError) return json({ error: e.message, code: e.code }, e.status);
    return json({ error: "Unauthorized" }, 401);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getCtx();

    const bodyRaw = await req.json().catch(() => ({}));
    const parsed = CreateBody.safeParse(bodyRaw);
    if (!parsed.success) {
      return json({ error: "Validation", details: parsed.error.format() }, 400);
    }

    const group_key = parsed.data.group_key;
    const value = parsed.data.value.trim();
    const active = parsed.data.active === false ? false : true;

    const { data, error } = await ctx.supabase
      .from("restaurant_addon_options" as any)
      .insert({
        restaurant_id: ctx.restaurantId,
        group_key,
        value,
        active,
        sort: 100,
      })
      .select("id, group_key, value, active, sort, created_at")
      .single();

    if (error) return json({ error: error.message }, 400);
    return json({ item: data }, 201);
  } catch (e: any) {
    if (e instanceof AdminAuthError) return json({ error: e.message, code: e.code }, e.status);
    return json({ error: "Unauthorized" }, 401);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await getCtx();

    const bodyRaw = await req.json().catch(() => ({}));
    const parsed = PatchBody.safeParse(bodyRaw);
    if (!parsed.success) {
      return json({ error: "Validation", details: parsed.error.format() }, 400);
    }

    const id = cleanId(parsed.data.id, 64);
    if (!id) return json({ error: "Missing id" }, 400);

    const patch: Record<string, any> = {};
    if (typeof parsed.data.active === "boolean") patch.active = parsed.data.active;
    if (typeof parsed.data.sort === "number" && Number.isFinite(parsed.data.sort)) {
      patch.sort = parsed.data.sort;
    }

    if (Object.keys(patch).length === 0) {
      return json({ error: "Nothing to update" }, 400);
    }

    const { data, error } = await ctx.supabase
      .from("restaurant_addon_options" as any)
      .update(patch)
      .eq("id", id)
      .eq("restaurant_id", ctx.restaurantId)
      .select("id, group_key, value, active, sort, created_at")
      .maybeSingle();

    if (error) return json({ error: error.message }, 400);
    if (!data) return json({ error: "Not found" }, 404);

    return json({ item: data }, 200);
  } catch (e: any) {
    if (e instanceof AdminAuthError) return json({ error: e.message, code: e.code }, e.status);
    return json({ error: "Unauthorized" }, 401);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getCtx();

    const { searchParams } = new URL(req.url);
    const id = cleanId(searchParams.get("id"), 64);
    if (!id) return json({ error: "Missing id" }, 400);

    const { error, count } = await ctx.supabase
      .from("restaurant_addon_options" as any)
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("restaurant_id", ctx.restaurantId);

    if (error) return json({ error: error.message }, 400);
    if (!count) return json({ error: "Not found" }, 404);

    return json({ ok: true }, 200);
  } catch (e: any) {
    if (e instanceof AdminAuthError) return json({ error: e.message, code: e.code }, e.status);
    return json({ error: "Unauthorized" }, 401);
  }
}
