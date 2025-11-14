// /src/app/api/table-layout/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// pobiera restaurant_id z cookie ustawianego przez /api/restaurants/ensure-cookie
async function getRestaurantId(): Promise<string | null> {
  const jar = cookies();
  const rid = jar.get("restaurant_id")?.value || null;
  if (rid) return rid;

  const slug = jar.get("restaurant_slug")?.value || null;
  if (!slug) return null;
  const { data } = await supabaseAdmin.from("restaurants").select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}

export async function GET() {
  try {
    const restaurant_id = await getRestaurantId();
    if (!restaurant_id) return NextResponse.json({ error: "Brak restauracji w cookie" }, { status: 400 });

    // bierzemy „default”, jeśli brak – utwórz pusty szkic
    const { data } = await supabaseAdmin
      .from("table_layouts")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .eq("name", "default")
      .maybeSingle();

    if (data) return NextResponse.json({ layout: data });

    const empty = { restaurant_id, name: "default", active: true, plan: [] };
    const ins = await supabaseAdmin.from("table_layouts").insert(empty).select("*").single();
    if (ins.error) throw ins.error;
    return NextResponse.json({ layout: ins.data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const restaurant_id = await getRestaurantId();
    if (!restaurant_id) return NextResponse.json({ error: "Brak restauracji w cookie" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const planIn = Array.isArray(body?.plan) ? body.plan : [];
    const active = Boolean(body?.active ?? true);
    const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "default";

    // sanity – tylko potrzebne pola
    const plan = planIn.map((t: any) => ({
      id: String(t.id || crypto.randomUUID()),
      label: String(t.label ?? t.name ?? "Stół"),
      x: Math.max(0, Math.round(Number(t.x) || 0)),
      y: Math.max(0, Math.round(Number(t.y) || 0)),
      w: Math.max(44, Math.round(Number(t.w) || 90)),
      h: Math.max(44, Math.round(Number(t.h) || 90)),
      rotation: Math.round(Number(t.rotation ?? t.rot ?? 0)) % 360,
      capacity: Math.max(1, Math.round(Number(t.capacity ?? t.seats ?? 2))),
      active: Boolean(t.active ?? true),
    }));

    const up = await supabaseAdmin
      .from("table_layouts")
      .upsert(
        { restaurant_id, name, active, plan },
        { onConflict: "restaurant_id,name", ignoreDuplicates: false }
      )
      .select("*")
      .single();

    if (up.error) throw up.error;
    return NextResponse.json({ ok: true, layout: up.data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
