// src/app/api/admin/push/subscribe/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { pushLogger } from "@/lib/logger";
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
    } catch (e: any) {
      pushLogger.error("getAdminContext failed", { error: e?.message || e });
      return makeRes({ error: "Unauthorized", details: e?.message || "Brak sesji użytkownika" }, 401);
    }

    // 2) Walidacja subskrypcji (obsługa obu formatów: { subscription: {...} } lub bezpośrednio {...})
    const rawBody = await req.json().catch(() => null);
    const body = (rawBody?.subscription ?? rawBody) as PushSubscriptionJSON | null;
    const bodySlug = typeof rawBody?.restaurant_slug === "string" 
      ? rawBody.restaurant_slug.toLowerCase().trim() 
      : null;

    const endpoint = sanitizeEndpoint(body?.endpoint);
    const p256dh = sanitizeKey(body?.keys?.p256dh);
    const auth = sanitizeKey(body?.keys?.auth);

    if (!endpoint || !p256dh || !auth) {
      return makeRes({ error: "INVALID_SUBSCRIPTION" }, 400);
    }

    // 3) Ustalamy restaurantId - preferuj slug z body (jeśli admin ma do niego dostęp)
    let restaurantId = ctx.restaurantId;
    let restaurantSlug = await getRestaurantSlugById(restaurantId);

    // Jeśli klient wysłał slug w body i jest inny niż z kontekstu - sprawdź i użyj
    if (bodySlug && bodySlug !== restaurantSlug) {
      const { data: bySlug, error: slugErr } = await supabaseAdmin
        .from("restaurants")
        .select("id, slug")
        .eq("slug", bodySlug)
        .maybeSingle();

      if (!slugErr && bySlug?.id) {
        // Sprawdź czy admin ma dostęp do tej restauracji
        const { data: access } = await supabaseAdmin
          .from("restaurant_admins")
          .select("restaurant_id")
          .eq("user_id", ctx.user.id)
          .eq("restaurant_id", bySlug.id)
          .limit(1);

        if (access && access.length > 0) {
          restaurantId = bySlug.id;
          restaurantSlug = (bySlug.slug as string)?.toLowerCase() ?? bodySlug;
          pushLogger.info("Użyto slug z body zamiast z kontekstu", { 
            bodySlug, 
            contextSlug: await getRestaurantSlugById(ctx.restaurantId) 
          });
        }
      }
    }

    // 4) UPSERT zamiast DELETE ALL + INSERT
    // endpoint jest unikalny globalnie - aktualizujemy wpis dla tego konkretnego endpointu
    // NIE usuwamy innych subskrypcji dla tej restauracji (mogą być inne tablety/przeglądarki)
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
          created_at: new Date().toISOString(),
        } as any,
        { onConflict: "endpoint" }
      );

    if (upsertError) {
      pushLogger.error("upsert error", { error: upsertError.message, code: upsertError.code });
      return makeRes({ error: "DB_ERROR", details: upsertError.message }, 500);
    }

    pushLogger.info("Zapisano/zaktualizowano subskrypcję push", { 
      restaurant_slug: restaurantSlug,
      endpoint_suffix: endpoint.slice(-30) 
    });

    return makeRes(
      {
        ok: true,
        restaurant_id: restaurantId,
        restaurant_slug: restaurantSlug,
        renewed: true,
      },
      200
    );
  } catch (e: any) {
    pushLogger.error("unexpected error", { error: e?.message || e });
    return makeRes({ error: "INTERNAL_ERROR" }, 500);
  }
}
