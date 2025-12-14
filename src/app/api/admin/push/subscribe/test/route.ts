export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";
import { sendPushForRestaurant } from "@/lib/push";

type Body = {
  title?: string;
  body?: string;
  url?: string;
};

function res(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  try {
    // 1) auth
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const userId = session?.user?.id ?? null;
    if (!userId) return res({ error: "Unauthorized" }, 401);

    // 2) restaurant z cookie
    const ck = await cookies();
    let restaurantId = ck.get("restaurant_id")?.value ?? null;

    // 3) fallback: pierwszy lokal admina
    if (!restaurantId) {
      const { data: row, error } = await supabase
        .from("restaurant_admins")
        .select("restaurant_id")
        .eq("user_id", userId)
        .order("added_at", { ascending: true })
        .limit(1)
        .maybeSingle<{ restaurant_id: string }>();

      if (error) return res({ error: error.message }, 500);
      restaurantId = row?.restaurant_id ?? null;
    }

    if (!restaurantId) return res({ error: "NO_RESTAURANT" }, 400);

    // 4) payload
    const b = (await req.json().catch(() => null)) as Body | null;

    await sendPushForRestaurant(restaurantId, {
      type: "test",
      title: b?.title ?? "Test powiadomień",
      body: b?.body ?? "Jeśli to widzisz — push działa.",
      url: b?.url ?? "/admin/pickup-order",
    });

    return res({ ok: true, restaurant_id: restaurantId }, 200);
  } catch (e: any) {
    console.error("[push.test] unexpected", e?.message || e);
    return res({ error: "INTERNAL_ERROR" }, 500);
  }
}
