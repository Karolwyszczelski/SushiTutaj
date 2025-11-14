// src/app/api/orders/webhook/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Supabase Service Role key — nigdy nie wystawiaj go po stronie klienta!
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  // 1. Weryfikacja tajnego nagłówka
  const secret = request.headers.get("x-webhook-secret");
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const data = await request.json();
    console.log("[Webhook] odebrano:", data);

    const orderId = data.orderId || data.sessionId || data.id;
    if (!orderId) {
      return NextResponse.json({ error: "Brak orderId" }, { status: 400 });
    }

    // 2. Zbuduj obiekt update’u (tylko te pola które podał webhook)
    const updates: Record<string, any> = { status: data.status ?? "new" };
    if (typeof data.address === "string")   updates.address     = data.address;
    if (typeof data.phone   === "string")   updates.phone       = data.phone;
    if (typeof data.products=== "string")   updates.products    = data.products;
    if (typeof data.total_price === "number") updates.total_price = data.total_price;

    // 3. Wykonaj update
    const { error } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", orderId);

    if (error) {
      console.error("[Webhook] błąd update’u:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Webhook] nieoczekiwany błąd:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
