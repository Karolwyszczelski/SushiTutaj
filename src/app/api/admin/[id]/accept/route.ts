// src/app/api/admin/[id]/accept/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { orderLogger } from "@/lib/logger";
import { z } from "zod";
import { AdminAuthError, requireRestaurantAccess } from "@/lib/requireAdmin";
import { sendOrderAcceptedEmail } from "@/lib/e-mail";
import { sendSms } from "@/lib/sms";

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

const fmtPL = (iso: string) =>
  new Date(iso).toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  });

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

const BodySchema = z.object({
  minutes: z.coerce.number().finite().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx: Awaited<ReturnType<typeof requireRestaurantAccess>>;
  try {
    ctx = await requireRestaurantAccess(["admin", "employee"]);
  } catch (e: any) {
    if (e instanceof AdminAuthError) {
      return json({ error: e.message, code: e.code }, e.status);
    }
    return json({ error: "Unauthorized" }, 401);
  }

  const { id } = await params;
  const orderId = String(id || "").trim();
  if (!orderId) return json({ error: "Missing order id" }, 400);
  if (!isUuid(orderId)) return json({ error: "Invalid order id" }, 400);

  const bodyRaw = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return json({ error: "Validation", details: parsed.error.format() }, 400);
  }

  const m = parsed.data.minutes;
  const minutes = Number.isFinite(m as number)
    ? Math.max(5, Math.min(180, Number(m)))
    : 30;

  const etaISO = new Date(Date.now() + minutes * 60_000).toISOString();

  // 1) Pobierz minimalne dane zamówienia w scope restauracji
  const { data: order, error: selErr } = await ctx.supabase
    .from("orders")
    .select("id, contact_email, phone, name, selected_option, restaurant_id")
    .eq("id", orderId)
    .eq("restaurant_id", ctx.restaurantId)
    .maybeSingle();

  if (selErr) return json({ error: selErr.message }, 500);
  if (!order) return json({ error: "Order not found" }, 404);

  // 2) Aktualizacja statusu + ETA w scope restauracji
  const { data: updated, error: updErr } = await ctx.supabase
    .from("orders")
    // UWAGA: zostawiamy oba pola dla kompatybilności (gdy jedno z nich nie istnieje w danym środowisku)
    .update({ status: "accepted", deliveryTime: etaISO, delivery_time: etaISO } as any)
    .eq("id", orderId)
    .eq("restaurant_id", ctx.restaurantId)
    .select("id, status, deliveryTime, delivery_time")
    .maybeSingle();

  if (updErr) return json({ error: updErr.message }, 500);
  if (!updated) return json({ error: "Order not found" }, 404);

  // 3) E-mail
  if ((order as any).contact_email) {
    await sendOrderAcceptedEmail((order as any).contact_email, {
      name: (order as any).name || "Kliencie",
      minutes,
      timeStr: fmtPL(etaISO),
      mode: (order as any).selected_option || "takeaway",
    });
  }

  // 4) SMS (best-effort)
  try {
    if ((order as any).phone) {
      const msg = `Sushi Tutaj: Zamówienie #${(order as any).id} zaakceptowane. Planowany czas: ${fmtPL(
        etaISO
      )}. Dziękujemy!`;
      await sendSms((order as any).phone, msg);
    }
  } catch (e) {
    orderLogger.error("admin.orders.accept sms error", { error: (e as any)?.message || e });
  }

  return json({
    id: (updated as any)?.id,
    status: (updated as any)?.status,
    deliveryTime:
      (updated as any)?.deliveryTime || (updated as any)?.delivery_time || etaISO,
  });
}
