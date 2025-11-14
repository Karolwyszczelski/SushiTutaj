// src/app/api/orders/accept/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getSessionAndRole } from "@/lib/serverAuth";
import { sendOrderAcceptedEmail } from "@/lib/e-mail";
import { sendSms } from "@/lib/sms";

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

export async function POST(req: Request) {
  // Uwaga: brak drugiego argumentu, bo to NIE jest route dynamiczny
  const { session, role } = await getSessionAndRole(); // Twoja wersja przyjmuje 0 arg.
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "admin" && role !== "employee")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing order id" }, { status: 400 });

    const m = Number(body?.minutes);
    const minutes = Number.isFinite(m) ? Math.max(5, Math.min(180, m)) : 30;
    const etaISO = new Date(Date.now() + minutes * 60_000).toISOString();

    // pobierz zamówienie do walidacji/kontaktu
    const { data: order, error: selErr } = await supabaseAdmin
      .from("orders")
      .select("id, contact_email, phone, name, selected_option, restaurant_id")
      .eq("id", id)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // aktualizacja statusu i ETA — używaj kolumny `deliveryTime` (w typach jej używasz)
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("orders")
      .update({ status: "accepted", deliveryTime: etaISO })
      .eq("id", id)
      .select("id, status, deliveryTime")
      .maybeSingle();
    if (updErr) throw updErr;

    // e-mail do klienta
    if (order.contact_email) {
      await sendOrderAcceptedEmail(order.contact_email, {
        name: order.name || "Kliencie",
        minutes,
        timeStr: fmtPL(etaISO),
        mode: order.selected_option || "takeaway",
      });
    }

    // SMS do klienta (zabezpieczone try/catch)
    try {
      if (order.phone) {
        const msg = `Sushi Tutaj: Zamówienie #${order.id} zaakceptowane. Planowany czas: ${fmtPL(etaISO)}. Dziękujemy!`;
        await sendSms(order.phone, msg);
      }
    } catch (e) {
      console.error("[orders.accept] sms error", (e as any)?.message || e);
    }

    return NextResponse.json({
      id: updated?.id,
      status: updated?.status,
      deliveryTime: updated?.deliveryTime || etaISO,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
