// src/app/api/admin/push/test/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";
import { sendPushForRestaurant } from "@/lib/push";

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function resolveRestaurantForUser(
  supabase: ReturnType<typeof createRouteHandlerClient<Database>>,
  userId: string
): Promise<{ restaurantId: string; restaurantSlug: string | null } | null> {
  // 1) cookie
  const ck = await cookies();
  let restaurantId = ck.get("restaurant_id")?.value ?? null;
  let restaurantSlug = ck.get("restaurant_slug")?.value ?? null;

  // 2) fallback: pierwszy lokal admina
  if (!restaurantId) {
    const { data: row, error } = await supabase
      .from("restaurant_admins")
      .select("restaurant_id")
      .eq("user_id", userId)
      .order("added_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ restaurant_id: string }>();

    if (error) throw error;
    restaurantId = row?.restaurant_id ?? null;
  }

  if (!restaurantId) return null;

  // 3) slug fallback
  if (!restaurantSlug) {
    const { data: r, error } = await supabase
      .from("restaurants")
      .select("slug")
      .eq("id", restaurantId)
      .limit(1)
      .maybeSingle<{ slug: string | null }>();

    if (error) throw error;
    restaurantSlug = r?.slug?.toLowerCase() ?? null;
  }

  return { restaurantId, restaurantSlug };
}

async function run(req: Request) {
  // auth
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user?.id ?? null;
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const resolved = await resolveRestaurantForUser(supabase, userId);
  if (!resolved) return json({ error: "NO_RESTAURANT" }, 400);

  // payload: GET z query albo POST z body
  let title = "TEST: Nowe zamówienie";
  let body = "Jeśli to widzisz, push działa ✅";
  let url = "/admin/pickup-order";

  if (req.method === "GET") {
    const u = new URL(req.url);
    title = u.searchParams.get("title") || title;
    body = u.searchParams.get("body") || body;
    url = u.searchParams.get("url") || url;
  } else {
    const j = await req.json().catch(() => null);
    if (j && typeof j === "object") {
      if (typeof j.title === "string") title = j.title;
      if (typeof j.body === "string") body = j.body;
      if (typeof j.url === "string") url = j.url;
    }
  }

  await sendPushForRestaurant(resolved.restaurantId, { title, body, url });

  return json({
    ok: true,
    sent: true,
    restaurant_id: resolved.restaurantId,
    restaurant_slug: resolved.restaurantSlug,
    payload: { title, body, url },
  });
}

export async function GET(req: Request) {
  try {
    return await run(req);
  } catch (e: any) {
    return json({ error: e?.message || "INTERNAL_ERROR" }, 500);
  }
}

export async function POST(req: Request) {
  try {
    return await run(req);
  } catch (e: any) {
    return json({ error: e?.message || "INTERNAL_ERROR" }, 500);
  }
}
