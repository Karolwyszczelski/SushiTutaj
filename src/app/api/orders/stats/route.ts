// src/app/api/orders/stats/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { orderLogger } from "@/lib/logger";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

type Row = Database["public"]["Tables"]["orders"]["Row"];

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // omija RLS
  { auth: { persistSession: false, detectSessionInUrl: false } }
);

class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normalizeUuid(v?: string | null) {
  if (!v) return null;
  const x = String(v).replace(/[<>\s'"]/g, "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    x
  )
    ? x
    : null;
}

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

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
  return new Date(pl.getTime() - pl.getTimezoneOffset() * 60_000).toISOString();
};

function collectStrings(val: any): string[] {
  if (!val) return [];
  if (typeof val === "string") return [val];
  if (Array.isArray(val)) return val.flatMap(collectStrings).filter(Boolean);
  if (typeof val === "object") {
    const prefer = [
      "name",
      "title",
      "label",
      "product_name",
      "menu_item_name",
      "item_name",
      "nazwa",
      "nazwa_pl",
    ];
    const out: string[] = [];
    for (const k of prefer)
      if (typeof (val as any)[k] === "string") out.push((val as any)[k]);
    for (const v of Object.values(val))
      if (typeof v === "object") out.push(...collectStrings(v));
    return out;
  }
  return [];
}

function extractProductNames(items: any): string[] {
  try {
    const data = typeof items === "string" ? JSON.parse(items) : items;
    const arr = Array.isArray(data) ? data : [data];
    const names = new Set<string>();
    for (const it of arr)
      for (const s of collectStrings(it)) if (s && s.length <= 80) names.add(s);
    return Array.from(names);
  } catch {
    if (typeof items === "string")
      return items
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return [];
  }
}

async function membershipRole(userId: string, restaurantId: string) {
  const { data, error } = await supabaseAdmin
    .from("restaurant_admins")
    .select("role")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .limit(1)
    .maybeSingle<{ role: string | null }>();

  if (error) throw new Error(error.message);
  return (data?.role ?? null) as string | null;
}

function isAllowedRole(role: string | null) {
  // dopasuj jeśli chcesz zawęzić
  return role === "owner" || role === "admin" || role === "manager" || role === "employee";
}

async function restaurantIdBySlug(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(error.message);
  return data?.id ? String(data.id) : null;
}

async function firstAssignedRestaurant(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("restaurant_admins")
    .select("restaurant_id, role, added_at")
    .eq("user_id", userId)
    .order("added_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ restaurant_id: string; role: string | null }>();

  if (error) throw new Error(error.message);
  if (!data?.restaurant_id) return null;
  return { restaurantId: String(data.restaurant_id), role: (data.role ?? null) as string | null };
}

/**
 * Bezpieczny wybór restauracji:
 * - slug (jeśli podany) -> ID -> membership-check
 * - cookie restaurant_id -> membership-check
 * - fallback: pierwszy przypisany lokal
 *
 * Nigdy nie zwracamy ID bez weryfikacji membership.
 */
async function resolveRestaurantContext(opts: {
  userId: string;
  slugParam?: string | null;
  cookieRid?: string | null;
}) {
  const forcedSlug = !!opts.slugParam;

  // 1) slug -> id
  if (opts.slugParam) {
    const rid = await restaurantIdBySlug(opts.slugParam);
    if (!rid) throw new HttpError(404, "Nie znaleziono restauracji dla podanego sluga.", "NOT_FOUND");

    const role = await membershipRole(opts.userId, rid);
    if (!role || !isAllowedRole(role)) {
      throw new HttpError(403, "Brak uprawnień do tego lokalu.", "FORBIDDEN");
    }
    return { restaurantId: rid, role };
  }

  // 2) cookie rid (zweryfikowane)
  if (opts.cookieRid) {
    const role = await membershipRole(opts.userId, opts.cookieRid);
    if (role && isAllowedRole(role)) {
      return { restaurantId: opts.cookieRid, role };
    }
    // jeśli cookie było “lewe/stare” — nie wywalamy, tylko fallback
    if (forcedSlug) {
      throw new HttpError(403, "Brak uprawnień do tego lokalu.", "FORBIDDEN");
    }
  }

  // 3) fallback: pierwszy przypisany
  const first = await firstAssignedRestaurant(opts.userId);
  if (!first?.restaurantId) throw new HttpError(403, "Brak przypisanej restauracji.", "NO_RESTAURANT");

  const role = first.role ?? null;
  if (!isAllowedRole(role)) {
    throw new HttpError(403, "Brak uprawnień do statystyk.", "FORBIDDEN");
  }

  return { restaurantId: first.restaurantId, role };
}

export async function GET(request: NextRequest) {
  // Next.js 15: cookies() musi być await'owane na początku
  const cookieStore = await cookies();
  
  // auth
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return json({ error: "Unauthorized" }, 401);

  try {
    const { searchParams } = request.nextUrl;

    const daysRaw = parseInt(searchParams.get("days") || "30", 10);
    const days = Math.max(1, Math.min(365, Number.isFinite(daysRaw) ? daysRaw : 30));

    const slugParam = searchParams.get("restaurant")?.toLowerCase().trim() || null;
    const cookieRid = normalizeUuid(cookieStore.get("restaurant_id")?.value ?? null);

    const { restaurantId } = await resolveRestaurantContext({
      userId: user.id,
      slugParam,
      cookieRid,
    });

    const now = new Date();
    const sinceISO = new Date(now.getTime() - days * 864e5).toISOString();

    const selectCols =
      'id, created_at, status, total_price, payment_status, items, client_delivery_time, "deliveryTime"';

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

    const typedRows = (rows ?? []) as (Row & {
      delivery_time?: string | null;
      deliveryTime?: string | null;
      client_delivery_time?: string | null;
    })[];

    for (const o of typedRows) {
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
        a.sum += minutes;
        a.cnt += 1;
        avgAcc[day] = a;
      }

      for (const n of extractProductNames((o as any).items)) {
        popularProducts[n] = (popularProducts[n] ?? 0) + 1;
      }

      const st = String(o.status || "").toLowerCase();
      const ps = String(o.payment_status || "").toLowerCase();
      const paidish =
        ps === "paid" || ps === "succeeded" || ps === "success" || st === "completed";
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
    for (const [d, { sum, cnt }] of Object.entries(avgAcc))
      if (cnt > 0) avgFulfillmentTime[d] = Math.round(sum / cnt);

    // Rezerwacje dziś — obsłuż obie kolumny czasu (created_at | inserted_at)
    let todayReservations = 0;
    const startPL = startOfTodayPLISO();
    try {
      const q1 = await supabaseAdmin
        .from("reservations")
        .select("id", { head: true, count: "exact" })
        .eq("restaurant_id", restaurantId)
        .gte("created_at", startPL);
      if (!q1.error) {
        todayReservations = q1.count ?? 0;
      } else {
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
    const monthAvgFulfillment = monthAvgs.length
      ? Math.round(monthAvgs.reduce((s, [, v]) => s + (v || 0), 0) / monthAvgs.length)
      : undefined;

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
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err: any) {
    if (err instanceof HttpError) {
      return json({ error: err.message, code: err.code }, err.status);
    }
    orderLogger.error("GET /api/orders/stats error", { error: err?.message || err });
    return json({ error: err?.message || "Server error" }, 500);
  }
}
