// /app/api/orders/stats/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getSessionAndRole } from "@/lib/serverAuth";

type Row = Database["public"]["Tables"]["orders"]["Row"];

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // omija RLS
  { auth: { persistSession: false } }
);

// YYYY-MM-DD w strefie PL
const dayKeyPL = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

const startOfTodayPLISO = () => {
  const now = new Date();
  const pl = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Warsaw" }));
  pl.setHours(0, 0, 0, 0);
  // ISO w UTC bez przesunięcia logiki dnia PL
  return new Date(pl.getTime() - pl.getTimezoneOffset() * 60_000).toISOString();
};

function collectStrings(val: any): string[] {
  if (!val) return [];
  if (typeof val === "string") return [val];
  if (Array.isArray(val)) return val.flatMap(collectStrings).filter(Boolean);
  if (typeof val === "object") {
    const prefer = ["name","title","label","product_name","menu_item_name","item_name","nazwa","nazwa_pl"];
    const out: string[] = [];
    for (const k of prefer) if (typeof (val as any)[k] === "string") out.push((val as any)[k]);
    for (const v of Object.values(val)) if (typeof v === "object") out.push(...collectStrings(v));
    return out;
  }
  return [];
}

function extractProductNames(items: any): string[] {
  try {
    const data = typeof items === "string" ? JSON.parse(items) : items;
    const arr = Array.isArray(data) ? data : [data];
    const names = new Set<string>();
    for (const it of arr) for (const s of collectStrings(it)) if (s && s.length <= 80) names.add(s);
    return Array.from(names);
  } catch {
    if (typeof items === "string") return items.split(",").map((s) => s.trim()).filter(Boolean);
    return [];
  }
}

async function resolveRestaurantId({
  role,
  userId,
  slugParam,
  cookieRid,
}: {
  role: "admin" | "employee";
  userId: string;
  slugParam?: string | null;
  cookieRid?: string | null;
}) {
  // 1) admin może podać slug w QS
  if (role === "admin" && slugParam) {
    const { data, error } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("slug", slugParam)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.id) return data.id as string;
    throw new Error("Nie znaleziono restauracji dla podanego sluga.");
  }
  // 2) jeśli mamy cookie z serwera, użyj
  if (cookieRid) return cookieRid;

  // 3) fallback: pierwsza przypisana restauracja
  const { data, error } = await supabaseAdmin
    .from("restaurant_admins")
    .select("restaurant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.restaurant_id) return data.restaurant_id as string;

  throw new Error("Brak przypisanej restauracji.");
}

export async function GET(request: Request) {
  const { session, role } = await getSessionAndRole(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "admin" && role !== "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const cookieStore = cookies();
    const { searchParams } = new URL(request.url);
    const days = Math.max(1, parseInt(searchParams.get("days") || "30", 10));
    const slugParam = searchParams.get("restaurant")?.toLowerCase() || null;
    const cookieRid = cookieStore.get("restaurant_id")?.value ?? null;

    const now = new Date();
    const sinceISO = new Date(now.getTime() - days * 864e5).toISOString();

    const restaurantId = await resolveRestaurantId({
      role: role as "admin" | "employee",
      userId: session.user.id,
      slugParam,
      cookieRid,
    });

    // Pola kompatybilne: delivery_time i "deliveryTime" (obie obsłużone)
    const selectCols =
      'id, created_at, status, total_price, payment_status, items, client_delivery_time, delivery_time, "deliveryTime"';

    const { data: rows, error } = await supabaseAdmin
      .from("orders")
      .select(selectCols)
      .eq("restaurant_id", restaurantId)
      .gte("created_at", sinceISO);

    if (error) throw new Error(error.message);

    const ordersPerDay: Record<string, number> = {};
    const avgAcc: Record<string, { sum: number; cnt: number }> = {};
    const popularProducts: Record<string, number> = {};

    let todayOrders = 0;
    let todayRevenue = 0;
    let monthOrders = 0;
    let monthRevenue = 0;
    let newOrders = 0;
    let currentOrders = 0;

    const todayKey = dayKeyPL(now);
    const ym = todayKey.slice(0, 7);

    for (const o of rows as (Row & { delivery_time?: string | null; deliveryTime?: string | null; client_delivery_time?: string | null })[]) {
      const created = new Date(o.created_at!);
      const day = dayKeyPL(created);
      ordersPerDay[day] = (ordersPerDay[day] ?? 0) + 1;

      const planned =
        (o as any).delivery_time ||
        (o as any).deliveryTime ||
        (o as any).client_delivery_time ||
        null;

      if (String(o.status).toLowerCase() === "completed" && planned) {
        const minutes = Math.max(0, Math.round((+new Date(planned) - +created) / 60000));
        const a = avgAcc[day] ?? { sum: 0, cnt: 0 };
        a.sum += minutes; a.cnt += 1; avgAcc[day] = a;
      }

      for (const n of extractProductNames((o as any).items)) {
        popularProducts[n] = (popularProducts[n] ?? 0) + 1;
      }

      const st = String(o.status || "").toLowerCase();
      const ps = String(o.payment_status || "").toLowerCase();
      const paidish = ps === "paid" || ps === "succeeded" || ps === "success" || st === "completed";
      const price = Number(o.total_price) || 0;

      if (day === todayKey) {
        todayOrders++;
        if (paidish) todayRevenue += price;
      }
      if (day.startsWith(ym)) {
        monthOrders++;
        if (paidish) monthRevenue += price;
      }

      if (st === "new" || st === "placed" || st === "pending") newOrders++;
      if (st === "accepted") currentOrders++;
    }

    const avgFulfillmentTime: Record<string, number> = {};
    for (const [d, { sum, cnt }] of Object.entries(avgAcc)) if (cnt > 0) avgFulfillmentTime[d] = Math.round(sum / cnt);

    // Rezerwacje dziś — obsłuż obie kolumny czasu (created_at | inserted_at)
    let todayReservations = 0;
    const startPL = startOfTodayPLISO();
    try {
      // próba 1: created_at
      const q1 = await supabaseAdmin
        .from("reservations")
        .select("id", { head: true, count: "exact" })
        .eq("restaurant_id", restaurantId)
        .gte("created_at", startPL);
      if (!q1.error) {
        todayReservations = q1.count ?? 0;
      } else {
        // próba 2: inserted_at
        const q2 = await supabaseAdmin
          .from("reservations")
          .select("id", { head: true, count: "exact" })
          .eq("restaurant_id", restaurantId)
          .gte("inserted_at", startPL);
        if (!q2.error) todayReservations = q2.count ?? 0;
      }
    } catch {
      // ignoruj
    }

    const monthAvgs = Object.entries(avgFulfillmentTime).filter(([d]) => d.startsWith(ym));
    const monthAvgFulfillment =
      monthAvgs.length ? Math.round(monthAvgs.reduce((s, [, v]) => s + (v || 0), 0) / monthAvgs.length) : undefined;

    const kpis = {
      todayOrders,
      todayRevenue,
      todayReservations,
      monthOrders,
      monthRevenue,
      monthAvgFulfillment,
      newOrders,
      currentOrders,
      reservations: todayReservations,
    };

    return new NextResponse(
      JSON.stringify({ ordersPerDay, avgFulfillmentTime, popularProducts, kpis }),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    console.error("GET /api/orders/stats error:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
