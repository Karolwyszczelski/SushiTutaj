import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data, error } = await sb
    .from("delivery_zones")
    .select("*")
    .order("min_distance_km", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const zones = (await req.json()) as Array<{
    id?: string;
    min_distance_km: number;
    max_distance_km: number;
    min_order_value: number;
    cost: number;
    free_over: number | null;
    eta_min_minutes: number;
    eta_max_minutes: number;
    cost_fixed: number;
    cost_per_km: number;
  }>;

  // usuń usunięte
  const ids = zones.filter(z => z.id).map(z => `'${z.id}'`).join(",");
  if (ids) {
    await sb
      .from("delivery_zones")
      .delete()
      .not("id", "in", `(${ids})`);
  }

  // upsert
  const { error, data } = await sb
    .from("delivery_zones")
    .upsert(zones, { onConflict: "id" })
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
