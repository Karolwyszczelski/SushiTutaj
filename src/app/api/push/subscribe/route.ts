export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@/types/supabase";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function normSlug(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s ? s : null;
}

export async function POST(req: Request) {
  try {
    // 1) Auth (żeby endpoint nie był publiczny)
    const supabase = createRouteHandlerClient<Database>({ cookies });

    let session: any = null;
    try {
      const { data } = await supabase.auth.getSession();
      session = data?.session ?? null;
    } catch {
      session = null;
    }

    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // 2) Body
    const body = await req.json().catch(() => null);

    // wspieramy:
    // 1) legacy: { endpoint, keys, ... }
    // 2) wrapper: { subscription: { endpoint, keys, ... }, restaurant_slug?: string }
    const subscription = (body && (body.subscription ?? body)) as any;
    const bodyRestaurantSlug = normSlug(body?.restaurant_slug);

    if (!subscription || typeof subscription !== "object" || !subscription.endpoint) {
      return NextResponse.json({ error: "INVALID_SUBSCRIPTION" }, { status: 400 });
    }

    // 3) Resolve restauracji: preferuj slug z body > cookie
    const ck = await cookies();
    const cookieRid = ck.get("restaurant_id")?.value ?? null;
    const cookieSlug = normSlug(ck.get("restaurant_slug")?.value);

    let restaurantId: string | null = cookieRid;
    let restaurantSlug: string | null = null;

    const slugToResolve = bodyRestaurantSlug || cookieSlug;

    if (slugToResolve) {
      const { data, error } = await supabaseAdmin
        .from("restaurants")
        .select("id, slug")
        .eq("slug", slugToResolve)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: "RESTAURANT_LOOKUP_ERROR" }, { status: 500 });
      }
      if (!data?.id) {
        return NextResponse.json({ error: "UNKNOWN_RESTAURANT" }, { status: 404 });
      }

      restaurantId = data.id;
      restaurantSlug = (data.slug || slugToResolve).toLowerCase();
    } else if (restaurantId) {
      // jeśli mamy tylko cookie rid, dociągnij slug (opcjonalnie)
      const { data } = await supabaseAdmin
        .from("restaurants")
        .select("slug")
        .eq("id", restaurantId)
        .maybeSingle();
      restaurantSlug = normSlug(data?.slug) || null;
    }

    if (!restaurantId) {
      return NextResponse.json({ error: "MISSING_RESTAURANT" }, { status: 400 });
    }

    // 4) Walidacja, czy user jest adminem tej restauracji
    // (używamy service role, ale sprawdzamy userId z sesji)
    const { data: ra, error: raErr } = await supabaseAdmin
      .from("restaurant_admins")
      .select("restaurant_id")
      .eq("user_id", userId)
      .eq("restaurant_id", restaurantId)
      .limit(1);

    if (raErr) {
      return NextResponse.json({ error: "ACCESS_CHECK_ERROR" }, { status: 500 });
    }
    if (!ra || ra.length === 0) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // 5) Upsert subskrypcji (zapisz też keys: p256dh/auth jeśli masz takie kolumny)
    const keys = (subscription as any)?.keys || {};
const p256dh = typeof subscription?.keys?.p256dh === "string" ? subscription.keys.p256dh : null;
const auth = typeof subscription?.keys?.auth === "string" ? subscription.keys.auth : null;


const { error } = await supabaseAdmin
  .from("admin_push_subscriptions")
  .upsert(
    {
      restaurant_id: restaurantId,
      restaurant_slug: restaurantSlug, // OK jeśli kolumna istnieje
      endpoint: subscription.endpoint,
      subscription, // jsonb
      p256dh,        // jeśli kolumny istnieją
      auth,          // jeśli kolumny istnieją
    },
    { onConflict: "restaurant_id,endpoint" }
  );

if (error) {
  console.error("[push.subscribe] upsert error:", error.message);
  return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
}

return NextResponse.json({ ok: true }, { status: 200 });

  } catch (e: any) {
    console.error("[push.subscribe] unexpected:", e?.message || e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
