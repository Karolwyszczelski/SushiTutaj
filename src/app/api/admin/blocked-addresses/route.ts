// src/app/api/admin/blocked-addresses/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import type { Database } from "@/types/supabase";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const blockedSchema = z.object({
  pattern: z.string().min(1).max(500),
  note: z.string().max(500).nullable().optional(),
  active: z.boolean().optional().default(true),
  type: z.enum(["address", "phone", "email"]).default("address"),
});

type BlockedInput = z.infer<typeof blockedSchema>;

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

  const routeClient = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );

  const {
    data: { user },
    error: sessionError,
  } = await routeClient.auth.getUser();

  if (sessionError || !user) {
    return {
      error: NextResponse.json({ error: "Brak sesji." }, { status: 401 }),
    };
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("restaurant_admins")
    .select("restaurant_id, role")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .in("role", ["owner", "admin", "manager"])
    .maybeSingle();

  if (membershipError) {
    apiLogger.error("blocked_addresses membership error", { error: membershipError });
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

export async function GET() {
  const ctx = await requireAdminAndRestaurant();
  if ("error" in ctx) return ctx.error;
  const { restaurantId } = ctx;

  const { data, error } = await supabaseAdmin
    .from("blocked_addresses")
    .select("id, pattern, note, active, type")
    .eq("restaurant_id", restaurantId)
    .order("pattern", { ascending: true });

  if (error) {
    apiLogger.error("blocked_addresses select error", { error });
    return NextResponse.json(
      { error: "Błąd bazy danych przy pobieraniu blokad." },
      { status: 500 }
    );
  }

  return NextResponse.json({ addresses: data ?? [] });
}

export async function POST(req: Request) {
  const ctx = await requireAdminAndRestaurant();
  if ("error" in ctx) return ctx.error;
  const { restaurantId } = ctx;

  let payload: BlockedInput;
  try {
    const body = await req.json();

    payload = blockedSchema.parse({
      pattern: String(body.pattern || "").trim().toLowerCase(),
      note:
        body.note === undefined || body.note === null
          ? null
          : String(body.note),
      active:
        typeof body.active === "boolean" ? body.active : body.active !== false,
      type:
        String(body.type || "")
          .trim()
          .toLowerCase() || "address",
    });
  } catch (e) {
    apiLogger.error("blocked_addresses invalid body", { error: e });
    return NextResponse.json(
      { error: "Nieprawidłowe dane formularza." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.from("blocked_addresses").insert({
    ...payload,
    restaurant_id: restaurantId,
  });

  if (error) {
    apiLogger.error("blocked_addresses insert error", { error });
    return NextResponse.json(
      { error: "Błąd zapisu blokady w bazie." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
