// src/app/api/admin/tables/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/supabase";
import { getAdminContext } from "@/lib/adminContext";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const Patch = z
  .object({
    label: z.string().min(1).optional(),
    name: z.string().nullable().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    number_of_seats: z.number().int().min(1).optional(),
    // kompatybilność ze starym frontendem
    seats: z.number().int().min(1).optional(),
  })
  .strict();

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

function isUuid(v?: string | null): boolean {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

async function requireRestaurantAccess(
  roles: Array<"admin" | "employee" | "owner" | "manager"> = ["admin", "employee"]
) {
  try {
    const ctx = await getAdminContext(); // { supabase, user, restaurantId }

    // Używamy supabaseAdmin (service role) żeby ominąć RLS przy sprawdzaniu roli
    const { data, error } = await supabaseAdmin
      .from("restaurant_admins")
      .select("role")
      .eq("user_id", ctx.user.id)
      .eq("restaurant_id", ctx.restaurantId)
      .maybeSingle();

    if (error) return { ok: false as const, status: 500, error: "Server error" };
    const role = ((data as any)?.role as string | null)?.toLowerCase() ?? null;

    if (!role || !roles.includes(role as any)) {
      return { ok: false as const, status: 403, error: "Forbidden" };
    }

    return { ok: true as const, ...ctx, role };
  } catch {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
}

// literalna ścieżka route'a: /api/admin/tables/[id]

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return json({ error: "Invalid id" }, 400);

  const access = await requireRestaurantAccess(["admin", "employee"]);
  if (!access.ok) return json({ error: access.error }, access.status);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Invalid JSON" }, 400);

  const raw: any = {
    ...body,
    x: body.x !== undefined ? Number(body.x) : undefined,
    y: body.y !== undefined ? Number(body.y) : undefined,
    number_of_seats:
      body.number_of_seats !== undefined
        ? Number(body.number_of_seats)
        : body.seats !== undefined
        ? Number(body.seats)
        : undefined,
  };

  const parsed = Patch.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "Validation", details: parsed.error.format() }, 400);
  }

  const patch: Record<string, unknown> = { ...parsed.data };
  delete (patch as any).seats;

  if (Object.keys(patch).length === 0) {
    return json({ error: "Nothing to update" }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from("restaurant_tables")
    .update(patch)
    .eq("id", id)
    .eq("restaurant_id", access.restaurantId)
    .select()
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "Not found" }, 404);

  return json({ table: data }, 200);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return json({ error: "Invalid id" }, 400);

  const access = await requireRestaurantAccess(["admin", "employee"]);
  if (!access.ok) return json({ error: access.error }, access.status);

  const { error, count } = await supabaseAdmin
    .from("restaurant_tables")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("restaurant_id", access.restaurantId);

  if (error) return json({ error: error.message }, 500);
  if (!count) return json({ error: "Not found" }, 404);

  return json({ ok: true }, 200);
}
