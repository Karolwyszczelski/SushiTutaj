// src/app/api/orders/cancel/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { orderLogger } from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/adminContext";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // <- poprawiona zmienna
  {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const orderId = body?.orderId as string | undefined;

    if (!orderId) {
      return NextResponse.json(
        { error: "Brak poprawnego orderId" },
        { status: 400 }
      );
    }

    // Pobieramy kontekst admina -> który user i która restauracja
    let restaurantId: string;
    try {
      const ctx = await getAdminContext();
      restaurantId = ctx.restaurantId;
    } catch (err) {
      orderLogger.error("missing admin context", { error: err });
      return NextResponse.json(
        { error: "Brak uprawnień do anulowania zamówienia" },
        { status: 403 }
      );
    }

    // Anulujemy TYLKO zamówienie z danej restauracji
    const { data, error } = await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId)
      .select("id, status")
      .maybeSingle();

    if (error) {
      orderLogger.error("cancel error", { error });
      return NextResponse.json(
        { error: "Błąd podczas anulowania zamówienia" },
        { status: 500 }
      );
    }

    if (!data) {
      // albo nie istnieje, albo należy do innej restauracji
      return NextResponse.json(
        {
          error:
            "Zamówienie nie istnieje lub nie należy do Twojej restauracji.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    orderLogger.error("route error", { error: err });
    return NextResponse.json(
      { error: "Nie udało się anulować zamówienia" },
      { status: 500 }
    );
  }
}
