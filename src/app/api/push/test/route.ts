// src/app/api/push/test/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sendPushForRestaurant } from "@/lib/push";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const restaurantId = String(body.restaurant_id || "").trim();

    if (!restaurantId) {
      return NextResponse.json(
        { error: "Brak restaurant_id w body" },
        { status: 400 }
      );
    }

    await sendPushForRestaurant(restaurantId, {
      title: "TEST – nowe zamówienie",
      body: "To jest testowe powiadomienie web push.",
      url: "/admin/pickup-order",
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[api/push/test] error:", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
