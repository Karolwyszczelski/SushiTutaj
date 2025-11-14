// Jeśli używasz Pages Routera, analogicznie popraw src/pages/api/settings/tables.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data, error } = await supabase
    .from("restaurant_tables")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  // 1) Odbierz i waliduj payload
  const raw = (await request.json()) as Array<{
    id: string;
    table_number: string;
    number_of_seats: number;
    x: number;
    y: number;
  }>;

  const payload = raw.map((t, idx) => ({
    id: t.id,
    table_number: t.table_number?.trim() || `Stolik ${idx + 1}`,
    number_of_seats: t.number_of_seats > 0 ? t.number_of_seats : 4,
    x: t.x ?? 0,
    y: t.y ?? 0,
  }));

  // 2) Usuń stoliki skasowane w UI
  const ids = payload.map((t) => t.id);
  if (ids.length) {
    await supabase
      .from("restaurant_tables")
      .delete()
      .not("id", "in", `(${ids.map((i) => `'${i}'`).join(",")})`);
  }

  // 3) Upsert (dodaj lub aktualizuj)
  const { data, error } = await supabase
    .from("restaurant_tables")
    .upsert(payload, { onConflict: "id" })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
