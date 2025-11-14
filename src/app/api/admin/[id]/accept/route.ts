// src/app/api/admin/[id]/accept/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendOrderAcceptedEmail } from "@/lib/e-mail";

// Supabase admin client (service role)
const supabaseAdmin = createClient(
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

// UWAGA: używamy RouteContext z literalną ścieżką tego route
export async function POST(req: Request, ctx: RouteContext<"/api/admin/[id]/accept">) {
  const { id } = await ctx.params;

  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  // pobierz zamówienie do walidacji i e-maila
  const { data: ord, error: getErr } = await supabaseAdmin
    .from("orders")
    .select("id, restaurant_id, contact_email, name, selected_option, status")
    .eq("id", id)
    .single();

  if (getErr) {
    return NextResponse.json({ error: getErr.message }, { status: 400 });
  }
  if (!ord) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // ETA z body
  let minutes = 30;
  try {
    const b = await req.json();
    minutes = Math.max(1, Number(b?.minutes ?? 30));
  } catch {
    // fallback do 30 minut
  }

  const etaISO = new Date(Date.now() + minutes * 60_000).toISOString();

  // update zamówienia
  const { data: updated, error: updErr } = await supabaseAdmin
    .from("orders")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      // accepted_by: <jeśli kiedyś dodasz kolumnę z id użytkownika>,
      deliveryTime: etaISO, // nazwa zgodna z Twoją tabelą
    })
    .eq("id", id)
    .select("id, status, deliveryTime")
    .single();

  if (updErr || !updated) {
    return NextResponse.json({ error: updErr?.message || "update_failed" }, { status: 400 });
  }

  // e-mail do klienta, jeśli jest adres
  if (ord.contact_email) {
    void sendOrderAcceptedEmail(ord.contact_email, {
      name: ord.name || "Kliencie",
      minutes,
      timeStr: fmtPL(etaISO),
      mode: ord.selected_option || "takeaway",
    }).catch(() => {
      // celowo ignorujemy błąd maila – zamówienie jest już zaakceptowane
    });
  }

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    deliveryTime: updated.deliveryTime ?? etaISO,
  });
}
