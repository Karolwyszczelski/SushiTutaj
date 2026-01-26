// src/app/api/table-layout/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/adminContext";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function clampStr(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const x = Math.round(n);
  return Math.min(max, Math.max(min, x));
}

function normalizeLayoutName(v: unknown) {
  const raw = clampStr(v, 40);
  if (!raw) return "default";
  // bezpieczny zestaw znaków na klucz (żeby nie robić syfu w unikatowym onConflict)
  const safe = raw.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-");
  return safe || "default";
}

function sanitizePlan(planIn: unknown) {
  const arr = Array.isArray(planIn) ? planIn : [];
  // hard-limit żeby ktoś nie wysłał 50k elementów
  const limited = arr.slice(0, 400);

  return limited.map((t: any) => {
    const id = clampStr(t?.id, 80) ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    const label = clampStr(t?.label ?? t?.name, 40) ?? "Stół";

    const x = clampInt(t?.x, 0, 10000, 0);
    const y = clampInt(t?.y, 0, 10000, 0);
    const w = clampInt(t?.w, 44, 2000, 90);
    const h = clampInt(t?.h, 44, 2000, 90);

    const rotationRaw = Number(t?.rotation ?? t?.rot ?? 0);
    const rotation = Number.isFinite(rotationRaw) ? ((Math.round(rotationRaw) % 360) + 360) % 360 : 0;

    const capacity = clampInt(t?.capacity ?? t?.seats ?? 2, 1, 50, 2);
    const active = Boolean(t?.active ?? true);

    return { id: String(id), label, x, y, w, h, rotation, capacity, active };
  });
}

async function requireRestaurantId() {
  try {
    const ctx = await getAdminContext();
    return ctx.restaurantId;
  } catch {
    return null;
  }
}

export async function GET() {
  const restaurant_id = await requireRestaurantId();
  if (!restaurant_id) return json({ error: "UNAUTHORIZED" }, 401);

  try {
    const { data, error } = await supabaseAdmin
      .from("table_layouts")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .eq("name", "default")
      .maybeSingle();

    if (error) {
      apiLogger.error("table-layout.GET select error", { error: error.message });
      return json({ error: "Błąd pobierania układu" }, 500);
    }

    if (data) return json({ layout: data }, 200);

    const empty = {
      restaurant_id,
      name: "default",
      active: true,
      plan: [] as any[],
    };

    const ins = await supabaseAdmin
      .from("table_layouts")
      .insert(empty)
      .select("*")
      .single();

    if (ins.error) {
      // jeśli konflikt unikalności, rekord już istnieje -> dociągnij i zwróć
      const msg = String(ins.error.message || "");
      if (msg.includes("duplicate key") || msg.includes("23505")) {
        const retry = await supabaseAdmin
          .from("table_layouts")
          .select("*")
          .eq("restaurant_id", restaurant_id)
          .eq("name", "default")
          .maybeSingle();

        if (!retry.error && retry.data) return json({ layout: retry.data }, 200);
      }

      apiLogger.error("table-layout.GET insert error", { error: ins.error.message });
      return json({ error: "Błąd tworzenia układu" }, 500);
    }

    return json({ layout: ins.data }, 200);

  } catch (e: any) {
    apiLogger.error("table-layout.GET unexpected", { error: e?.message || e });
    return json({ error: e?.message || "Server error" }, 500);
  }
}

export async function POST(req: Request) {
  const restaurant_id = await requireRestaurantId();
  if (!restaurant_id) return json({ error: "UNAUTHORIZED" }, 401);

  try {
    const body = (await req.json().catch(() => null)) as any;
    if (!body || typeof body !== "object") {
      return json({ error: "INVALID_BODY" }, 400);
    }

    const name = normalizeLayoutName(body?.name);
    const active = Boolean(body?.active ?? true);
    const plan = sanitizePlan(body?.plan);

    const up = await supabaseAdmin
      .from("table_layouts")
      .upsert(
        { restaurant_id, name, active, plan },
        { onConflict: "restaurant_id,name", ignoreDuplicates: false }
      )
      .select("*")
      .single();

    if (up.error) {
      apiLogger.error("table-layout.POST upsert error", { error: up.error.message });
      return json({ error: "Błąd zapisu układu" }, 500);
    }

    return json({ ok: true, layout: up.data }, 200);
  } catch (e: any) {
    apiLogger.error("table-layout.POST unexpected", { error: e?.message || e });
    return json({ error: e?.message || "Server error" }, 500);
  }
}
