// src/app/api/admin/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { AdminAuthError, requireRestaurantAccess } from "@/lib/requireAdmin";

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

async function getCtx() {
  try {
    return await requireRestaurantAccess(["admin", "employee"]);
  } catch (e: any) {
    if (e instanceof AdminAuthError) throw e;
    throw new AdminAuthError(401, "UNAUTHORIZED", "Unauthorized");
  }
}

const PatchSchema = z.object({
  min_distance_km: z.coerce.number().nonnegative().optional(),
  max_distance_km: z.coerce.number().nonnegative().optional(),
  min_order_value: z.coerce.number().nonnegative().optional(),
  cost: z.coerce.number().nonnegative().optional(),
  free_over: z.coerce.number().nonnegative().nullable().optional(),
  eta_min_minutes: z.coerce.number().int().nonnegative().optional(),
  eta_max_minutes: z.coerce.number().int().nonnegative().optional(),
  cost_fixed: z.coerce.number().nonnegative().optional(),
  cost_per_km: z.coerce.number().nonnegative().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const zoneId = String(id || "").trim();
  if (!zoneId) return json({ error: "Missing id" }, 400);

  let ctx: Awaited<ReturnType<typeof getCtx>>;
  try {
    ctx = await getCtx();
  } catch (e: any) {
    if (e instanceof AdminAuthError) return json({ error: e.message, code: e.code }, e.status);
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Validation", details: parsed.error.format() }, 400);
  }

  const patch: Record<string, any> = { ...parsed.data };
  for (const k of Object.keys(patch)) {
    if (patch[k] === undefined) delete patch[k];
  }
  if (Object.keys(patch).length === 0) {
    return json({ error: "Empty patch" }, 400);
  }

  const { data, error } = await ctx.supabase
    .from("delivery_zones")
    .update(patch)
    .eq("id", zoneId)
    .eq("restaurant_id", ctx.restaurantId)
    .select("*")
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "Not found" }, 404);

  return json({ zone: data }, 200);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const zoneId = String(id || "").trim();
  if (!zoneId) return json({ error: "Missing id" }, 400);

  let ctx: Awaited<ReturnType<typeof getCtx>>;
  try {
    ctx = await getCtx();
  } catch (e: any) {
    if (e instanceof AdminAuthError) return json({ error: e.message, code: e.code }, e.status);
    return json({ error: "Unauthorized" }, 401);
  }

  const { data, error } = await ctx.supabase
    .from("delivery_zones")
    .delete()
    .eq("id", zoneId)
    .eq("restaurant_id", ctx.restaurantId)
    .select("id")
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "Not found" }, 404);

  return json({ ok: true }, 200);
}
