// src/app/api/admin/blocked-times/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { getAdminContext } from "@/lib/adminContext";

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isYmd(v: string) {
  // YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isHm(v: string) {
  // HH:mm (00:00 - 23:59)
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
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

export async function GET() {
  // Auth + membership-check + scope restauracji
  let ctx: Awaited<ReturnType<typeof getAdminContext>>;
  try {
    ctx = await getAdminContext();
  } catch {
    return json({ slots: [], error: "UNAUTHORIZED" }, 401);
  }

  const { data, error } = await ctx.supabase
    .from("restaurant_blocked_times")
    .select("*")
    .eq("restaurant_id", ctx.restaurantId)
    .order("block_date", { ascending: true })
    .order("from_time", { ascending: true });

  if (error) {
    apiLogger.error("admin.blocked-times GET error", { error: error.message });
    return json({ error: "Nie udało się pobrać listy blokad." }, 500);
  }

  return json({ slots: data ?? [] }, 200);
}

export async function POST(req: NextRequest) {
  // Auth + membership-check + scope restauracji
  let ctx: Awaited<ReturnType<typeof getAdminContext>>;
  try {
    ctx = await getAdminContext();
  } catch {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Nieprawidłowy JSON w body." }, 400);
  }

  const block_date: string = String(body?.block_date ?? "").trim();
  const full_day: boolean = !!body?.full_day;

  const from_time: string | null = full_day
    ? null
    : typeof body?.from_time === "string"
    ? body.from_time.trim()
    : null;

  const to_time: string | null = full_day
    ? null
    : typeof body?.to_time === "string"
    ? body.to_time.trim()
    : null;

  const kind: "reservation" | "order" | "both" =
    body?.kind === "reservation" || body?.kind === "order" || body?.kind === "both"
      ? body.kind
      : "both";

  const note: string | null =
    typeof body?.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 300)
      : null;

  if (!block_date || !isYmd(block_date)) {
    return json({ error: "Wymagany jest poprawny dzień blokady (YYYY-MM-DD)." }, 400);
  }

  if (!full_day) {
    if (!from_time || !to_time) {
      return json(
        {
          error:
            "Dla blokady godzinowej ustaw zarówno godzinę od / do lub zaznacz pełny dzień.",
        },
        400
      );
    }
    if (!isHm(from_time) || !isHm(to_time)) {
      return json({ error: "Godziny muszą mieć format HH:mm." }, 400);
    }
    // Porównanie leksykograficzne działa dla HH:mm
    if (from_time >= to_time) {
      return json({ error: "Godzina 'od' musi być wcześniejsza niż 'do'." }, 400);
    }
  }

  const { data, error } = await ctx.supabase
    .from("restaurant_blocked_times")
    .insert({
      restaurant_id: ctx.restaurantId, // <- twardy scope, bez querystringa
      block_date,
      full_day,
      from_time,
      to_time,
      kind,
      note,
    })
    .select("*")
    .single();

  if (error || !data) {
    apiLogger.error("admin.blocked-times POST error", { error: error?.message || error });
    return json({ error: "Nie udało się zapisać blokady." }, 500);
  }

  return json({ slot: data }, 200);
}

export async function DELETE(req: NextRequest) {
  // Auth + membership-check + scope restauracji
  let ctx: Awaited<ReturnType<typeof getAdminContext>>;
  try {
    ctx = await getAdminContext();
  } catch {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const url = new URL(req.url);
  const idRaw = url.searchParams.get("id");
  const id = normalizeUuid(idRaw);

  if (!id) {
    return json({ error: "Brak lub nieprawidłowy parametr ?id=<blocked_time_id>." }, 400);
  }

  const { error } = await ctx.supabase
    .from("restaurant_blocked_times")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", ctx.restaurantId);

  if (error) {
    apiLogger.error("admin.blocked-times DELETE error", { error: error.message });
    return json({ error: "Nie udało się usunąć blokady." }, 500);
  }

  return json({ ok: true }, 200);
}
