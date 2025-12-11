// src/app/api/admin/notifications/route.ts
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

export async function GET(req: Request) {
  try {
    // Bierzemy aktualny lokal z cookie ustawianego przez ensure-cookie
    const ck = await cookies(); // możesz spokojnie usunąć "await" – cookies() jest synchroniczne
    const restaurantId = ck.get("restaurant_id")?.value ?? null;

    if (!restaurantId) {
      // bez lokalu nie pokazujemy nic (np. admin jeszcze nie wybrał miasta)
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

    return NextResponse.json(
      { notifications: data ?? [] },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[admin.notifications] unexpected:", e?.message || e);
    return NextResponse.json(
      { notifications: [], error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
