// src/app/api/orders/accept/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { RouteContext } from "next";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getSessionAndRole } from "@/lib/serverAuth";
import { sendOrderAcceptedEmail } from "@/lib/e-mail";
import { sendSms } from "@/lib/sms"; // NEW

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const fmtPL = (iso: string) =>
  new Date(iso).toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  });

// literalna ścieżka route'a
type Route = "/api/orders/accept";

export async function POST(
  req: Request,
  ctx: RouteContext<Route>
) {
  const { id } = await ctx.params;

  const { session, role } = await getSessionAndRole(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (role !== "admin" && role !== "employee") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const m = Number(body?.minutes);
    const minutes = Number.isFinite(m) ? Math.max(5, Math.min(180, m)) : 30; // clamp 5–180
    const etaISO = new Date(Date.now() + minutes * 60_000).toISOString();

    // 1) Pobierz dane zamówienia do weryfikacji + kontaktu
    const { data: order, error: selErr } = await supabaseAdmin
      .from("orders")
      .select("id, contact_email, phone, name, selected_option, restaurant_id")
      .eq("id", id)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // 2) Aktualizacja statusu + ETA (obsługa obu nazw kolumn)
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("orders")
      .update({
        status: "accepted",
        deliveryTime: etaISO,
        delivery_time: etaISO,
      })
      .eq("id", id)
      .select("id, status, deliveryTime, delivery_time")
      .maybeSingle();
    if (updErr) throw updErr;

    // 3) E-mail do klienta (jeśli jest adres)
    if (order.contact_email) {
      await sendOrderAcceptedEmail(order.contact_email, {
        name: order.name || "Kliencie",
        minutes,
        timeStr: fmtPL(etaISO),
        mode: order.selected_option || "takeaway",
      });
    }

    // 4) SMS do klienta (PL bramka)
    try {
      if (order.phone) {
        const msg = `Sushi Tutaj: Zamówienie #${order.id} zaakceptowane. Planowany czas: ${fmtPL(
          etaISO
        )}. Dziękujemy!`;
        await sendSms(order.phone, msg);
      }
    } catch (e) {
      console.error("[orders.accept] sms error", (e as any)?.message || e);
    }

    return NextResponse.json({
      id: updated?.id,
      status: updated?.status,
      deliveryTime: updated?.deliveryTime || updated?.delivery_time || etaISO,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
