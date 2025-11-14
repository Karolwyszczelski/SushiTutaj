// src/app/api/orders/stats/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";

/* === utils === */
function normalizeUuid(v?: string | null) {
  if (!v) return null;
  const x = v.replace(/[<>\s'"]/g, "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x) ? x : null;
}
const toInt = (v: string | null, d: number) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : d;
};
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

type OrderRow = {
  id: string;
  created_at: string;
  status: string;
  total_price: number | null;
};

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  // auth (panel admina / employee)
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id || null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const searchParams = url.searchParams;

  const days = Math.max(1, toInt(searchParams.get("days"), 30));
  const slugParam = (searchParams.get("restaurant") || "").toLowerCase() || null;

  // cookies: do odczytu wartości MUSI być await
  const cookieStore = await cookies();
  let rid = normalizeUuid(cookieStore.get("restaurant_id")?.value || null);

  // jeśli podano slug restauracji → przelicz na id
  if (slugParam) {
    const { data: rows, error } = await supabase
      .from("restaurants")
      .select("id")
      .eq("slug", slugParam)
      .returns<{ id: string }[]>() // jawny typ, żeby uniknąć `never`
      .limit(1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const restId = rows?.[0]?.id || null;
    rid = normalizeUuid(restId);
  }

  // fallback: ostatnia restauracja przypisana użytkownikowi (restaurant_admins)
  if (!rid) {
    const { data: last, error } = await supabase
      .from("restaurant_admins")
      .select("restaurant_id, added_at")
      .eq("user_id", userId)
      .order("added_at", { ascending: false })
      .returns<{ restaurant_id: string; added_at: string }[]>();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const lastId = (last?.[0]?.restaurant_id as string) || null;
    rid = normalizeUuid(lastId);
  }

  if (!rid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // zakres czasu
  const now = new Date();
  const since = new Date(now.getTime() - days * 864e5);
  const sinceISO = since.toISOString();
  const nowISO = now.toISOString();

  // pobranie zamówień do statystyk (tylko to, co potrzebne)
  const { data, error } = await supabase
    .from("orders")
    .select("id, created_at, status, total_price")
    .eq("restaurant_id", rid)
    .gte("created_at", sinceISO)
    .lte("created_at", nowISO)
    .order("created_at", { ascending: true })
    .returns<OrderRow[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // agregaty
  const byStatus: Record<string, number> = {};
  let revenue = 0;
  let count = 0;

  for (const o of rows) {
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    count += 1;

    // przychód: ignorujemy anulowane; jeśli masz inną definicję – dostosuj
    if (o.status !== "cancelled") {
      revenue += Number(o.total_price ?? 0);
    }
  }

  const avgTicket = count ? revenue / count : 0;

  // dzienna seria
  const daysMap = new Map<string, { orders: number; revenue: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 864e5);
    daysMap.set(isoDay(d), { orders: 0, revenue: 0 });
  }
  for (const o of rows) {
    const day = isoDay(new Date(o.created_at));
    const bucket = daysMap.get(day);
    if (bucket) {
      bucket.orders += 1;
      if (o.status !== "cancelled") bucket.revenue += Number(o.total_price ?? 0);
    }
  }
  const daily = Array.from(daysMap.entries()).map(([date, v]) => ({
    date,
    orders: v.orders,
    revenue: v.revenue,
  }));

  return NextResponse.json({
    restaurant_id: rid,
    range: { from: sinceISO, to: nowISO, days },
    totals: {
      orders: count,
      revenue,
      avgTicket,
    },
    byStatus,
    daily,
  });
}
