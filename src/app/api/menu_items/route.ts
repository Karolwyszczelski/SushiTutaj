// src/app/api/menu_items/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies, headers } from "next/headers";
import type { Database } from "@/types/supabase";
import { getSessionAndRole } from "@/lib/serverAuth";

export async function GET() {
  const supabase = createRouteHandlerClient<Database>({ cookies, headers });

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
  // 1) check auth
  const { session, role } = await getSessionAndRole();
  if (!session || role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2) parse JSON body
  let body: {
    name: string;
    price: number;
    category: string;
    subcategory?: string | null;
    description?: string | null;
    ingredients: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 3) insert into Supabase
  const supabase = createRouteHandlerClient<Database>({ cookies, headers });
  const { data, error } = await supabase
    .from("menu_items")
    .insert({
      name: body.name,
      price: body.price,
      category: body.category,
      subcategory: body.subcategory ?? null,
      description: body.description ?? null,
      ingredients: body.ingredients,
      available: true,
      order: 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
