import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false, detectSessionInUrl: false },
  }
);

type VariantRow = {
  id: string;
  product_id: string;
  name: string;
  price_delta_cents: number | null;
  price_cents: number | null;
  position: number | null;
  is_active: boolean | null;
};

type ProductGroupMapRow = {
  product_id: string;
  group_id: string;
  min_select: number | null;
  max_select: number | null;
  is_required: boolean | null;
  position: number | null;
  is_active: boolean | null;
};

type VariantGroupMapRow = {
  variant_id: string;
  group_id: string;
  position: number | null;
  is_active: boolean | null;
};

type GroupRow = {
  id: string;
  restaurant_id: string;
  name: string;
  min_select: number | null;
  max_select: number | null;
  is_required: boolean | null;
  position: number | null;
  is_active: boolean | null;
};

type ModifierRow = {
  id: string;
  group_id: string;
  name: string;
  price_delta_cents: number | null;
  position: number | null;
  is_active: boolean | null;
};

const notNull = <T,>(v: T | null | undefined): v is T => v != null;

const byPos = (a: { position: number | null }, b: { position: number | null }) =>
  (a.position ?? 9999) - (b.position ?? 9999);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("restaurant") || "").toLowerCase().trim();
  if (!slug) return NextResponse.json({ error: "Missing restaurant" }, { status: 400 });

  // 1) restaurant_id po slugu
  const restRes = await supabaseAdmin
    .from("restaurants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (restRes.error || !restRes.data?.id) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  const restaurantId = restRes.data.id as string;

  // 2) produkty dla restauracji
  const prodRes = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("restaurant_id", restaurantId);

  if (prodRes.error) return NextResponse.json({ error: prodRes.error.message }, { status: 500 });

  const productIds = (prodRes.data || []).map((p: any) => String(p.id));
  if (productIds.length === 0) return NextResponse.json({ items: [] });

  // 3) warianty
  const variantsRes = await supabaseAdmin
    .from("product_variants")
    .select("id,product_id,name,price_delta_cents,price_cents,position,is_active")
    .in("product_id", productIds)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (variantsRes.error) return NextResponse.json({ error: variantsRes.error.message }, { status: 500 });

  const variants = (variantsRes.data || []) as VariantRow[];
  const variantIds = variants.map((v) => v.id);

  // 4) mapowanie grup do produktów
  const pmgRes = await supabaseAdmin
    .from("product_modifier_groups")
    .select("product_id,group_id,min_select,max_select,is_required,position,is_active")
    .in("product_id", productIds)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (pmgRes.error) return NextResponse.json({ error: pmgRes.error.message }, { status: 500 });
  const pmg = (pmgRes.data || []) as ProductGroupMapRow[];

  // 5) mapowanie grup do wariantów
  const vmgRes = variantIds.length
    ? await supabaseAdmin
        .from("variant_modifier_groups")
        .select("variant_id,group_id,position,is_active")
        .in("variant_id", variantIds)
        .eq("is_active", true)
        .order("position", { ascending: true })
    : { data: [], error: null as any };

  if (vmgRes.error) return NextResponse.json({ error: vmgRes.error.message }, { status: 500 });
  const vmg = (vmgRes.data || []) as VariantGroupMapRow[];

  const groupIds = Array.from(
    new Set<string>([...pmg.map((r) => r.group_id), ...vmg.map((r) => r.group_id)])
  );

  if (groupIds.length === 0) {
    const items = productIds.map((pid) => ({
      product_id: pid,
      variants: variants.filter((v) => v.product_id === pid).sort(byPos),
      groups: [],
      variant_groups: {},
    }));
    return NextResponse.json({ items });
  }

  // 6) grupy
  const groupsRes = await supabaseAdmin
    .from("modifier_groups")
    .select("id,restaurant_id,name,min_select,max_select,is_required,position,is_active")
    .in("id", groupIds)
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true);

  if (groupsRes.error) return NextResponse.json({ error: groupsRes.error.message }, { status: 500 });

  const groups = (groupsRes.data || []) as GroupRow[];
  const groupById = new Map(groups.map((g) => [g.id, g]));

  // 7) modyfikatory
  const modsRes = await supabaseAdmin
    .from("modifiers")
    .select("id,group_id,name,price_delta_cents,position,is_active")
    .in("group_id", groupIds)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (modsRes.error) return NextResponse.json({ error: modsRes.error.message }, { status: 500 });

  const modifiers = (modsRes.data || []) as ModifierRow[];

  const modsByGroup = new Map<string, ModifierRow[]>();
  for (const m of modifiers) {
    if (!groupById.has(m.group_id)) continue;
    const arr = modsByGroup.get(m.group_id) || [];
    arr.push(m);
    modsByGroup.set(m.group_id, arr);
  }
  for (const [gid, arr] of modsByGroup.entries()) arr.sort(byPos);

  const items = productIds.map((pid) => {
    const productVariants = variants.filter((v) => v.product_id === pid).sort(byPos);

    const baseGroupsMaps = pmg.filter((r) => r.product_id === pid).sort(byPos);
    const baseGroups = baseGroupsMaps
      .map((map) => {
        const g = groupById.get(map.group_id);
        if (!g) return null;

        const min = map.min_select ?? g.min_select ?? 0;
        const max = map.max_select ?? g.max_select ?? min;
        const req = map.is_required ?? g.is_required ?? (Number(min) > 0);

        return {
          id: g.id,
          name: g.name,
          min_select: Number(min) || 0,
          max_select: Number(max) || 0,
          is_required: !!req,
          position: map.position ?? g.position ?? 0,
          modifiers: (modsByGroup.get(g.id) || []).map((m) => ({
            id: m.id,
            name: m.name,
            price_delta_cents: m.price_delta_cents ?? 0,
            position: m.position ?? 0,
          })),
        };
      })
      .filter(notNull)
      .sort(byPos);

    const variant_groups: Record<string, any[]> = {};
    for (const v of productVariants) {
      const maps = vmg.filter((x) => x.variant_id === v.id).sort(byPos);
      const gs = maps
        .map((map) => {
          const g = groupById.get(map.group_id);
          if (!g) return null;

          const min = g.min_select ?? 0;
          const max = g.max_select ?? min;
          const req = g.is_required ?? (Number(min) > 0);

          return {
            id: g.id,
            name: g.name,
            min_select: Number(min) || 0,
            max_select: Number(max) || 0,
            is_required: !!req,
            position: map.position ?? g.position ?? 0,
            modifiers: (modsByGroup.get(g.id) || []).map((m) => ({
              id: m.id,
              name: m.name,
              price_delta_cents: m.price_delta_cents ?? 0,
              position: m.position ?? 0,
            })),
          };
        })
        .filter(notNull)
        .sort(byPos);

      if (gs.length) variant_groups[v.id] = gs;
    }

    return {
      product_id: pid,
      variants: productVariants.map((v) => ({
        id: v.id,
        name: v.name,
        price_delta_cents: (v.price_delta_cents ?? 0) || 0,
        position: v.position ?? 0,
      })),
      groups: baseGroups,
      variant_groups,
    };
  });

  return NextResponse.json({ items });
}
