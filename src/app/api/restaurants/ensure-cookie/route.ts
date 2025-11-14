// src/app/api/restaurants/ensure-cookie/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";

const CK = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30, // 30 dni
};

function makeRes(body: any, code = 200) {
  const res = NextResponse.json(body, {
    status: code,
    headers: { "Cache-Control": "no-store" },
  });
  return res;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slugParam = url.searchParams.get("restaurant")?.toLowerCase() || null;

  // Next 15: cookies() jest async – MUSI być await
  const cookieStore = await cookies();

  const supabase = createRouteHandlerClient<Database>({
    cookies: () => cookieStore,
  });

  const { data: u, error: userErr } = await supabase.auth.getUser();
  if (userErr) {
    const res = makeRes({ error: userErr.message }, 500);
    res.cookies.set("restaurant_id", "", { ...CK, maxAge: 0 });
    res.cookies.set("restaurant_slug", "", { ...CK, maxAge: 0 });
    return res;
  }

  const userId = u?.user?.id ?? null;

  // brak sesji → wyczyść oba cookie
  if (!userId) {
    const res = makeRes({ error: "unauthorized" }, 401);
    res.cookies.set("restaurant_id", "", { ...CK, maxAge: 0 });
    res.cookies.set("restaurant_slug", "", { ...CK, maxAge: 0 });
    return res;
  }

  let rid: string | null = null;
  let slug: string | null = null;

  // Jeśli podano slug → zweryfikuj uprawnienia do TEGO lokalu
  if (slugParam) {
    const { data: ra, error: raErr } = await supabase
      .from("restaurant_admins")
      .select("restaurant_id, restaurants!inner(slug)")
      .eq("user_id", userId)
      .eq("restaurants.slug", slugParam)
      .maybeSingle();

    if (raErr) return makeRes({ error: raErr.message }, 500);
    if (!ra?.restaurant_id) return makeRes({ error: "forbidden" }, 403);

    rid = String(ra.restaurant_id);
    slug = (ra as any).restaurants?.slug ?? slugParam;
  }

  // Domyślnie: ostatnio przypisany lokal użytkownika
  if (!rid) {
    const { data: ra, error } = await supabase
      .from("restaurant_admins")
      .select("restaurant_id, restaurants!inner(slug)")
      .eq("user_id", userId)
      .order("added_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return makeRes({ error: error.message }, 500);
    if (!ra?.restaurant_id) return makeRes({ error: "no_restaurant" }, 404);

    rid = String(ra.restaurant_id);
    slug = (ra as any).restaurants?.slug ?? null;
  }

  // zawsze nadpisz cookie
  const res = makeRes({ restaurant_id: rid, restaurant_slug: slug });
  res.cookies.set("restaurant_id", rid!, CK);
  if (slug) res.cookies.set("restaurant_slug", slug, CK);
  return res;
}
