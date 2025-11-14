// src/app/api/menu_items/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSessionAndRole } from "@/lib/serverAuth";

export async function GET() {
  // ✅ tylko cookies — bez headers
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from("menu_items")
    .select("*")
    .order("order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  // 1) auth
  const { session, role } = await getSessionAndRole();
  if (!session || role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2) parse JSON
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 3) insert
 const supabase = createRouteHandlerClient({ cookies });

  // Uwaga: w projekcie aktualizacje używają `category_id`.
  // Dla zgodności: jeśli przyjdzie `category`, mapujemy go do `category_id`.
  const insertPayload: any = {
    name: body.name,
    price: body.price,
    category_id: body.category_id ?? body.category ?? null,
    subcategory: body.subcategory ?? null,
    description: body.description ?? null,
    ingredients: body.ingredients,
    available: true,
    order: 0,
  };

  const { data, error } = await supabase
    .from("menu_items")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
