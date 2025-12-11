// src/app/api/admin/notifications/read-all/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST() {
  try {
    // jeśli chcesz globalnie dla wszystkich lokali:
    const { error } = await supabaseAdmin
      .from("admin_notifications")
      .update({ read: true })
      .eq("read", false);

    // jeśli w przyszłości będziesz miał rozdział per restauracja,
    // możesz tu dodać .eq("restaurant_id", <ID lokalu>)

    if (error) {
      console.error("[notifications.read-all] update error:", error);
      return NextResponse.json(
        { ok: false, error: "Błąd zapisu powiadomień" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(
      "[notifications.read-all] unexpected error:",
      e?.message || e
    );
    return NextResponse.json(
      { ok: false, error: "Nieoczekiwany błąd" },
      { status: 500 }
    );
  }
}
