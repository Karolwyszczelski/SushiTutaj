export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, detectSessionInUrl: false } }
);

const ALLOWED_KEYS = new Set([
  "ramune",
  "bubble_tea",
  "juice",
  "lipton",
  "cola",
  "water",
  "gyoza",
  "sushi_specjal",
]);

function clean(s: unknown, max = 64) {
  return String(s ?? "")
    .trim()
    .slice(0, max);
}

async function requireSession() {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { data } = await supabase.auth.getSession();
  if (!data?.session) return null;
  return data.session;
}

async function resolveRestaurantIdBySlug(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id as string;
}

export async function GET(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const restaurantSlug = clean(searchParams.get("restaurant"), 128);
  if (!restaurantSlug) {
    return NextResponse.json({ error: "Missing restaurant" }, { status: 400 });
  }

  const restaurantId = await resolveRestaurantIdBySlug(restaurantSlug);
  if (!restaurantId) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("restaurant_addon_options" as any)
    .select("id, group_key, value, active, sort, created_at")
    .eq("restaurant_id", restaurantId)
    .order("group_key", { ascending: true })
    .order("sort", { ascending: true })
    .order("value", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const restaurantSlug = clean(body.restaurantSlug, 128);
  const group_key = clean(body.group_key, 32);
  const value = clean(body.value, 64);
  const active = body.active === false ? false : true;

  if (!restaurantSlug) {
    return NextResponse.json({ error: "Missing restaurantSlug" }, { status: 400 });
  }
  if (!ALLOWED_KEYS.has(group_key)) {
    return NextResponse.json({ error: "Invalid group_key" }, { status: 400 });
  }
  if (!value) {
    return NextResponse.json({ error: "Missing value" }, { status: 400 });
  }

  const restaurantId = await resolveRestaurantIdBySlug(restaurantSlug);
  if (!restaurantId) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("restaurant_addon_options" as any)
    .insert({
      restaurant_id: restaurantId,
      group_key,
      value,
      active,
      sort: 100,
    })
    .select("id, group_key, value, active, sort, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = clean(body.id, 64);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const patch: any = {};
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.sort === "number" && Number.isFinite(body.sort)) patch.sort = body.sort;

  const { data, error } = await supabaseAdmin
    .from("restaurant_addon_options" as any)
    .update(patch)
    .eq("id", id)
    .select("id, group_key, value, active, sort, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = clean(searchParams.get("id"), 64);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabaseAdmin
  .from("restaurant_addon_options" as any)
  .delete()
  .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
