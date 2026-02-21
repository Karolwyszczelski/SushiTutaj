//src/api/orders/create/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { orderLogger } from "@/lib/logger";
import { buildKitchenNote } from "@/lib/kitchenNote";
import { supabaseAdmin, TURNSTILE_SECRET_KEY } from "./_lib/clients";

/* ===================== Rate Limiting ===================== */
const hasUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasUpstash ? Redis.fromEnv() : null;

// 5 zamówień / 1 min na IP — chroni przed spamem
const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 m"),
      analytics: true,
      prefix: "rl:orders",
    })
  : null;

function clientIp(req: Request): string {
  const xff =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "";
  return xff.split(",")[0].trim() || "anon";
}


import { isOpenFor, nowInstant, nowPL } from "./_lib/schedule";

import { LUNCH_CUTOFF_MINUTES, isLunchItemServer } from "./_lib/Lunch";

import { normalizeBody } from "./_lib/normalize";


import { notifyClientAfterCreate } from "./_lib/notifyClient";




import { fetchProductsByIds, nameFromProductRow } from "./_lib/products";

import {
  extractItemNoteCandidate,
  hasStructuredSwaps,
  looksLikeAutoSwapSummary,
} from "./_lib/notes";


import { normalizePlainServer, recomputeTotalFromItems } from "./_lib/pricing";

import { LOYALTY_MIN_ORDER_BASE } from "./_lib/loyalty";
import { applyLoyaltyAndFinalizePricing } from "./_lib/loyaltyOrder";


import { pushAdminNotification } from "./_lib/notifications";

import { enforceTurnstile } from "./_lib/turnstile";

import { resolveRestaurantContext } from "./_lib/restaurant";

import { enforceDeliveryZonePricing } from "./_lib/deliveryZonePricing";

import { enforceBlockedContact } from "./_lib/blockedContact";

import {
  parseClientDeliveryTime,
  enforceRestaurantBlockedTimes,
  enforceClosureWindows,
} from "./_lib/clientTime";

import {
  buildItemFromDbAndOptions,
  type Any,
  type NormalizedItem,
} from "./_lib/items";

import { buildTrackingUrlForClient } from "./_lib/tracking";




/* ===================== Handler ===================== */

function optLabel(option: string): string {
  if (option === "delivery") return "Dostawa";
  if (option === "takeaway") return "Wynos";
  return option;
}


