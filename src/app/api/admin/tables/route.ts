// src/app/api/admin/tables/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { requireRestaurantAccess, AdminAuthError } from "@/lib/requireAdmin";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, detectSessionInUrl: false } }
);

function res(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const toNumOrNull = (v: any) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET() {
  try {
    const ctx = await requireRestaurantAccess(["owner", "admin"]);

    const { data, error } = await supabaseAdmin
      .from("restaurant_tables")
      .select(
        "id,restaurant_id,name,label,x,y,w,h,rotation,seats,capacity,active,created_at,updated_at"
      )
      .eq("restaurant_id", ctx.restaurantId)
      .order("name", { ascending: true });

    if (error) return res({ error: error.message }, 500);
    return res({ items: data ?? [] }, 200);
  } catch (e: any) {
    if (e instanceof AdminAuthError) {
      return res({ error: e.code, message: e.message }, e.status);
    }
    return res({ error: "INTERNAL_ERROR" }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireRestaurantAccess(["owner", "admin"]);
    const body = (await req.json().catch(() => null)) as any;
    if (!body) return res({ error: "BAD_REQUEST" }, 400);

    // kompatybilność: przyjmujemy też stare nazwy pól
    const name = String(body.name ?? "").trim();
    if (!name) return res({ error: "INVALID_NAME" }, 400);

    const payload = {
      restaurant_id: ctx.restaurantId,
      name,
      label: body.label != null ? String(body.label) : null,

      // nowe pola (x/y/w/h/rotation/active/capacity) + fallback na stare (position_x/position_y/is_active)
      x: toNumOrNull(body.x ?? body.position_x) ?? 0,
      y: toNumOrNull(body.y ?? body.position_y) ?? 0,
      w: toNumOrNull(body.w) ?? 80,
      h: toNumOrNull(body.h) ?? 80,
      rotation: toNumOrNull(body.rotation) ?? 0,

      seats: toNumOrNull(body.seats) ?? 2,
      capacity: toNumOrNull(body.capacity) ?? null,
      active:
        typeof body.active === "boolean"
          ? body.active
          : typeof body.is_active === "boolean"
          ? body.is_active
          : true,
    };

    const { data, error } = await supabaseAdmin
      .from("restaurant_tables")
      .insert(payload as any)
      .select(
        "id,restaurant_id,name,label,x,y,w,h,rotation,seats,capacity,active,created_at,updated_at"
      )
      .maybeSingle();

    if (error) return res({ error: error.message }, 500);
    return res({ ok: true, row: data }, 200);
  } catch (e: any) {
    if (e instanceof AdminAuthError) {
      return res({ error: e.code, message: e.message }, e.status);
    }
    return res({ error: "INTERNAL_ERROR" }, 500);
  }
}
