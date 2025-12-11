// src/app/api/push/subscribe/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type RawSubscription = {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RawSubscription | null;

    if (!body || !body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json(
        { error: "INVALID_SUBSCRIPTION" },
        { status: 400 }
      );
    }

    const ck = await cookies();
    const restaurantId = ck.get("restaurant_id")?.value ?? null;
    const restaurantSlug = ck.get("restaurant_slug")?.value ?? null;

    if (!restaurantId) {
      return NextResponse.json(
        { error: "NO_RESTAURANT" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("admin_push_subscriptions")
      .upsert(
        {
          restaurant_id: restaurantId,
          restaurant_slug: restaurantSlug ?? null,
          endpoint: body.endpoint,
          p256dh: body.keys!.p256dh!,
          auth: body.keys!.auth!,
        },
        { onConflict: "endpoint" } // nie duplikujemy tego samego endpointu
      );

    if (error) {
      console.error("[push.subscribe] upsert error:", error.message);
      return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("[push.subscribe] unexpected", e?.message || e);
    return NextResponse.json(
      { error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
