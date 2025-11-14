// /src/app/api/reservations/assign-table/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: Request) {
  try {
    const { reservation_id, table_ref, table_label } = await req.json();
    if (!reservation_id || !table_ref) {
      return NextResponse.json({ error: "reservation_id i table_ref są wymagane" }, { status: 400 });
    }

    const { error, data } = await supabaseAdmin
      .from("reservations")
      .update({ table_ref: String(table_ref), table_label: table_label ?? null })
      .eq("id", reservation_id)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, reservation: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
