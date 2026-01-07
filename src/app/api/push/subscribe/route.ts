export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { pushLogger } from "@/lib/logger";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

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
    // Next.js 15: cookies() musi być await'owane
    const cookieStore = await cookies();
    
    // 1) Auth (żeby endpoint nie był publiczny)
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

    let user: any = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data?.user ?? null;
    } catch {
      user = null;
    }

    const userId = user?.id as string | undefined;
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

    // 3) Resolve restauracji: preferuj slug z body > cookie (cookieStore już await'owane na górze)
    const cookieRid = cookieStore.get("restaurant_id")?.value ?? null;
    const cookieSlug = normSlug(cookieStore.get("restaurant_slug")?.value);

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

   // 5) Upsert subskrypcji
const p256dh =
  typeof (subscription as any)?.keys?.p256dh === "string"
    ? (subscription as any).keys.p256dh
    : null;

const auth =
  typeof (subscription as any)?.keys?.auth === "string"
    ? (subscription as any).keys.auth
    : null;

const { error } = await supabaseAdmin
  .from("admin_push_subscriptions")
  .upsert(
    {
      restaurant_id: restaurantId,
      restaurant_slug: restaurantSlug,
      endpoint: subscription.endpoint,
      subscription,
      p256dh,
      auth,
    },
    // endpoint jest unikalny globalnie → aktualizujemy wpis dla tego endpointu
    { onConflict: "endpoint" }
  );


if (error) {
  pushLogger.error("upsert error", { error: error.message });
  // DEV: pokaż dokładniej, PROD: nie wypluwaj szczegółów
  const dev = process.env.NODE_ENV !== "production";
  return NextResponse.json(
    { error: "DB_ERROR", detail: dev ? error.message : undefined },
    { status: 500 }
  );
}

return NextResponse.json({ ok: true }, { status: 200 });


  } catch (e: any) {
    pushLogger.error("unexpected error", { error: e?.message || e });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
