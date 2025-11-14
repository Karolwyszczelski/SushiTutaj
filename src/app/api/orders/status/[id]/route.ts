export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verify } from "@/lib/orderLink";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  // wymagamy podpisu ?t=
  const url = new URL(req.url);
  const t = url.searchParams.get("t") || "";
  if (!verify(id, t)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(`
      id,status,eta,deliveryTime,
      selected_option,total_price,created_at,
      client_delivery_time,payment_status,payment_method
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[status.get] db error:", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const etaFinal: string | null = (data as any).eta ?? (data as any).deliveryTime ?? null;

  return NextResponse.json({
    id: data.id,
    status: data.status,
    eta: etaFinal,
    option: (data as any).selected_option,
    total: (data as any).total_price,
    placedAt: data.created_at,
    clientRequestedTime: (data as any).client_delivery_time,
    payment_status: (data as any).payment_status,
    payment_method: (data as any).payment_method,
  });
}
