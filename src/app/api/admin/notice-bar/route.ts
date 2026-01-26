// src/app/api/admin/notice-bar/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/adminContext";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, detectSessionInUrl: false } }
);

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const isTime = (v: any) =>
  typeof v === "string" &&
  /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v);

function normalizeTime(v: any): string {
  // przyjmujemy "H:mm", "HH:mm", opcjonalnie ":ss" -> zwracamy "HH:mm:ss"
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return s;
  const hh = String(parseInt(m[1], 10)).padStart(2, "0");
  const mm = m[2];
  const ss = (m[3] ?? "00").padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function makeKeys(scope: "global" | "restaurant", restaurantSlug?: string | null) {
  if (scope === "global") return { key: "global", restaurant_slug: "__global__" };
  const slug = (restaurantSlug || "").toLowerCase().trim();
  return { key: `restaurant:${slug}`, restaurant_slug: slug };
}

function parseAllowlist(envVal: string | undefined) {
  return (envVal ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function canWriteGlobal(user: { id: string; email?: string | null }) {
  // Ustaw w ENV (na Vercel/SRV):
  // NOTICE_BAR_GLOBAL_ALLOW_USER_IDS="uuid1,uuid2"
  // lub NOTICE_BAR_GLOBAL_ALLOW_EMAILS="a@b.pl,c@d.pl"
  const allowIds = parseAllowlist(process.env.NOTICE_BAR_GLOBAL_ALLOW_USER_IDS);
  if (allowIds.length && allowIds.includes(user.id)) return true;

  const email = (user.email ?? "").toLowerCase().trim();
  const allowEmails = parseAllowlist(process.env.NOTICE_BAR_GLOBAL_ALLOW_EMAILS).map((e) =>
    e.toLowerCase()
  );
  if (email && allowEmails.length && allowEmails.includes(email)) return true;

  return false;
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

export async function GET() {
  // Auth + membership-check + scope lokalu (z cookie, ale zweryfikowane w getAdminContext)
  let ctx: Awaited<ReturnType<typeof getAdminContext>>;
  try {
    ctx = await getAdminContext();
  } catch {
    return json({ global: null, restaurant: null, error: "UNAUTHORIZED" }, 401);
  }

  try {
    const restaurantSlug = await getRestaurantSlugById(ctx.restaurantId);

    const g = await supabaseAdmin
      .from("notice_bars")
      .select("*")
      .eq("key", "global")
      .maybeSingle();

    const rKey = `restaurant:${restaurantSlug}`;
    const r = await supabaseAdmin
      .from("notice_bars")
      .select("*")
      .eq("key", rKey)
      .maybeSingle();

    return json(
      {
        global: g.data ?? null,
        restaurant: r.data ?? null,
      },
      200
    );
  } catch (e: any) {
    apiLogger.error("admin.notice-bar GET error", { error: e?.message || e });
    return json({ global: null, restaurant: null, error: "INTERNAL_ERROR" }, 500);
  }
}

export async function POST(req: Request) {
  // Auth + membership-check + scope lokalu
  let ctx: Awaited<ReturnType<typeof getAdminContext>>;
  try {
    ctx = await getAdminContext();
  } catch {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = (await req.json().catch(() => null)) as any;
  if (!body) return json({ error: "Bad request" }, 400);

  const scope: "global" | "restaurant" = body.scope === "global" ? "global" : "restaurant";

  // Global: tylko allowlista
  if (scope === "global" && !canWriteGlobal(ctx.user)) {
    return json(
      {
        error:
          "Forbidden: brak uprawnień do globalnego notice bara. Ustaw allowlistę w ENV (NOTICE_BAR_GLOBAL_ALLOW_USER_IDS lub NOTICE_BAR_GLOBAL_ALLOW_EMAILS).",
      },
      403
    );
  }

  if (!isTime(body.open_time)) {
    return json({ error: "Invalid open_time (HH:MM)" }, 400);
  }
  if (body.close_time != null && body.close_time !== "" && !isTime(body.close_time)) {
    return json({ error: "Invalid close_time (HH:MM)" }, 400);
  }

  // Restaurant slug bierzemy z DB po ctx.restaurantId (NIE z body)
  const restaurantSlug =
    scope === "restaurant" ? await getRestaurantSlugById(ctx.restaurantId) : null;

  const { key, restaurant_slug } = makeKeys(scope, restaurantSlug);

  const payload = {
    key,
    scope,
    restaurant_slug,
    enabled: !!body.enabled,
    open_time: normalizeTime(body.open_time),
    close_time: body.close_time ? normalizeTime(body.close_time) : null,
    message_pre_open: String(body.message_pre_open || "").slice(0, 1200),
    message_post_close: String(body.message_post_close || "").slice(0, 1200),
  };

  const { data, error } = await supabaseAdmin
    .from("notice_bars")
    .upsert(payload, { onConflict: "key" })
    .select("*")
    .maybeSingle();

  if (error) {
    apiLogger.error("admin.notice-bar POST error", { error: error.message });
    return json({ error: error.message }, 500);
  }

  return json({ ok: true, row: data ?? null }, 200);
}
