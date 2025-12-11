// src/app/api/admin/blocked-times/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Supa = ReturnType<typeof createRouteHandlerClient<Database>>;

async function getRestaurantIdOrThrow(
  supabase: Supa,
  searchParams: URLSearchParams
) {
  const slug = (searchParams.get("restaurant") || "").toLowerCase().trim();
  if (!slug) {
    throw new Error(
      "Brak parametru ?restaurant=<slug> w adresie – nie wiadomo, którego lokalu dotyczą ustawienia."
    );
  }

  const { data, error } = await supabase
    .from("restaurants")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Nie znaleziono restauracji o podanym slugu.");
  }

  return data.id as string;
}

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const url = new URL(req.url);
  const searchParams = url.searchParams;

  try {
    const restaurantId = await getRestaurantIdOrThrow(supabase, searchParams);

    const { data, error } = await supabase
      .from("restaurant_blocked_times")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("block_date", { ascending: true })
      .order("from_time", { ascending: true });

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Nie udało się pobrać listy blokad." },
        { status: 500 }
      );
    }

    return NextResponse.json({ slots: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Błąd pobierania blokad godzin." },
      { status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const url = new URL(req.url);
  const searchParams = url.searchParams;

  try {
    const restaurantId = await getRestaurantIdOrThrow(supabase, searchParams);
    const body = await req.json();

    const block_date: string = body.block_date;
    const full_day: boolean = !!body.full_day;
    const from_time: string | null = full_day ? null : body.from_time || null;
    const to_time: string | null = full_day ? null : body.to_time || null;
    const kind: "reservation" | "order" | "both" =
      body.kind === "reservation" || body.kind === "order"
        ? body.kind
        : "both";
    const note: string | null =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim()
        : null;

    if (!block_date) {
      return NextResponse.json(
        { error: "Wymagany jest dzień blokady." },
        { status: 400 }
      );
    }

    if (!full_day && (!from_time || !to_time)) {
      return NextResponse.json(
        {
          error:
            "Dla blokady godzinowej ustaw zarówno godzinę od / do lub zaznacz pełny dzień.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("restaurant_blocked_times")
      .insert({
        restaurant_id: restaurantId,
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
      console.error(error);
      return NextResponse.json(
        { error: "Nie udało się zapisać blokady." },
        { status: 500 }
      );
    }

    return NextResponse.json({ slot: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Błąd zapisu blokady godziny." },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const url = new URL(req.url);
  const searchParams = url.searchParams;

  try {
    const restaurantId = await getRestaurantIdOrThrow(supabase, searchParams);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Brak parametru ?id=<blocked_time_id>." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("restaurant_blocked_times")
      .delete()
      .eq("id", id)
      .eq("restaurant_id", restaurantId);

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Nie udało się usunąć blokady." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Błąd usuwania blokady." },
      { status: 400 }
    );
  }
}
