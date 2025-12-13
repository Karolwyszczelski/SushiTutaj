export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(req: NextRequest) {
  try {
    const restaurantIdFromCookie =
      req.cookies.get("restaurant_id")?.value ?? null;

    const restaurantSlugFromCookie =
      req.cookies.get("restaurant_slug")?.value ?? null;

    let restaurantId = restaurantIdFromCookie;

    // fallback: jeśli brak restaurant_id, ale jest slug → dociągnij id
    if (!restaurantId && restaurantSlugFromCookie) {
      const { data: r, error: rErr } = await supabaseAdmin
        .from("restaurants")
        .select("id")
        .eq("slug", restaurantSlugFromCookie)
        .maybeSingle();

      if (!rErr && r?.id) restaurantId = r.id;
    }

    if (!restaurantId) {
      return NextResponse.json({ notifications: [] }, { status: 200 });
    }

    const { data, error } = await supabaseAdmin
      .from("admin_notifications")
      .select("id, type, title, message, created_at, read")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[admin.notifications] error:", error.message);
      return NextResponse.json(
        { notifications: [], error: "Błąd pobierania powiadomień." },
        { status: 500 }
      );
    }

    return NextResponse.json({ notifications: data ?? [] }, { status: 200 });
  } catch (e: any) {
    console.error("[admin.notifications] unexpected:", e?.message || e);
    return NextResponse.json(
      { notifications: [], error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
