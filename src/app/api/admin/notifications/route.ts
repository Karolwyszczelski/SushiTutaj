// src/app/api/admin/notifications/route.ts
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

export async function GET() {
  // 1) Auth + scope restauracji (membership-check)
  let restaurantId: string;
  try {
    const ctx = await getAdminContext();
    restaurantId = ctx.restaurantId;
  } catch {
    return json({ notifications: [], error: "UNAUTHORIZED" }, 401);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("admin_notifications")
      .select("id, type, title, message, created_at, read")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      apiLogger.error("admin.notifications error", { error: error.message });
      return json(
        { notifications: [], error: "Błąd pobierania powiadomień." },
        500
      );
    }

    return json({ notifications: data ?? [] }, 200);
  } catch (e: any) {
    apiLogger.error("admin.notifications unexpected", { error: e?.message || e });
    return json({ notifications: [], error: "INTERNAL_ERROR" }, 500);
  }
}
