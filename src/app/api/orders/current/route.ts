// src/app/api/orders/current/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

function normalizeUuid(v?: string | null) {
  if (!v) return null;
  const x = v.replace(/[<>\s'"]/g, "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    x
  )
    ? x
    : null;
}

const toInt = (v: string | null, d: number) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : d;
};

export async function GET(req: Request) {
  // Klient Supabase (przekazujemy provider cookies z next/headers)
  const supabase = createRouteHandlerClient<Database>({ cookies });

  // Użytkownik
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id || null;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parametry
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") || "open";
  const limit = Math.max(
    1,
    Math.min(100, toInt(url.searchParams.get("limit"), 20))
  );
  const offset = Math.max(0, toInt(url.searchParams.get("offset"), 0));
  const slugParam =
    (url.searchParams.get("restaurant") || "").toLowerCase() || null;

  // >>> cookies() jest Promise -> trzeba poczekać na wynik <<<
  const cookieStore = await cookies();
  let rid = normalizeUuid(cookieStore.get("restaurant_id")?.value || null);

  // Slug -> id (jawny typ, by uniknąć `never`)
  if (slugParam) {
    const { data: rows, error } = await supabase
      .from("restaurants")
      .select("id")
      .eq("slug", slugParam)
      .returns<{ id: string }[]>() // ważne dla TS
      .limit(1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const restId = rows?.[0]?.id || null;
    if (!restId) {
      return NextResponse.json({ error: "Unknown restaurant" }, { status: 404 });
    }
    rid = normalizeUuid(restId);
  }

  // Fallback: ostatnia restauracja przypisana userowi (też jawny typ)
  if (!rid) {
    const { data: lastRows, error } = await supabase
      .from("restaurant_admins")
      .select("restaurant_id, added_at")
      .eq("user_id", userId)
      .order("added_at", { ascending: false })
      .limit(1)
      .returns<{ restaurant_id: string; added_at: string }[]>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const lastId = lastRows?.[0]?.restaurant_id || null;
    rid = normalizeUuid(lastId);
  }

  if (!rid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Selekcja kolumn – z polami rabatu i lojalności
  const sel = `
    id, created_at, status, total_price,
    name, selected_option,
    items,
    delivery_cost, phone, address, street, flat_number, city,
    payment_method, payment_status,
    client_delivery_time, deliveryTime,
    reservation_id, reservation_date, reservation_time,
    chopsticks_qty,
    promo_code, discount_amount,
    loyalty_stickers_before, loyalty_stickers_after,
    loyalty_applied, loyalty_reward_type, loyalty_reward_value,
    loyalty_min_order
  `;

  let q = supabase
    .from("orders")
    .select(sel as any, { count: "exact" })
    .eq("restaurant_id", rid)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (scope === "open") {
    q = q.in("status", ["new", "pending", "placed", "accepted"]);
  }

  const { data, error, count } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = (data ?? []).map((o: any) => ({
    id: o.id,
    created_at: o.created_at,
    status: o.status,
    total_price: Number(o.total_price) || 0,
    customer_name: o.name ?? null,
    selected_option: o.selected_option ?? null,
    items: o.items ?? o.order_items ?? [],
    delivery_cost: o.delivery_cost ?? null,
    phone: o.phone ?? null,
    address: o.address ?? null,
    street: o.street ?? null,
    flat_number: o.flat_number ?? null,
    city: o.city ?? null,
    payment_method: o.payment_method ?? null,
    payment_status: o.payment_status ?? null,
    client_delivery_time: o.client_delivery_time ?? null,
    deliveryTime: o.deliveryTime ?? null,
    reservation_id: o.reservation_id ?? null,
    reservation_date: o.reservation_date ?? null,
    reservation_time: o.reservation_time ?? null,
    chopsticks_qty: o.chopsticks_qty ?? null,

    // rabat / lojalność
    promo_code: o.promo_code ?? null,
    discount_amount: Number(o.discount_amount ?? 0) || 0,
    loyalty_stickers_before: o.loyalty_stickers_before ?? null,
    loyalty_stickers_after: o.loyalty_stickers_after ?? null,
    loyalty_applied: !!o.loyalty_applied,
    loyalty_reward_type: o.loyalty_reward_type ?? null,
    loyalty_reward_value:
      o.loyalty_reward_value != null
        ? Number(o.loyalty_reward_value)
        : null,
    loyalty_min_order:
      o.loyalty_min_order != null ? Number(o.loyalty_min_order) : null,
  }));

  return NextResponse.json(
    { orders, totalCount: count ?? orders.length, restaurant_id: rid },
    { headers: { "Cache-Control": "no-store" } }
  );
}
