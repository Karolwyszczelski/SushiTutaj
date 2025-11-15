// src/app/api/settings/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import { getSessionAndRole } from "@/lib/serverAuth";

// pomocniczo: dostęp do tabeli "settings" bez czepiania się typów
function settingsTable(supabase: ReturnType<typeof createRouteHandlerClient<Database>>) {
  return (supabase.from("settings") as any);
}

// Pobranie aktualnych ustawień
export async function GET() {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const { data, error } = await settingsTable(supabase)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// Aktualizacja ustawień
export async function PATCH(request: Request) {
  const { session, role } = await getSessionAndRole();
  if (!session || role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const supabase = createRouteHandlerClient<Database>({ cookies });

  // Jeśli pierwszy raz, wstaw wiersz
  const { data: existing } = await settingsTable(supabase)
    .select("id")
    .single();

  let res: { data: unknown; error: any };

  if (existing) {
    res = await settingsTable(supabase)
      .update({
        business_name: body.business_name,
        address:       body.address,
        phone:         body.phone,
        email:         body.email,
        logo_url:      body.logo_url,
        timezone:      body.timezone,
      })
      .eq("id", (existing as any).id);
  } else {
    res = await settingsTable(supabase)
      .insert({
        business_name: body.business_name,
        address:       body.address,
        phone:         body.phone,
        email:         body.email,
        logo_url:      body.logo_url,
        timezone:      body.timezone,
      });
  }

  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500 });
  }

  return NextResponse.json(res.data);
}
