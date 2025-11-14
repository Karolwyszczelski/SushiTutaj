export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSessionAndRole } from "@/lib/serverAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const Patch = z.object({
  table_number: z.string().min(1).optional(),
  name: z.string().nullable().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  number_of_seats: z.number().int().min(1).optional(),
  // stary frontend czasem wysyła "seats"
  seats: z.number().int().min(1).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, role } = await getSessionAndRole();
  if (!session || (role !== "admin" && role !== "employee"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const raw = {
    ...json,
    x: json.x !== undefined ? Number(json.x) : undefined,
    y: json.y !== undefined ? Number(json.y) : undefined,
    number_of_seats:
      json.number_of_seats !== undefined ? Number(json.number_of_seats)
      : json.seats !== undefined ? Number(json.seats)
      : undefined,
  };
  const parsed = Patch.safeParse(raw);
  if (!parsed.success)
    return NextResponse.json({ error: "Validation", details: parsed.error.format() }, { status: 400 });

  const patch: any = { ...parsed.data };
  delete patch.seats;

  const { data, error } = await supabaseAdmin
    .from("restaurant_tables")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ table: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, role } = await getSessionAndRole();
  if (!session || (role !== "admin" && role !== "employee"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabaseAdmin.from("restaurant_tables").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