export async function POST(req: Request) {
  try {
    // 0) Rate limiting - 5 zamówień/min na IP
    if (ratelimit) {
      const ip = clientIp(req);
      const { success, remaining } = await ratelimit.limit(ip);
      if (!success) {
        orderLogger.warn("rate-limited", { ip, remaining });
        return NextResponse.json(
          { error: "Zbyt wiele zamówień. Spróbuj ponownie za chwilę." },
          {
            status: 429,
            headers: { "Retry-After": "60" },
          }
        );
      }
    }

    // 1) Body + Turnstile
    let raw: any;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const turnstileRes = await enforceTurnstile(
      req,
      raw,
      TURNSTILE_SECRET_KEY
    );
    if (turnstileRes) return turnstileRes;

    // 1.1) Restauracja: slug + id + flags (delivery/takeaway) + aktywność
    const rc = await resolveRestaurantContext({
      req,
      raw,
      supabaseAdmin: supabaseAdmin as any,
      selectedOption: null, // sprawdzimy po normalizeBody
    });
    if (!rc.ok) return rc.res;

    const { restaurantSlug, restaurant_id, restRow, deliveryActive, takeawayActive } =
      rc.ctx;


    // 1.2) Aktualny czas PL
    const now0 = nowInstant();   // chwila w czasie
const now = nowPL(now0);     // komponenty w PL do grafiku/blokad

    // 1.3) Godziny per miasto (stały grafik)
    {
      const { open, label } = isOpenFor(restaurantSlug, now);
      if (!open) {
        return NextResponse.json(
          {
            error: `Zamówienia dla ${restaurantSlug} przyjmujemy ${label}.`,
          },
          { status: 400 }
        );
      }
    }

    // 2) Normalizacja
    const n: any = normalizeBody(raw, req);

    if (!n.phone) {
      return NextResponse.json(
        { error: "Wymagany jest numer telefonu." },
        { status: 400 }
      );
    }
    if (!n.contact_email) {
      return NextResponse.json(
        { error: "Wymagany jest adres e-mail do potwierdzenia." },
        { status: 400 }
      );
    }
    if (!Array.isArray(n.itemsArray) || n.itemsArray.length === 0) {
      return NextResponse.json(
        { error: "Koszyk jest pusty." },
        { status: 400 }
      );
    }

        // HARD BLOCK per selected_option (po normalizacji)
    if (n.selected_option === "delivery" && !deliveryActive) {
      return NextResponse.json(
        { error: "Dostawa jest chwilowo wyłączona dla tego lokalu." },
        { status: 400 }
      );
    }
    if (n.selected_option === "takeaway" && !takeawayActive) {
      return NextResponse.json(
        { error: "Wynos jest chwilowo wyłączony dla tego lokalu." },
        { status: 400 }
      );
    }


    // 2.1) Metoda realizacji
    const fulfill_method =
      n.selected_option === "delivery" ? "delivery" : "takeaway";

    // 2.2) Opłata za opakowanie – backend (dopasowane do frontu)
const packagingFee = 3;

    // 2.3) Suma pozycji (produkty + addony)
    const productIds = n.itemsArray
  .map((it: any) => it.product_id ?? it.productId ?? it.id ?? null)
  .filter(Boolean)
  .map((x: any) => String(x));

const productsMap = await fetchProductsByIds(supabaseAdmin, productIds);

// START: HARD VALIDATION - lunch only before 16:00 (Warsaw)
const nowMinutesPL = now.getHours() * 60 + now.getMinutes();

const lunchInCart = (n.itemsArray || []).some((rawIt: any) => {
  const pid = String(rawIt?.product_id ?? rawIt?.productId ?? rawIt?.id ?? "");
  const db = pid ? productsMap.get(pid) : undefined;

  const itemName = String(rawIt?.name ?? nameFromProductRow(db) ?? "");
  const subcat = String(
    db?.subcategory ??
      db?.category ??
      rawIt?.product?.subcategory ??
      rawIt?.product?.category ??
      ""
  );

  return isLunchItemServer(itemName, subcat);
});

if (lunchInCart && nowMinutesPL >= LUNCH_CUTOFF_MINUTES) {
  return NextResponse.json(
    { error: "Lunch można zamówić tylko do 16:00." },
    { status: 400 }
  );
}
// END: HARD VALIDATION - lunch only before 16:00 (Warsaw)


// START: HARD VALIDATION - no swaps for "Zestaw miesiąca"
for (const rawIt of (n.itemsArray || []) as any[]) {
  const pid = String(rawIt?.product_id ?? rawIt?.productId ?? rawIt?.id ?? "");
  const db = pid ? productsMap.get(pid) : undefined;

  const itemName = String(
    rawIt?.name ?? nameFromProductRow(db) ?? ""
  );

  const namePlain = normalizePlainServer(itemName);

   const isSetOfMonth = /\bzestaw[\s\-]*miesiaca\b/i.test(namePlain);

  // blokujemy też próby “zamian” wrzucone tekstem w notatkę (np. strzałki)
  const noteCandidate = extractItemNoteCandidate(rawIt) || "";
  const noteLooksLikeSwap = looksLikeAutoSwapSummary(String(noteCandidate));

  if (isSetOfMonth && (hasStructuredSwaps(rawIt) || noteLooksLikeSwap)) {
    return NextResponse.json(
      { error: "Zestaw miesiąca nie podlega zmianom (zamiany są zablokowane)." },
      { status: 400 }
    );
  }
}
// END: HARD VALIDATION - no swaps for "Zestaw miesiąca"


const itemsTotal = recomputeTotalFromItems(n.itemsArray, productsMap, restaurantSlug);
const baseWithoutDelivery = itemsTotal + packagingFee;

const blockedRes = await enforceBlockedContact({
  supabaseAdmin,
  restaurant_id,
  n,
});
if (blockedRes) return blockedRes;

    
    // 2.8) Strefa dostawy – per restauracja
    const deliveryZoneRes = await enforceDeliveryZonePricing(req, {
      n,
      restaurant_id,
      restRow,
      baseWithoutDelivery,
    });
    if (deliveryZoneRes) return deliveryZoneRes;


    // 4) Normalizacja pozycji
    const normalizedItems: NormalizedItem[] = n.itemsArray.map((it: any) => {
      const key = String(it.product_id ?? it.productId ?? it.id ?? "");
      const db = productsMap.get(key);
      return buildItemFromDbAndOptions(db, it);
    });
// 5) Czas klienta:
// - client_delivery_time: "asap" albo "HH:MM"
// - scheduled_delivery_at: ISO UTC (tylko gdy klient wybrał konkretną godzinę)
const {
  clientDeliveryForDb,
  scheduledDeliveryAt,
  requestedDateStr,
  requestedMinutes,
} = parseClientDeliveryTime({
  clientDeliveryRaw: n.client_delivery_time,
  now, // PL components
});

// 5.0) Sprawdzenie closure_windows (dynamiczne zamknięcia restauracji)
const closureRes = await enforceClosureWindows({
  supabaseAdmin,
  restaurant_id,
  now, // PL components
});
if (closureRes) return closureRes;

// 5.0.1) Sprawdzenie blokad czasowych (restaurant_blocked_times)
const blockedTimeRes = await enforceRestaurantBlockedTimes({
  supabaseAdmin,
  restaurant_id,
  requestedDateStr,
  requestedMinutes,
});
if (blockedTimeRes) return blockedTimeRes;

// 5.1) Notatka dla kuchni
const kitchen_note = buildKitchenNote(normalizedItems as any);

// 5.2) Lojalność + finalne przeliczenie total_price
const deliveryCostFinal =
  n.selected_option === "delivery" ? Number(n.delivery_cost || 0) : 0;

// Baza rabatów (kody + lojalność) – tylko produkty + opakowanie
const discountBase = baseWithoutDelivery;

await applyLoyaltyAndFinalizePricing({
  supabaseAdmin: supabaseAdmin as any,
  n,
  discountBase,
  deliveryCostFinal,
});

// 6) Insert orders
const itemsForOrdersColumn = JSON.stringify(normalizedItems);

    const { data: orderRow, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        restaurant_id,
        restaurant_slug: restaurantSlug,
        name: n.name,
        phone: n.phone,
        contact_email: n.contact_email,
        address: n.address,
        note: n.note ?? null,
        street: n.street,
        postal_code: n.postal_code
          ? String(n.postal_code).slice(0, 10)
          : null,
        city: n.city,
        flat_number: n.flat_number,
        selected_option: n.selected_option,
        fulfill_method,
        payment_method: "cash",
        payment_status: "unpaid",
        items: itemsForOrdersColumn,
        total_price: n.total_price,
        delivery_cost: deliveryCostFinal,
        packaging_cost: packagingFee,
        status: n.status,
        client_delivery_time: clientDeliveryForDb,
        scheduled_delivery_at: scheduledDeliveryAt, // <--- DODANE
        deliveryTime: n.deliveryTime,
        eta: n.eta,
        user: n.user_id ?? null,
        reservation_id: n.reservation_id ?? null,
        promo_code: n.promo_code ? String(n.promo_code).slice(0, 32) : null,
        discount_amount: n.discount_amount,
        legal_accept: n.legal_accept,
        chopsticks_qty: n.chopsticks_qty,
        kitchen_note,
        loyalty_choice: n.loyalty_choice ?? "keep",
        loyalty_free_roll_name: n.loyalty_free_roll_name ?? null,
loyalty_stickers_used: n.loyalty_stickers_used ?? 0,
loyalty_stickers_earned: n.loyalty_stickers_earned ?? 0,
loyalty_stickers_before: n.loyalty_stickers_before ?? null,
loyalty_stickers_after: n.loyalty_stickers_after ?? null,
loyalty_applied: n.loyalty_applied ?? false,
        loyalty_reward_type: n.loyalty_reward_type ?? null,
        loyalty_reward_value: n.loyalty_reward_value ?? null,
        loyalty_min_order: n.loyalty_min_order ?? LOYALTY_MIN_ORDER_BASE,
      })
            .select("id, public_id, tracking_token, selected_option, total_price, name")
      .single();


    if (orderErr || !orderRow) {
      orderLogger.error("insert orders error", {
        error: orderErr?.message || orderErr,
      });
      return NextResponse.json(
        { error: "Nie udało się zapisać zamówienia." },
        { status: 500 }
      );
    }

    const newOrderId = orderRow.id;

        const tracking = {
      id: String(newOrderId),
      public_id: (orderRow as any)?.public_id ?? null,
      tracking_token: (orderRow as any)?.tracking_token ?? null,
    };

    // referencja dla klienta (nie pokazujemy UUID jeśli mamy public_id)
    const customerOrderRef = tracking.public_id || tracking.id;

    // bezpieczny link dla klienta (public_id + token)
    // link dla klienta: jeśli mamy public_id+token -> nowy, inaczej fallback na stary
    const urlTrack = buildTrackingUrlForClient(req, {
      orderId: String(newOrderId),
      publicId: tracking.public_id,
      token: tracking.tracking_token,
    });


    // NOWE: powiadomienie o nowym zamówieniu (admin + web-push)
    await pushAdminNotification(
      restaurant_id,
      "order",
      `Nowe zamówienie #${newOrderId}`,
      `Kwota: ${n.total_price.toFixed(2)} zł, opcja: ${optLabel(
        n.selected_option
      )}`,
      { url: `/admin/pickup-order?restaurant=${restaurantSlug}` }
    );

    // NOWE: Jeśli zamówienie ma reservation_id, zaktualizuj rezerwację z powiązaniem
    if (n.reservation_id) {
      try {
        await supabaseAdmin
          .from("reservations")
          .update({
            table_ref: "orders",
            table_id: String(newOrderId),
            table_label: `Zamówienie #${String(newOrderId).slice(0, 8)}`,
          })
          .eq("id", n.reservation_id);
        orderLogger.info("reservation linked to order", {
          reservation_id: n.reservation_id,
          order_id: newOrderId,
        });
      } catch (e: any) {
        orderLogger.warn("reservation link failed", { error: e?.message });
      }
    }

    // 7) order_items
    if (Array.isArray(n.itemsArray) && n.itemsArray.length > 0) {
      try {
        const shaped = n.itemsArray.map((rawIt: Any, i: number) => {
          const key = String(
            rawIt.product_id ?? rawIt.productId ?? rawIt.id ?? ""
          );
          const db = productsMap.get(key);
          const ni = buildItemFromDbAndOptions(db, rawIt);
          return {
            order_id: newOrderId,
            product_id: key || null,
            name: ni.name,
            quantity: ni.quantity,
            unit_price: ni.price,
            line_no: i + 1,
          };
        });
        const { error: oiErr } = await supabaseAdmin
          .from("order_items")
          .insert(shaped);
        if (oiErr)
          orderLogger.warn("order_items insert skipped", {
            error: oiErr.message,
          });
      } catch (e: any) {
        orderLogger.warn("order_items insert not executed", {
          error: e?.message,
        });
      }
    }
// 8-9) Powiadomienia klienta (mail + SMS) – przeniesione do helpera
await notifyClientAfterCreate({
  email: n.contact_email,
  phone: n.phone,
  orderRef: customerOrderRef,
  selectedOption: (orderRow as any)?.selected_option ?? null,
  totalPrice: (orderRow as any)?.total_price,
  trackingUrl: urlTrack,
});

return NextResponse.json(
  {
    orderId: String(newOrderId), // legacy
    publicId: tracking.public_id, // nowe
    trackingUrl: urlTrack, // /order/{public_id}?t=...
  },
  { status: 201 }
);
  } catch (e: any) {
    orderLogger.error("unexpected error", { error: e?.message || e });
    return NextResponse.json(
      { error: "Wystąpił nieoczekiwany błąd serwera." },
      { status: 500 }
    );
  }
}
