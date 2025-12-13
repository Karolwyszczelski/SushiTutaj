export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, detectSessionInUrl: false } }
);

const isTime = (v: any) =>
  typeof v === "string" && /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v);

const makeKeys = (scope: "global" | "restaurant", restaurantSlug?: string | null) => {
  if (scope === "global") return { key: "global", restaurant_slug: "__global__" };
  const slug = (restaurantSlug || "").toLowerCase().trim();
  return { key: `restaurant:${slug}`, restaurant_slug: slug };
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const restaurant = (searchParams.get("restaurant") || "").toLowerCase() || null;

  const g = await supabaseAdmin.from("notice_bars").select("*").eq("key", "global").maybeSingle();
  const rKey = restaurant ? `restaurant:${restaurant}` : null;

  const r = rKey
    ? await supabaseAdmin.from("notice_bars").select("*").eq("key", rKey).maybeSingle()
    : { data: null };

  return NextResponse.json({
    global: g.data ?? null,
    restaurant: r.data ?? null,
  });
}

export async function POST(req: Request) {
  // auth check (wystarczy, że user jest zalogowany w panelu)
  const supa = createRouteHandlerClient({ cookies });
  const { data: sess } = await supa.auth.getSession();
  if (!sess?.session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as any;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const scope = body.scope === "global" ? "global" : "restaurant";
  const restaurantSlug = body.restaurantSlug ?? body.restaurant_slug ?? null;

  if (scope === "restaurant" && (!restaurantSlug || typeof restaurantSlug !== "string")) {
    return NextResponse.json({ error: "Missing restaurantSlug" }, { status: 400 });
  }

  if (!isTime(body.open_time)) {
    return NextResponse.json({ error: "Invalid open_time (HH:MM)" }, { status: 400 });
  }
  if (body.close_time != null && body.close_time !== "" && !isTime(body.close_time)) {
    return NextResponse.json({ error: "Invalid close_time (HH:MM)" }, { status: 400 });
  }

  const { key, restaurant_slug } = makeKeys(scope, restaurantSlug);

  const payload = {
    key,
    scope,
    restaurant_slug,
    enabled: !!body.enabled,
    open_time: body.open_time,
    close_time: body.close_time ? body.close_time : null,
    message_pre_open: String(body.message_pre_open || ""),
    message_post_close: String(body.message_post_close || ""),
  };

  const { data, error } = await supabaseAdmin
    .from("notice_bars")
    .upsert(payload, { onConflict: "key" })
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, row: data });
}
