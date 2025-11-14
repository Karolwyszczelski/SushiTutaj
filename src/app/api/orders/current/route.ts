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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x) ? x : null;
}
const toInt = (v: string | null, d: number) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : d;
};

export async function GET(req: Request) {
  // Next 15: przekaż funkcję zwracającą awaited cookieStore
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id || null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") || "open";
  const limit = Math.max(1, Math.min(100, toInt(url.searchParams.get("limit"), 20)));
  const offset = Math.max(0, toInt(url.searchParams.get("offset"), 0));
  const slugParam = (url.searchParams.get("restaurant") || "").toLowerCase() || null;

  // id restauracji z cookie
  let rid = normalizeUuid(cookieStore.get("restaurant_id")?.value || null);

  // jeśli podano slug w URL -> przelicz na id
  if (slugParam) {
    const { data: rest, error } = await supabase
      .from("restaurants")
      .select("id")
      .eq("slug", slugParam)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!rest?.id) return NextResponse.json({ error: "Unknown restaurant" }, { status: 404 });
    rid = normalizeUuid(rest.id as string);
  }

  // fallback: ostatnia restauracja przypisana userowi
  if (!rid) {
    const { data: last, error } = await supabase
      .from("restaurant_admins")
      .select("restaurant_id, added_at")
      .eq("user_id", userId)
      .order("added_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rid = normalizeUuid((last?.restaurant_id as string) || null);
  }

  if (!rid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // pobierz wyłącznie zamówienia tej restauracji (RLS dodatkowo filtruje po userze)
  const sel = `
    id, created_at, status, total_price,
    name, selected_option,
    items,
    delivery_cost, phone, address, street, flat_number, city,
    payment_method, payment_status,
    client_delivery_time, deliveryTime
  `;

  let q = supabase
    .from("orders")
    .select(sel as any, { count: "exact" })
    .eq("restaurant_id", rid)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // "open" = wszystko do obsługi w panelu
  if (scope === "open") {
    q = q.in("status", ["new", "pending", "placed", "accepted"]);
  }

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
    deliveryTime: o.deliveryTime ?? o.delivery_time ?? null,
  }));

  return NextResponse.json(
    { orders, totalCount: count ?? orders.length, restaurant_id: rid },
    { headers: { "Cache-Control": "no-store" } }
  );
}
