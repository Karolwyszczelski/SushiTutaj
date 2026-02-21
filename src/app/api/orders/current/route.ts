// src/app/api/orders/current/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { orderLogger } from "@/lib/logger";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// Service role client - omija RLS dla restaurant_admins
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, detectSessionInUrl: false } }
);

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

const CK_BASE = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30,
};
const CK_ID = { ...CK_BASE, httpOnly: true };
const CK_SLUG = { ...CK_BASE, httpOnly: false };

function getSupabaseProjectRef(): string | null {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const host = new URL(url).hostname; // <ref>.supabase.co
    const ref = host.split(".")[0];
    return ref || null;
  } catch {
    return null;
  }
}

function clearSupabaseAuthCookies(res: NextResponse) {
  const ref = getSupabaseProjectRef();
  if (!ref) return;

  const base = {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  };

  // auth-helpers potrafią chunkować cookie: ...auth-token, ...auth-token.0, .1, ...
  res.cookies.set(`sb-${ref}-auth-token`, "", base);
  for (let i = 0; i < 10; i++) {
    res.cookies.set(`sb-${ref}-auth-token.${i}`, "", base);
  }
  res.cookies.set(`sb-${ref}-auth-token-code-verifier`, "", base);
}


export async function GET(req: Request) {
  // Next.js 15: cookies() musi być await'owane
  const cookieStore = await cookies();
  
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

  // Autoryzacja użytkownika (getUser() weryfikuje z serwerem auth)
  let user: any = null;

try {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  user = data.user;
} catch (e: any) {
  orderLogger.error("getUser error", { error: e?.message || e });

  const res = NextResponse.json(
    { error: "Unauthorized", code: "AUTH_REFRESH_TOKEN_MISSING" },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );

  clearSupabaseAuthCookies(res);
  return res;
}

const userId = user?.id;
if (!userId) {
  return NextResponse.json(
    { error: "Unauthorized", code: "NO_SESSION" },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") || "open";
  const limit = Math.max(1, Math.min(100, toInt(url.searchParams.get("limit"), 20)));
  const offset = Math.max(0, toInt(url.searchParams.get("offset"), 0));

  const slugParam =
    (url.searchParams.get("restaurant") || "").toLowerCase().trim() || null;
  const paramForced = !!slugParam;

  // cookies - już mamy cookieStore z góry
  const cookieRid = normalizeUuid(cookieStore.get("restaurant_id")?.value || null);
  let rid: string | null = cookieRid;
  let rslug: string | null =
    cookieStore.get("restaurant_slug")?.value?.toLowerCase() ?? null;

  // 1) slug z query -> ID
  if (slugParam) {
    const { data: rows, error } = await supabase
      .from("restaurants")
      .select("id, slug")
      .eq("slug", slugParam)
      .limit(1)
      .returns<{ id: string; slug: string | null }[]>();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const found = rows?.[0] ?? null;
    if (!found?.id) {
      return NextResponse.json({ error: "Unknown restaurant" }, { status: 404 });
    }

    rid = normalizeUuid(found.id);
    rslug = found.slug?.toLowerCase() ?? slugParam;
  }

  // Używamy supabaseAdmin (service role) do zapytań restaurant_admins - omija RLS
  async function firstAssignedRestaurantId(uid: string) {
    const { data, error } = await supabaseAdmin
      .from("restaurant_admins")
      .select("restaurant_id, added_at")
      .eq("user_id", uid)
      .order("added_at", { ascending: true })
      .limit(1);

    if (error) return { rid: null as string | null, error };

    const x = (data?.[0]?.restaurant_id as string | null) ?? null;
    return { rid: normalizeUuid(x), error: null as any };
  }

  async function hasAccessToRestaurant(uid: string, restaurantId: string) {
    const { data, error } = await supabaseAdmin
      .from("restaurant_admins")
      .select("restaurant_id")
      .eq("user_id", uid)
      .eq("restaurant_id", restaurantId)
      .limit(1);

    if (error) return { ok: false, error };
    return { ok: (data?.length ?? 0) > 0, error: null as any };
  }

  // 2) brak rid -> weź pierwszy przypisany
  if (!rid) {
    const first = await firstAssignedRestaurantId(userId);
    if (first.error) return NextResponse.json({ error: first.error.message }, { status: 500 });
    if (!first.rid) {
      return NextResponse.json({ error: "NO_RESTAURANT_FOR_ADMIN" }, { status: 404 });
    }
    rid = first.rid;
    rslug = null;
  }

  if (!rid) {
    return NextResponse.json({ error: "NO_RESTAURANT" }, { status: 404 });
  }

  // 3) walidacja dostępu do rid
  const access = await hasAccessToRestaurant(userId, rid);
  if (access.error) return NextResponse.json({ error: access.error.message }, { status: 500 });

  if (!access.ok) {
    // ktoś podał slug ręcznie -> 403
    if (paramForced) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // stare cookie -> fallback na pierwszy przypisany
    const first = await firstAssignedRestaurantId(userId);
    if (first.error) return NextResponse.json({ error: first.error.message }, { status: 500 });
    if (!first.rid) {
      return NextResponse.json({ error: "NO_RESTAURANT_FOR_ADMIN" }, { status: 404 });
    }

    rid = first.rid;
    rslug = null;
  }

  if (!rid) {
    return NextResponse.json({ error: "NO_RESTAURANT" }, { status: 404 });
  }
  const finalRestaurantId = rid;

  // 4) dociągnij slug dla finalRestaurantId jeśli nie mamy
  if (!rslug) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("slug")
      .eq("id", finalRestaurantId)
      .limit(1)
      .returns<{ slug: string | null }[]>();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rslug = data?.[0]?.slug?.toLowerCase() ?? null;
  }

    const sel = `
    id, created_at, status, total_price,
    name, selected_option,
    items,
    delivery_cost, phone, address, street, flat_number, city,
    payment_method, payment_status,
    client_delivery_time, scheduled_delivery_at, deliveryTime,
    reservation_id, reservation_date, reservation_time,
    reservations:reservation_id ( status ),
    chopsticks_qty,
    promo_code, discount_amount,
    loyalty_stickers_before, loyalty_stickers_after,
    loyalty_applied, loyalty_reward_type, loyalty_reward_value,
    loyalty_min_order, loyalty_free_roll_name,
    packaging_cost,
    note,
    kitchen_note
  `;


  let q = supabase
    .from("orders")
    .select(sel as any, { count: "exact" })
    .eq("restaurant_id", finalRestaurantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

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
    deliveryTime: o.deliveryTime ?? null,
    scheduled_delivery_at: o.scheduled_delivery_at ?? null,
    reservation_id: o.reservation_id ?? null,
    reservation_date: o.reservation_date ?? null,
    reservation_time: o.reservation_time ?? null,
    reservation_status: o.reservations?.status ?? null,
    chopsticks_qty: o.chopsticks_qty ?? null,
    packaging_cost: o.packaging_cost ?? null,
    note: o.note ?? null,
    kitchen_note: o.kitchen_note ?? null,

    promo_code: o.promo_code ?? null,
    discount_amount: Number(o.discount_amount ?? 0) || 0,
    loyalty_stickers_before: o.loyalty_stickers_before ?? null,
    loyalty_stickers_after: o.loyalty_stickers_after ?? null,
    loyalty_applied: !!o.loyalty_applied,
    loyalty_reward_type: o.loyalty_reward_type ?? null,
    loyalty_reward_value:
      o.loyalty_reward_value != null ? Number(o.loyalty_reward_value) : null,
    loyalty_min_order:
      o.loyalty_min_order != null ? Number(o.loyalty_min_order) : null,
    loyalty_free_roll_name: o.loyalty_free_roll_name ?? null,
  }));

  const res = NextResponse.json(
    { orders, totalCount: count ?? orders.length, restaurant_id: finalRestaurantId },
    { headers: { "Cache-Control": "no-store" } }
  );

  // self-heal cookies
  res.cookies.set("restaurant_id", finalRestaurantId, CK_ID);
  if (rslug) {
    res.cookies.set("restaurant_slug", rslug, CK_SLUG);
  } else {
    // zamiast delete() (czasem typy Next krzyczą) -> twarde czyszczenie
    res.cookies.set("restaurant_slug", "", { ...CK_SLUG, maxAge: 0 });
  }

  return res;
}
