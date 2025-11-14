export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getSessionAndRole } from "@/lib/serverAuth";

const supabaseAdmin = createClient(
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

export async function PATCH(_: Request, { params }: { params: { id: string } }) {
  const { session, role } = await getSessionAndRole();
  if (!session || (role !== "admin" && role !== "employee"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await _.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("delivery_zones")
    .update(parsed.data)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ zone: data });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { session, role } = await getSessionAndRole();
  if (!session || (role !== "admin" && role !== "employee"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabaseAdmin.from("delivery_zones").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
