// src/app/api/admin/push/test/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { sendPushForRestaurant } from "@/lib/push";

// Service role client - omija RLS dla restaurant_admins
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, detectSessionInUrl: false } }
);

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function resolveRestaurantForUser(
  userId: string,
  cookieStore: Awaited<ReturnType<typeof cookies>>
): Promise<{ restaurantId: string; restaurantSlug: string | null } | null> {
  // 1) cookie
  let restaurantId = cookieStore.get("restaurant_id")?.value ?? null;
  let restaurantSlug = cookieStore.get("restaurant_slug")?.value ?? null;

  // 2) fallback: pierwszy lokal admina (używamy supabaseAdmin żeby ominąć RLS)
  if (!restaurantId) {
    const { data: row, error } = await supabaseAdmin
      .from("restaurant_admins")
      .select("restaurant_id")
      .eq("user_id", userId)
      .order("added_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    restaurantId = (row as any)?.restaurant_id ?? null;
  }

  if (!restaurantId) return null;

  // 3) slug fallback
  if (!restaurantSlug) {
    const { data: r, error } = await supabaseAdmin
      .from("restaurants")
      .select("slug")
      .eq("id", restaurantId)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    restaurantSlug = (r as any)?.slug?.toLowerCase() ?? null;
  }

  return { restaurantId, restaurantSlug };
}

async function run(req: Request) {
  // Next.js 15: cookies() musi być await'owane
  const cookieStore = await cookies();
  
  // auth
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user?.id ?? null;
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const resolved = await resolveRestaurantForUser(userId, cookieStore);
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
