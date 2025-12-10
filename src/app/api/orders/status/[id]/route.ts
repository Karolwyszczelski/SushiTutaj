// src/app/api/orders/status/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// mapujemy różne wartości z bazy na "delivery" | "takeaway"
function normalizeOption(
  raw?: string | null
): "delivery" | "takeaway" | string {
  if (!raw) return "takeaway";
  const v = String(raw).toLowerCase();

  if (v === "delivery" || v === "dostawa") return "delivery";
  if (
    v === "takeaway" ||
    v === "na_wynos" ||
    v === "local" ||
    v === "pickup" ||
    v === "odbior"
  ) {
    return "takeaway";
  }

  return raw;
}

/**
 * ETA (godzina realizacji / odbioru)
 *
 * Priorytety:
 * 1) deliveryTime (timestamptz) – kanoniczny czas ustawiony po stronie systemu
 * 2) scheduled_delivery_at (timestamptz) – jeśli kiedyś zaczniesz ją używać
 * 3) client_delivery_time (text) – jeśli jest godziną typu HH:mm (nie "asap")
 * 4) fallback: created_at + X minut (inne dla dostawy / odbioru)
 *
 * Zwracamy zawsze string parsowalny przez Date.parse (ISO) albo HH:mm.
 */
function resolveEta(row: any): string | null {
  // 1) Najpierw twarde timestampy
  if (row?.deliveryTime) {
    return String(row.deliveryTime);
  }

  if (row?.scheduled_delivery_at) {
    return String(row.scheduled_delivery_at);
  }

  // 2) Jeśli klient wybrał konkretną godzinę (HH:mm), to jej użyjemy,
  //    ale ignorujemy specjalną wartość "asap"
  const cdt = row?.client_delivery_time as string | null;
  if (cdt && cdt !== "asap") {
    return String(cdt);
  }

  // 3) Fallback: created_at + domyślny czas
  if (!row?.created_at) return null;

  try {
    const created = new Date(row.created_at);
    if (Number.isNaN(created.getTime())) return null;

    const opt = String(row.selected_option || "").toLowerCase();
    const isDelivery = opt === "delivery" || opt === "dostawa";

    // Tu możesz łatwo podpiąć strefy dostaw – na razie proste stałe:
    const minutes = isDelivery ? 40 : 20; // DOSTAWA ~40 min, NA WYNOS ~20 min

    const etaDate = new Date(created.getTime() + minutes * 60 * 1000);
    return etaDate.toISOString();
  } catch {
    return null;
  }
}

/**
 * Czas wybrany przez klienta
 * - "asap" – klient wybrał "jak najszybciej"
 * - HH:mm albo ISO – konkretna godzina
 *
 * Front ma już:
 *   data.clientRequestedTime === "asap" ? "Jak najszybciej" : fmtHM(...)
 */
function resolveClientRequestedTime(row: any): string | null {
  const val =
    row?.client_delivery_time ??
    row?.scheduled_delivery_at ??
    row?.deliveryTime ??
    null;

  if (!val) return null;
  return String(val);
}

// Używamy luźnego ctx: any (jak w /api/orders/[id]/route.ts), żeby nie walczyć z typami Next 15
export async function GET(_request: Request, ctx: any) {
  const id = ctx?.params?.id as string | undefined;

  if (!id) {
    return NextResponse.json(
      { error: "Brak ID zamówienia" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        `
        id,
        status,
        total_price,
        created_at,
        selected_option,
        client_delivery_time,
        scheduled_delivery_at,
        "deliveryTime"
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("GET /api/orders/status error:", error.message);
      return NextResponse.json(
        { error: "Błąd serwera" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Nie znaleziono zamówienia" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const row: any = data;

    const option = normalizeOption(row.selected_option);
    const eta = resolveEta(row);
    const clientRequestedTime = resolveClientRequestedTime(row);

    const payload = {
      id: row.id,
      status: row.status ?? "new",
      eta,
      option,
      total: Number(row.total_price) || 0,
      placedAt: row.created_at ?? new Date().toISOString(),
      clientRequestedTime,
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("GET /api/orders/status exception:", err?.message || err);
    return NextResponse.json(
      { error: "Błąd serwera" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
