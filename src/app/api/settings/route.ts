// src/app/api/settings/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import { getSessionAndRole } from "@/lib/serverAuth";

// Pobranie aktualnych ustawień
export async function GET() {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
  const { data: existing } = await supabase
    .from("settings")
    .select("id")
    .single();

  let res;
  if (existing) {
    res = await supabase
      .from("settings")
      .update({
        business_name: body.business_name,
        address:       body.address,
        phone:         body.phone,
        email:         body.email,
        logo_url:      body.logo_url,
        timezone:      body.timezone,
      })
      .eq("id", existing.id);
  } else {
    res = await supabase
      .from("settings")
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
