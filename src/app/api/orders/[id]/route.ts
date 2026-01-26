// src/app/api/orders/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { orderLogger } from "@/lib/logger";
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
const TERMS_URL = process.env.TERMS_URL || "https://www.sushitutaj.pl/regulamin";
const PRIVACY_URL =
  process.env.PRIVACY_URL || "https://www.sushitutaj.pl/polityka-prywatnosci";

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

  const row = resp.data as unknown as RestaurantAdminMinimal;
  return row?.restaurant_id ?? null;
}

/* ====== PATCH ====== */
// UWAGA: używamy luźnego typu ctx: any, żeby nie walczyć z typami Next 15
export async function PATCH(request: Request, ctx: any) {
  const orderId = ctx?.params?.id as string | undefined;
  if (!orderId) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

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

 // cookie używamy tylko opcjonalnie do “kontekstu”, nie do wyliczania restauracji
const cookieStore = await cookies();
const cookieRid = cookieStore.get("restaurant_id")?.value ?? null;

  // SELECT istniejącego zamówienia
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

const restaurantId = String(existing.restaurant_id);

// cookie jest tylko “kontekstem UI” — nie blokuj operacji
// zabezpieczenie robi twardy check członkostwa (restaurant_admins) poniżej
const shouldFixCookie = cookieRid && cookieRid !== restaurantId;
if (shouldFixCookie) {
  orderLogger.warn("cookie restaurant_id mismatch", { cookieRid, restaurantId });
}

// twardy check członkostwa: user musi być przypisany do restauracji z tego zamówienia
const { data: member, error: memErr } = await (supabaseAdmin as any)
  .from("restaurant_admins")
  .select("restaurant_id")
  .eq("user_id", session.user.id)
  .eq("restaurant_id", restaurantId)
  .limit(1)
  .maybeSingle();

if (memErr) {
  return NextResponse.json({ error: memErr.message }, { status: 500 });
}
if (!member) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

  /* ====== Mapowanie pól do update ====== */

  // sprawdzamy obecność kluczy, nie tylko "truthy" wartość
 // employee ETA (kanoniczne): deliveryTime (timestamptz), plus alias delivery_time
const hasEmployeeTime =
  "deliveryTime" in body || "delivery_time" in body || "employee_delivery_time" in body;

// klient: tylko client_delivery_time (text) – NIE bierz delivery_time
const hasClientTime = "client_delivery_time" in body;

const employeeTime: string | null = hasEmployeeTime
  ? body.deliveryTime ?? body.delivery_time ?? body.employee_delivery_time ?? null
  : null;

const clientTime: string | null = hasClientTime ? body.client_delivery_time ?? null : null;
  const updateData: Record<string, any> = {};

  // status zamówienia
  if ("status" in body) {
    updateData.status = body.status;
  }

    // "deliveryTime" (kanoniczne) + kompatybilność: scheduled_delivery_at (timestamptz)
  const isIsoString = (v: any) =>
    typeof v === "string" && v.length > 10 && !Number.isNaN(Date.parse(v));

  if (hasEmployeeTime) {
    updateData.deliveryTime = employeeTime;

    // dual-write: jeśli mamy ISO -> wpisz też do scheduled_delivery_at
    // jeśli null -> wyczyść oba
    if (employeeTime == null) {
      updateData.scheduled_delivery_at = null;
    } else if (isIsoString(employeeTime)) {
      updateData.scheduled_delivery_at = employeeTime;
    }
  }

  if (hasClientTime) {
    updateData.client_delivery_time = clientTime;
  }

  // jeśli frontend jawnie wysyła scheduled_delivery_at, to ma pierwszeństwo
  if ("scheduled_delivery_at" in body) {
    updateData.scheduled_delivery_at = body.scheduled_delivery_at ?? null;
  }


  // items
  if ("items" in body) {
    updateData.items =
      typeof body.items === "string" ? body.items : JSON.stringify(body.items);
  }

  // opcja (na wynos / dostawa)
  if ("selected_option" in body) {
    updateData.selected_option = body.selected_option;
  }

  // metoda płatności (cash / terminal / online)
  if ("payment_method" in body) {
    updateData.payment_method = body.payment_method;
  }

  // status płatności (pending / paid / failed / null)
  if ("payment_status" in body) {
    updateData.payment_status = body.payment_status;
  }

  // kwota
  if ("total_price" in body) {
    updateData.total_price = body.total_price;
  }

  // adres / kontakt
  if ("address" in body) updateData.address = body.address;
  if ("street" in body) updateData.street = body.street;
  if ("postal_code" in body) updateData.postal_code = body.postal_code;
  if ("city" in body) updateData.city = body.city;
  if ("flat_number" in body) updateData.flat_number = body.flat_number;

  if ("phone" in body) updateData.phone = body.phone;
  if ("contact_email" in body) updateData.contact_email = body.contact_email;
  if ("name" in body) updateData.name = body.name;
  if ("customer_name" in body) updateData.name = body.customer_name;

  // Pałeczki → chopsticks_qty (smallint, CHECK 0–10)
  const chopsticksRaw =
    body.chopsticks_qty ??
    body.chopsticks_count ??
    body.chopsticks ??
    body.paleczki ??
    body.paleczki_count ??
    body.sticks;

  if (chopsticksRaw !== undefined) {
    const n = Number(chopsticksRaw);
    if (Number.isFinite(n)) {
      const clamped = Math.min(10, Math.max(0, Math.floor(n)));
      updateData.chopsticks_qty = clamped;
    }
  }

  // Uwaga: brak updated_at w tabeli – nic takiego nie ustawiamy

  /* ====== UPDATE zamówienia ====== */

  const { data, error } = await (supabaseAdmin as any)
  .from("orders")
  .update(updateData)
  .eq("id", orderId)
  .eq("restaurant_id", restaurantId)
  .select()
  .maybeSingle();

  if (error) {
    orderLogger.error("supabase error", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Order not found after update" },
      { status: 404 }
    );
  }

 const normStatus = (s: any) => String(s ?? "").trim().toLowerCase();

const updated = data as any;

// ====== LOYALTY: nalicz naklejki tylko przy przejściu na completed ======
const statusJustCompleted =
  ("status" in body) &&
  normStatus(body.status) === "completed" &&
  normStatus(existing.status) !== "completed";

  if (statusJustCompleted) {
    try {
      // Logika loyalty przepisana z SQL na TypeScript
      // (funkcja process_loyalty_for_order została usunięta z bazy)
      
      const userId = existing.user_id;
      const baseForLoyalty = Number(existing.total_price || 0) - Number(existing.delivery_cost || 0);
      
      // Oblicz ile naklejek przyznać
      let earnedStickers = 0;
      if (baseForLoyalty >= 50) {
        if (baseForLoyalty <= 200) earnedStickers = 1;
        else if (baseForLoyalty <= 300) earnedStickers = 2;
        else earnedStickers = 3;
      }
      
      // Jeśli user_id istnieje i zamówienie kwalifikuje się do naklejek
      if (userId && earnedStickers > 0 && !existing.loyalty_awarded_at) {
        // Pobierz aktualny stan konta
        const { data: account } = await supabaseAdmin
          .from("loyalty_accounts")
          .select("stickers, roll_reward_claimed")
          .eq("user_id", userId)
          .maybeSingle();
        
        const stickersBefore = Math.min(8, Number(account?.stickers ?? 0));
        
        // Jeśli użył 8 naklejek przy zamówieniu, zresetuj do 0
        const wasReset = existing.loyalty_choice === "use_8";
        const baseStickers = wasReset ? 0 : stickersBefore;
        
        // Nowe saldo (max 8)
        const stickersAfter = Math.min(8, baseStickers + earnedStickers);
        
        // Upsert loyalty_accounts
        if (account) {
          await supabaseAdmin
            .from("loyalty_accounts")
            .update({ 
              stickers: stickersAfter,
              // Reset roll_reward_claimed gdy przekroczono 8 i użyto rabat
              roll_reward_claimed: wasReset ? false : account.roll_reward_claimed
            })
            .eq("user_id", userId);
        } else {
          await supabaseAdmin
            .from("loyalty_accounts")
            .insert({ 
              user_id: userId, 
              stickers: stickersAfter,
              roll_reward_claimed: false
            });
        }
        
        // Zaktualizuj zamówienie z danymi loyalty
        await supabaseAdmin
          .from("orders")
          .update({
            loyalty_awarded: earnedStickers,
            loyalty_stickers_before: stickersBefore,
            loyalty_stickers_after: stickersAfter,
            loyalty_awarded_at: new Date().toISOString(),
          })
          .eq("id", orderId);
        
        // Zaktualizuj obiekt odpowiedzi
        updated.loyalty_awarded = earnedStickers;
        updated.loyalty_stickers_before = stickersBefore;
        updated.loyalty_stickers_after = stickersAfter;
        updated.loyalty_awarded_at = new Date().toISOString();
        
        orderLogger.info("loyalty processed", {
          orderId,
          userId,
          earnedStickers,
          stickersBefore,
          stickersAfter,
        });
      }
    } catch (e) {
      orderLogger.error("loyalty processing exception", { error: e });
    }
  }
  
   const whenIso: string | null =
    updated.deliveryTime ?? updated.scheduled_delivery_at ?? null;

  const whenText: string | null =
    typeof updated.client_delivery_time === "string"
      ? updated.client_delivery_time
      : null;

  const isHHMM = (v: any) =>
    typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v);

  const isIso = (v: any) =>
    typeof v === "string" && v.length > 10 && !Number.isNaN(Date.parse(v));

  const fmtWhen = () => {
    // 1) employee ISO -> format do HH:mm w TZ
    const t1 = fmtTime(whenIso);
    if (t1) return t1;

    // 2) employee HH:mm (gdyby ktoś kiedyś tak zapisał)
    if (isHHMM(whenIso)) return whenIso;

    // 3) client czas (asap ignorujemy)
    if (whenText && whenText !== "asap") {
      // client ISO
      const t2 = isIso(whenText) ? fmtTime(whenText) : null;
      if (t2) return t2;

      // client HH:mm
      if (isHHMM(whenText)) return whenText;
    }

    return null;
  };
  
  /* ====== SMS (SMSAPI przez sendSms) ====== */

  const onlyTimeUpdate =
    (hasEmployeeTime || hasClientTime) &&
    updated.status === "accepted" &&
    body.status !== "accepted";

  let smsBody = "";
  if (onlyTimeUpdate) {
    const t = fmtWhen();
    smsBody = t
      ? `⏰ Aktualizacja: zamówienie ${orderId} będzie gotowe ok. ${t}.`
      : `⏰ Zaktualizowano czas dla zamówienia ${orderId}.`;
  } else {
    switch (updated.status) {
      case "accepted": {
        const t = fmtWhen();
        smsBody = t
          ? `👍 Zamówienie ${orderId} przyjęte. Przewidywany czas ok. ${t}.`
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
        orderLogger.error("sms error", { error: e });
      }
    }
  }

  /* ====== E-mail o zamówieniu (sendEmail) ====== */

  try {
    let toEmail: string | undefined =
      updated.contact_email || updated.email || undefined;
    const userId: string | undefined =
      updated.user_id || updated.user || updated.userId || undefined;

    // jeśli nie ma maila w orders, spróbuj dociągnąć z auth.users
    if (!toEmail && userId) {
      // @ts-ignore — adminAuth.auth.admin jest słabo typowany w supabase-js
      const { data: userRes } = await (adminAuth as any).auth.admin.getUserById(
        userId
      );
      toEmail = userRes?.user?.email || toEmail;
    }

    if (toEmail) {
      let trackUrl: string | null = null;
try {
  trackUrl = trackingUrl(String(orderId));
} catch (e) {
  orderLogger.error("trackingUrl error", { error: e });
  trackUrl = null; // brak linku, ale mail dalej idzie
}

      const timeStr = fmtWhen();
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
        updated.payment_method === "online"
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
        });
      }
    }
  } catch (e) {
    orderLogger.error("email error", { error: e });
  }

  const resp = NextResponse.json(updated);

// samonapraw kontekst — ustaw cookie na restaurację zamówienia
if (cookieRid && cookieRid !== restaurantId) {
  resp.cookies.set("restaurant_id", restaurantId, {
    path: "/",
    sameSite: "lax",
    secure: true,
    httpOnly: true,
  });
}

return resp;
}
