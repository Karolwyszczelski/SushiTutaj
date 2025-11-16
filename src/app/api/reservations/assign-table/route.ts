// src/app/api/reservations/assign-table/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/adminContext";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

export async function POST(req: Request) {
  try {
    const { reservation_id, table_ref, table_label } = await req.json();

    if (!reservation_id || !table_ref) {
      return NextResponse.json(
        { error: "reservation_id i table_ref są wymagane" },
        { status: 400 }
      );
    }

    // 🔐 sprawdzamy zalogowanego admina i jego restaurację
    let restaurantId: string;
    try {
      const ctx = await getAdminContext();
      restaurantId = ctx.restaurantId;
    } catch (err) {
      console.error("assign-table: brak kontekstu admina:", err);
      return NextResponse.json(
        { error: "Brak uprawnień lub brak przypisanej restauracji" },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("reservations")
      .update({
        table_ref: String(table_ref),
        table_label: table_label ?? null,
      })
      .eq("id", reservation_id)
      .eq("restaurant_id", restaurantId) // 🔐 ograniczenie do restauracji admina
      .select("*")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        {
          error:
            "Rezerwacja nie istnieje lub nie należy do restauracji przypisanej do tego konta admina",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, reservation: data });
  } catch (e: any) {
    console.error("POST /api/reservations/assign-table error:", e);
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
