import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/dotykacka";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const token = await getAccessToken();
  const doty = await fetch("https://api.dotykacka.pl/v2.0/products", {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json());

  const products = (doty.items || []).map((p: any) => ({
    pos_id: p.id,
    name:   p.name,
    price:  p.priceGross,
    barcode:p.barcode,
  }));

  const { error } = await supabase
    .from("pos_products")
    .upsert(products, { onConflict: ["pos_id"] });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ synced: products.length });
}
