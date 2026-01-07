// src/app/api/admin/notifications/read-all/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/adminContext";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST() {
  // 1) Auth + scope lokalu
  let restaurantId: string;
  try {
    const ctx = await getAdminContext();
    restaurantId = ctx.restaurantId;
  } catch {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  try {
    // 2) Update TYLKO dla danego lokalu
    const { error } = await supabaseAdmin
      .from("admin_notifications")
      .update({ read: true })
      .eq("restaurant_id", restaurantId)
      .eq("read", false);

    if (error) {
      apiLogger.error("notifications.read-all update error", { error: error.message });
      return json({ ok: false, error: "Błąd zapisu powiadomień" }, 500);
    }

    return json({ ok: true }, 200);
  } catch (e: any) {
    apiLogger.error("notifications.read-all unexpected error", {
      error: e?.message || e,
    });
    return json({ ok: false, error: "Nieoczekiwany błąd" }, 500);
  }
}
