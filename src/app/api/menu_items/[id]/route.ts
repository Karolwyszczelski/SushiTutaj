// src/app/api/menu_items/[id]/route.ts
import type { RouteContext } from "next";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import { getSessionAndRole } from "@/lib/serverAuth";

type Route = "/api/menu_items/[id]";

export async function PATCH(
  request: Request,
  ctx: RouteContext<Route>
) {
  const { id } = await ctx.params;

  const { session, role } = await getSessionAndRole();
  if (!session || role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { data, error } = await supabase
    .from("menu_items")
    .update({
      name: body.name,
      price: body.price,
      category_id: body.category_id,
      subcategory: body.subcategory || null,
      available: body.available,
      order: body.order,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<Route>
) {
  const { id } = await ctx.params;

  const { session, role } = await getSessionAndRole();
  if (!session || role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { error } = await supabase
    .from("menu_items")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
