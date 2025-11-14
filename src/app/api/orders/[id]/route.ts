// src/app/api/orders/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getSessionAndRole } from "@/lib/serverAuth";
import { sendSms } from "@/lib/sms";
import { sendEmail } from "@/lib/e-mail";
import { trackingUrl } from "@/lib/orderLink";
import type { Database } from "@/types/supabase";

/* ====== Wersje/Linki regulaminów ====== */
const TERMS_VERSION = process.env.TERMS_VERSION || "2025-01";
const PRIVACY_VERSION = process.env.PRIVACY_VERSION || "2025-01";
const TERMS_URL = process.env.TERMS_URL || "https://mediagalaxy.pl/regulamin";
const PRIVACY_URL =
  process.env.PRIVACY_URL || "https://www.mediagalaxy.pl/polityka-prywatnosci";

/* ====== Supabase admin (service role) ====== */
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/* ====== Admin auth do pobrania e-maila z auth.users ====== */
const adminAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/* ====== Mail FROM (używane w szablonie, jeśli potrzebne w sendEmail) ====== */
const EMAIL_FROM = (process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  "Sushi Tutaj <no-reply@sushitutaj.pl>").replace(/^['"\s]+|['"\s]+$/g, "");

/* ====== TZ i format czasu ====== */
const APP_TZ = process.env.APP_TIMEZONE || "Europe/Warsaw";
const timeFmt = new Intl.DateTimeFormat("pl-PL", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: APP_TZ,
});
const fmtTime = (iso?: string | null) =>
  iso && !Number.isNaN(Date.parse(iso)) ? timeFmt.format(new Date(iso)) : null;

/* ====== Utils ====== */
function normalizePhone(phone?: string | null) {
  if (!phone) return null;
  const d = String(phone).replace(/\D/g, "");
  if (d.length === 9) return "+48" + d;
  if (d.startsWith("00")) return "+" + d.slice(2);
  if (!String(phone).startsWith("+") && d.length > 9) return "+" + d;
  return String(phone);
}

const optLabel = (v?: string) =>
  v === "delivery" ? "DOSTAWA" : v === "takeaway" ? "NA WYNOS" : "NA WYNOS";

/* ====== Pomocnicze: ID restauracji z członkostwa ====== */
type RestaurantAdminMinimal = { restaurant_id: string; added_at?: string } | null;
async function resolveRestaurantId(
  userId: string | null,
  cookieRid?: string | null
) {
  if (cookieRid) return cookieRid;
  if (!userId) return null;

  const resp = await supabaseAdmin
    .from("restaurant_admins")
    .select("restaurant_id, added_at")
    .eq("user_id", userId)
    .order("added_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = resp.data as unknown as RestaurantAdminMinimal; // typy mogą być niekompletne
  return row?.restaurant_id ?? null;
}

/* ====== PATCH ====== */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;

  const { session, role } = await getSessionAndRole(request);
  if (!session || (role !== "admin" && role !== "employee")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const cookieRid = cookieStore.get("restaurant_id")?.value ?? null;
  const allowedRestaurantId = await resolveRestaurantId(
    session.user.id,
    cookieRid
  );
  if (!allowedRestaurantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // SELECT istniejącego zamówienia
  // WA: typy Database mogą nie zawierać niektórych kolumn (np. user_id) → rzutujemy na any
  const { data: existing, error: getErr } = await (supabaseAdmin as any)
    .from("orders")
    .select(
      "id, restaurant_id, phone, contact_email, selected_option, status, user, legal_accept"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (getErr) {
    return NextResponse.json({ error: getErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.restaurant_id !== allowedRestaurantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Mapowanie pól do aktualizacji
  const employeeTime: string | undefined =
    body.deliveryTime ?? body.employee_delivery_time;
  const clientTime: string | undefined =
    body.client_delivery_time ?? body.delivery_time;

  const updateData: Record<string, any> = {};
  if (body.status) updateData.status = body.status;
  if (employeeTime) updateData.deliveryTime = employeeTime;
  if (clientTime) updateData.client_delivery_time = clientTime;
  if (body.items !== undefined) {
    updateData.items =
      typeof body.items === "string" ? body.items : JSON.stringify(body.items);
  }
  if (body.selected_option) updateData.selected_option = body.selected_option;
  if (body.payment_method) updateData.payment_method = body.payment_method;
  if (body.payment_status !== undefined) {
    updateData.payment_status = body.payment_status;
  }
  if (body.total_price !== undefined) updateData.total_price = body.total_price;
  if (body.address) updateData.address = body.address;
  if (body.street) updateData.street = body.street;
  if (body.postal_code) updateData.postal_code = body.postal_code;
  if (body.city) updateData.city = body.city;
  if (body.flat_number) updateData.flat_number = body.flat_number;
  if (body.phone) updateData.phone = body.phone;
  if (body.contact_email) updateData.contact_email = body.contact_email;
  if (body.name) updateData.name = body.name;
  if (body.customer_name) updateData.name = body.customer_name;
  if (body.promo_code !== undefined) updateData.promo_code = body.promo_code;
  if (body.discount_amount !== undefined) {
    updateData.discount_amount = body.discount_amount;
  }
  updateData.updated_at = new Date().toISOString();

  // UPDATE zamówienia (również rzutowany na any, by nie blokować buildu)
  const { data, error } = await (supabaseAdmin as any)
    .from("orders")
    .update(updateData)
    .eq("id", orderId)
    .eq("restaurant_id", allowedRestaurantId)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[orders.patch] supabase error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Order not found after update" },
      { status: 404 }
    );
  }

  const updated = data as any;
  const when: string | null =
    updated.deliveryTime ?? updated.client_delivery_time ?? null;

  /* ====== SMS ====== */
  const onlyTimeUpdate =
    !!employeeTime && updated.status === "accepted" && body.status !== "accepted";

  let smsBody = "";
  if (onlyTimeUpdate) {
    const t = fmtTime(when);
    smsBody = t
      ? `⏰ Aktualizacja: zamówienie ${orderId} będzie gotowe ok. ${t}.`
      : `⏰ Zaktualizowano czas dla zamówienia ${orderId}.`;
  } else {
    switch (updated.status) {
      case "accepted": {
        const t = fmtTime(when);
        smsBody = t
          ? `👍 Zamówienie ${orderId} przyjęte. Odbiór ok. ${t}.`
          : `👍 Zamówienie ${orderId} przyjęte.`;
        break;
      }
      case "completed":
        smsBody = `✅ Zamówienie ${orderId} zrealizowane.`;
        break;
      case "cancelled":
        smsBody = `❌ Zamówienie ${orderId} anulowane.`;
        break;
    }
  }

  const shouldSms =
    !!updated.phone &&
    (["accepted", "completed", "cancelled"].includes(updated.status) ||
      onlyTimeUpdate);

  if (shouldSms && smsBody) {
    const to = normalizePhone(updated.phone);
    if (to) {
      try {
        await sendSms(to, smsBody);
      } catch (e) {
        console.error("[orders.patch] sms error:", e);
      }
    }
  }

  /* ====== E-mail ====== */
  try {
    let toEmail: string | undefined =
      updated.contact_email || updated.email || undefined;
    const userId: string | undefined =
      updated.user_id || updated.user || updated.userId || undefined;

    if (!toEmail && userId) {
      // @ts-ignore — API adminAuth w supabase-js jest słabo typowane
      const { data: userRes } = await adminAuth.auth.admin.getUserById(userId);
      toEmail = userRes?.user?.email || toEmail;
    }

    if (toEmail) {
      const origin =
        request.headers.get("origin") ||
        process.env.APP_BASE_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        "";
      const trackUrl = origin ? trackingUrl(origin, String(orderId)) : null;

      const timeStr = fmtTime(when);
      const optionTxt = optLabel(updated.selected_option);
      const changingPaymentStatus = body.payment_status !== undefined;

      let subject = `Sushi Tutaj • Zamówienie #${orderId}`;
      let headline = "";
      let extra = "";

      if (onlyTimeUpdate) {
        subject += " — zaktualizowany czas";
        headline = "Zaktualizowaliśmy czas realizacji";
        extra = timeStr ? `Nowy czas: <b>${timeStr}</b>` : "";
      } else if (
        ["accepted", "completed", "cancelled"].includes(updated.status)
      ) {
        switch (updated.status) {
          case "accepted":
            subject += " przyjęte";
            headline = "Przyjęliśmy Twoje zamówienie";
            extra = timeStr ? `Szacowany czas: <b>${timeStr}</b>` : "";
            break;
          case "completed":
            subject += " zrealizowane";
            headline = "Zamówienie zrealizowane";
            break;
          case "cancelled":
            subject += " anulowane";
            headline = "Zamówienie zostało anulowane";
            break;
        }
      } else if (
        changingPaymentStatus &&
        body.payment_status === "paid" &&
        updated.payment_method === "Online"
      ) {
        subject += " — płatność potwierdzona";
        headline = "Otrzymaliśmy Twoją płatność online";
        extra = "Status płatności: <b>opłacone</b>";
      }

      const la = (updated.legal_accept ?? {}) as any;
      const termsV = la.terms_version || TERMS_VERSION;
      const privV = la.privacy_version || PRIVACY_VERSION;

      if (headline) {
        const html = `
          <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111">
            <h2 style="margin:0 0 8px">${headline}</h2>
            <p style="margin:0 0 6px">Numer: <b>#${orderId}</b></p>
            <p style="margin:0 0 6px">Opcja: <b>${optionTxt}</b></p>
            ${extra ? `<p style="margin:0 0 10px">${extra}</p>` : ""}
            ${
              trackUrl
                ? `<p style="margin:14px 0">
              <a href="${trackUrl}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;border-radius:8px;text-decoration:none">
                Sprawdź status zamówienia
              </a>
            </p>`
                : ""
            }
            <hr style="margin:20px 0;border:none;border-top:1px solid #eee" />
            <p style="font-size:12px;color:#555;margin:0">
              Akceptacja: Regulamin v${termsV} (<a href="${TERMS_URL}">link</a>),
              Polityka prywatności v${privV} (<a href="${PRIVACY_URL}">link</a>)
            </p>
          </div>
        `;

        await sendEmail({
          to: toEmail,
          subject,
          html,
          // from: EMAIL_FROM, // jeśli Twój helper wspiera
        });
      }
    }
  } catch (e) {
    console.error("[orders.patch] email error:", e);
  }

  return NextResponse.json(updated);
}
