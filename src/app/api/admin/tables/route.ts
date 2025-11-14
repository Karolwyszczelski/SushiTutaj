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

// To samo, czego oczekuje TableLayoutForm (mapka)
const TableRow = z.object({
  id: z.string().uuid().optional(),
  table_number: z.string().min(1),
  name: z.string().nullable().optional(),
  x: z.number(),
  y: z.number(),
  number_of_seats: z.number().int().min(1),
});

export async function GET() {
  const { session, role } = await getSessionAndRole();
  if (!session || (role !== "admin" && role !== "employee"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("restaurant_tables")
    .select("*")
    .order("table_number", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tables: data ?? [] });
}

export async function POST(req: Request) {
  const { session, role } = await getSessionAndRole();
  if (!session || (role !== "admin" && role !== "employee"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = TableRow.safeParse({
    ...json,
    x: Number(json?.x),
    y: Number(json?.y),
    number_of_seats: Number(json?.number_of_seats ?? json?.seats),
  });
  if (!parsed.success)
    return NextResponse.json({ error: "Validation", details: parsed.error.format() }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("restaurant_tables")
    .insert(parsed.data)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ table: data });
}
