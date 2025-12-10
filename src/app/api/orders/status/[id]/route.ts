export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
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

// wybieramy sensowne ETA z dostępnych kolumn
function resolveEta(row: any): string | null {
  const planned =
    row?.delivery_time ??
    row?.deliveryTime ??
    row?.client_delivery_time ??
    null;

  if (!planned) return null;
  return String(planned);
}

// czas wybrany przez klienta – też z kilku możliwych kolumn
function resolveClientRequestedTime(row: any): string | null {
  const val = row?.client_delivery_time ?? row?.deliveryTime ?? null;
  if (!val) return null;
  return String(val);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id;

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
        delivery_time,
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

    // data traktujemy jako "any", żeby uniknąć konfliktów typów przy Row
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
