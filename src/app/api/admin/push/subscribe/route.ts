// app/api/admin/push/subscribe/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { subscription, restaurant_slug } = await req.json();

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: "Brak subskrypcji" }, { status: 400 });
    }

    // pobierz restaurant_id z sluga
    const { data, error } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("slug", restaurant_slug)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { error: "Nie znaleziono restauracji" },
        { status: 400 }
      );
    }

    const { id: restaurant_id } = data;

    const { error: upsertErr } = await supabaseAdmin
      .from("admin_push_subscriptions")
      .upsert(
        {
          restaurant_id,
          restaurant_slug,
          endpoint: subscription.endpoint,
          subscription,
        },
        { onConflict: "endpoint" }
      );

    if (upsertErr) {
      console.error(upsertErr);
      return NextResponse.json(
        { error: "Błąd zapisu subskrypcji" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Błąd serwera" }, { status: 500 });
  }
}
