// src/app/api/menu_items/[id]/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSessionAndRole } from "@/lib/serverAuth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { session, role } = await getSessionAndRole();
  if (!session || role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // WA: typy Database nie mają `menu_items` → rzutujemy klienta na any
  const supabase = createRouteHandlerClient({ cookies }) as any;

  const { data, error } = await supabase
    .from("menu_items")
    .update({
      name: body.name,
      price: body.price,
      category_id: body.category_id,
      subcategory: body.subcategory ?? null,
      available: body.available,
      order: body.order,
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { session, role } = await getSessionAndRole();
  if (!session || role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // WA: jw.
  const supabase = createRouteHandlerClient({ cookies }) as any;

  const { error } = await supabase.from("menu_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
