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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object" || !("endpoint" in body)) {
      return NextResponse.json(
        { error: "INVALID_SUBSCRIPTION" },
        { status: 400 }
      );
    }

    const subscription = body as any;

    // bierzemy restaurację z httpOnly cookie ustawionego przez /api/restaurants/ensure-cookie
    const ck = await cookies();
    const restaurantId = ck.get("restaurant_id")?.value ?? null;
    const restaurantSlug = ck.get("restaurant_slug")?.value ?? null;

    // nawet jak brak restaurant_id, i tak zapisujemy – ale warto zalogować
    if (!restaurantId) {
      console.warn("[push.subscribe] brak restaurant_id w cookie");
    }

    const { error } = await supabaseAdmin
      .from("admin_push_subscriptions") // dopasuj nazwę do tej z Supabase
      .upsert(
        {
          restaurant_id: restaurantId,
          restaurant_slug: restaurantSlug,
          endpoint: subscription.endpoint,
          subscription, // pełny obiekt PushSubscription jako jsonb
        },
        {
          onConflict: "endpoint", // wymaga UNIQUE(endpoint); jeśli go nie ma, usuń ten obiekt
        }
      );

    if (error) {
      console.error("[push.subscribe] upsert error:", error.message);
      return NextResponse.json(
        { error: "DB_ERROR" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("[push.subscribe] unexpected:", e?.message || e);
    return NextResponse.json(
      { error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
