export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendOrderAcceptedEmail } from "@/lib/e-mail";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const fmtPL = (iso: string) =>
  new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!params?.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  // pobierz zamówienie do walidacji i e-maila
  const { data: ord, error: getErr } = await supabaseAdmin
    .from("orders")
    .select("id, restaurant_id, contact_email, name, selected_option, status")
    .eq("id", params.id)
    .single();

  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 400 });
  if (!ord)   return NextResponse.json({ error: "not_found" }, { status: 404 });

  // ETA z body
  let minutes = 30;
  try { const b = await req.json(); minutes = Math.max(1, Number(b?.minutes ?? 30)); } catch {}
  const etaISO = new Date(Date.now() + minutes * 60_000).toISOString();

  // update zgodny z Twoim schematem
  const { data: updated, error: updErr } = await supabaseAdmin
    .from("orders")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      // accepted_by: <opcjonalnie: id usera jeśli chcesz zapisywać>,
      deliveryTime: etaISO, // Uwaga: CamelCase tak jak w tabeli
    })
    .eq("id", params.id)
    .select("id,status,deliveryTime")
    .single();

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  // e-mail do klienta jeśli jest
  if (ord.contact_email) {
    await sendOrderAcceptedEmail(ord.contact_email, {
      name: ord.name || "Kliencie",
      minutes,
      timeStr: fmtPL(etaISO),
      mode: ord.selected_option || "takeaway",
    }).catch(() => {});
  }

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    deliveryTime: updated.deliveryTime ?? etaISO,
  });
}
