// src/app/api/admin/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getSessionAndRole } from "@/lib/serverAuth";
import type { Database } from "@/types/supabase";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const PatchSchema = z.object({
  min_distance_km: z.number().nonnegative().optional(),
  max_distance_km: z.number().nonnegative().optional(),
  min_order_value: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  free_over: z.number().nonnegative().nullable().optional(),
  eta_min_minutes: z.number().int().nonnegative().optional(),
  eta_max_minutes: z.number().int().nonnegative().optional(),
  cost_fixed: z.number().nonnegative().optional(),
  cost_per_km: z.number().nonnegative().optional(),
});

function getIdFromRequest(request: NextRequest): string | null {
  const segments = request.nextUrl.pathname.split("/");
  const last = segments[segments.length - 1];
  return last || null;
}

export async function PATCH(request: NextRequest) {
  const id = getIdFromRequest(request);
  if (!id) {
    return NextResponse.json({ error: "Brak ID strefy dostawy" }, { status: 400 });
  }

  const { session, role } = await getSessionAndRole();
  if (!session || (role !== "admin" && role !== "employee")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.message },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("delivery_zones")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ zone: data });
}

export async function DELETE(request: NextRequest) {
  const id = getIdFromRequest(request);
  if (!id) {
    return NextResponse.json({ error: "Brak ID strefy dostawy" }, { status: 400 });
  }

  const { session, role } = await getSessionAndRole();
  if (!session || (role !== "admin" && role !== "employee")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabaseAdmin
    .from("delivery_zones")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
