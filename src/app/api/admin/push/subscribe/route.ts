// src/app/api/admin/push/subscribe/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getAdminContext } from "@/lib/adminContext";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, detectSessionInUrl: false } }
);

type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

function makeRes(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function sanitizeEndpoint(v: any) {
  const s = String(v ?? "").trim();
  // minimalna walidacja, żeby nie pakować śmieci do DB
  if (!s || s.length > 2048) return null;
  if (!/^https:\/\/.+/i.test(s)) return null; // webpush endpointy są https
  return s;
}

function sanitizeKey(v: any) {
  const s = String(v ?? "").trim();
  if (!s || s.length > 512) return null;
  // base64url zwykle, ale nie wymuszamy idealnie — tylko odcinamy oczywiste śmieci
  if (/[\s<>"]/g.test(s)) return null;
  return s;
}

async function getRestaurantSlugById(restaurantId: string) {
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("slug")
    .eq("id", restaurantId)
    .maybeSingle<{ slug: string | null }>();

  if (error) throw new Error(error.message);
  const slug = (data?.slug ?? "").toLowerCase().trim();
  if (!slug) throw new Error("Nie znaleziono slugu restauracji dla kontekstu admina.");
  return slug;
}

export async function POST(req: Request) {
  try {
    // 1) Auth + membership-check + restaurant scope
    let ctx: Awaited<ReturnType<typeof getAdminContext>>;
    try {
      ctx = await getAdminContext();
    } catch {
      return makeRes({ error: "Unauthorized" }, 401);
    }

    // 2) Walidacja subskrypcji
    const body = (await req.json().catch(() => null)) as PushSubscriptionJSON | null;

    const endpoint = sanitizeEndpoint(body?.endpoint);
    const p256dh = sanitizeKey(body?.keys?.p256dh);
    const auth = sanitizeKey(body?.keys?.auth);

    if (!endpoint || !p256dh || !auth) {
      return makeRes({ error: "INVALID_SUBSCRIPTION" }, 400);
    }

    // 3) Ustalamy slug z DB po ctx.restaurantId (nie z cookie/body)
    const restaurantId = ctx.restaurantId;
    const restaurantSlug = await getRestaurantSlugById(restaurantId);

    // 4) Upsert (service role), endpoint unikalny globalnie
    const { error: upsertError } = await supabaseAdmin
      .from("admin_push_subscriptions")
      .upsert(
        {
          restaurant_id: restaurantId,
          restaurant_slug: restaurantSlug,
          endpoint,
          subscription: {
            endpoint,
            expirationTime: body?.expirationTime ?? null,
            keys: { p256dh, auth },
          },
          p256dh,
          auth,
          // opcjonalnie: user_id do debug/porządku (jeśli masz kolumnę)
          // user_id: ctx.user.id,
        } as any,
        { onConflict: "endpoint" }
      );

    if (upsertError) {
      console.error("[admin.push.subscribe] upsert error:", upsertError.message);
      return makeRes({ error: "DB_ERROR" }, 500);
    }

    return makeRes(
      {
        ok: true,
        restaurant_id: restaurantId,
        restaurant_slug: restaurantSlug,
      },
      200
    );
  } catch (e: any) {
    console.error("[admin.push.subscribe] unexpected", e?.message || e);
    return makeRes({ error: "INTERNAL_ERROR" }, 500);
  }
}
