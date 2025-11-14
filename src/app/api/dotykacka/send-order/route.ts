import { NextResponse } from "next/server";
import { getDotykackaToken } from "@/lib/dotykacka";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { orderId } = await req.json();
  // pobierz z supabase zamówienie i pozycje
  const { data: [order] } = await supabase
    .from("orders")
    .select("items, id, deliveryTime, address")
    .eq("id", orderId);

  const items = JSON.parse(order.items);
  // pobierz mapping nazwa → pos_id
  const names = items.map((i:any) => i.name);
  const { data: posProducts } = await supabase
    .from("pos_products")
    .select("pos_id, name")
    .in("name", names);

  const lines = items.map((it:any) => {
    const prod = posProducts!.find(p=>p.name===it.name);
    return {
      product_id: prod?.pos_id,
      quantity:   it.quantity,
      unit_price: it.price,
    };
  });

  const payload = {
    cashRegisterId: process.env.DOTYKACKA_REGISTER_ID,
    extId:          order.id,
    date:           new Date().toISOString(),
    lines,
    done:           true,
    printers:       ["kitchen","bar"],
  };

  const token = await getDotykackaToken();
  await fetch("https://api.dotykacka.pl/v2.0/sales", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return NextResponse.json({ ok: true });
}
