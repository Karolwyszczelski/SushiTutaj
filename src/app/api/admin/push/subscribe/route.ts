export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

function makeRes(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as PushSubscriptionJSON | null;

    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      return makeRes({ error: "INVALID_SUBSCRIPTION" }, 400);
    }

    // 1) wymuś zalogowanie (żeby nikt z zewnątrz nie spamował tabeli)
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const userId = session?.user?.id ?? null;
    if (!userId) {
      return makeRes({ error: "Unauthorized" }, 401);
    }

    // 2) spróbuj wziąć restaurant_id z cookie
    const ck = await cookies();
    let restaurantId = ck.get("restaurant_id")?.value ?? null;
    let restaurantSlug = ck.get("restaurant_slug")?.value ?? null;

    // 3) Jeśli cookie brak: nie zgadujemy przy wielu lokalach (bo to przepina endpoint do złej restauracji).
//    Fallback tylko gdy admin ma dokładnie 1 lokal.
if (!restaurantId) {
  const { data: rows, error } = await supabase
    .from("restaurant_admins")
    .select("restaurant_id")
    .eq("user_id", userId);

  if (error) return makeRes({ error: error.message }, 500);

  const unique = Array.from(
    new Set((rows as any[] | null | undefined)?.map((r) => r.restaurant_id).filter(Boolean))
  ) as string[];

  if (unique.length === 1) {
    restaurantId = unique[0]!;
  } else {
    return makeRes({ error: "NO_RESTAURANT_COOKIE" }, 409);
  }
}


    if (!restaurantId) {
      return makeRes({ error: "NO_RESTAURANT" }, 400);
    }

    // 4) jeśli slug brak — dociągnij po id
    if (!restaurantSlug) {
      const { data: r, error } = await supabase
        .from("restaurants")
        .select("slug")
        .eq("id", restaurantId)
        .limit(1)
        .maybeSingle<{ slug: string | null }>();

      if (error) return makeRes({ error: error.message }, 500);
      restaurantSlug = r?.slug?.toLowerCase() ?? null;
    }

    // 5) zapis: NAJWAŻNIEJSZE -> wypełnij `subscription` (bo wysyłka tego używa)
    const { error: upsertError } = await supabaseAdmin
      .from("admin_push_subscriptions")
      .upsert(
        {
          restaurant_id: restaurantId,
          restaurant_slug: restaurantSlug,
          endpoint: body.endpoint,
          subscription: body, // <— krytyczne
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
        } as any,
        { onConflict: "endpoint" }
      );

    if (upsertError) {
      console.error("[push.subscribe] upsert error:", upsertError.message);
      return makeRes({ error: "DB_ERROR" }, 500);
    }

    return makeRes(
      {
        ok: true,
        restaurant_id: restaurantId,
        restaurant_slug: restaurantSlug,
      },
      200
    );
  } catch (e: any) {
    console.error("[push.subscribe] unexpected", e?.message || e);
    return makeRes({ error: "INTERNAL_ERROR" }, 500);
  }
}
