export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const zoneSchema = z.object({
  min_distance_km: z.number().nonnegative(),
  max_distance_km: z.number().positive(),
  min_order_value: z.number().nonnegative(),
  cost: z.number().nonnegative(),
  free_over: z.number().nonnegative().nullable(),
  eta_min_minutes: z.number().int().nonnegative(),
  eta_max_minutes: z.number().int().nonnegative(),
  cost_fixed: z.number().nonnegative(),
  cost_per_km: z.number().nonnegative(),
});

type ZoneInput = z.infer<typeof zoneSchema>;

async function requireAdminAndRestaurant() {
  const cookieStore = await cookies();
  const restaurantId = cookieStore.get("restaurant_id")?.value;

  if (!restaurantId) {
    return {
      error: NextResponse.json(
        { error: "Brak wybranego lokalu (cookie restaurant_id)." },
        { status: 400 }
      ),
    };
  }

  const routeClient = createRouteHandlerClient({ cookies });
  const {
    data: { session },
    error: sessionError,
  } = await routeClient.auth.getSession();

  if (sessionError || !session) {
    return {
      error: NextResponse.json({ error: "Brak sesji." }, { status: 401 }),
    };
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("restaurant_admins")
    .select("restaurant_id, role")
    .eq("user_id", session.user.id)
    .eq("restaurant_id", restaurantId)
    .in("role", ["owner", "admin", "manager"])
    .maybeSingle();

  if (membershipError) {
    console.error("[delivery_zones] membership error", membershipError);
    return {
      error: NextResponse.json(
        { error: "Błąd sprawdzania uprawnień." },
        { status: 500 }
      ),
    };
  }

  if (!membership) {
    return {
      error: NextResponse.json(
        { error: "Brak uprawnień do tego lokalu." },
        { status: 403 }
      ),
    };
  }

  return { restaurantId };
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await requireAdminAndRestaurant();
  if ("error" in ctx) return ctx.error;
  const { restaurantId } = ctx;

  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: "Brak ID strefy." }, { status: 400 });
  }

  let payload: ZoneInput;
  try {
    const body = await req.json();
    payload = zoneSchema.parse({
      min_distance_km: Number(body.min_distance_km),
      max_distance_km: Number(body.max_distance_km),
      min_order_value: Number(body.min_order_value),
      cost: Number(body.cost),
      free_over:
        body.free_over === null || body.free_over === ""
          ? null
          : Number(body.free_over),
      eta_min_minutes: Number(body.eta_min_minutes),
      eta_max_minutes: Number(body.eta_max_minutes),
      cost_fixed: Number(body.cost_fixed),
      cost_per_km: Number(body.cost_per_km),
    });
  } catch (e) {
    console.error("[delivery_zones] invalid body (PATCH)", e);
    return NextResponse.json(
      { error: "Nieprawidłowe dane formularza." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("delivery_zones")
    .update(payload)
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  if (error) {
    console.error("[delivery_zones] update error", error);
    return NextResponse.json(
      { error: "Błąd zapisu strefy w bazie." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await requireAdminAndRestaurant();
  if ("error" in ctx) return ctx.error;
  const { restaurantId } = ctx;

  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: "Brak ID strefy." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("delivery_zones")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  if (error) {
    console.error("[delivery_zones] delete error", error);
    return NextResponse.json(
      { error: "Błąd usuwania strefy w bazie." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
