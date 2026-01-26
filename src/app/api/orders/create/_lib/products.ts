// src/app/api/orders/create/_lib/products.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PRODUCT_TABLES = ["products", "menu_items", "menu", "dishes"] as const;

export type ProductRow = {
  id: string | number;
  name?: string | null;
  title?: string | null;
  label?: string | null;
  description?: string | null;
  description_pl?: string | null;
  subcategory?: string | null;
  category?: string | null;
  ingredients?: any;
  composition?: any;
  sklad?: any;
};

export const parseIngredients = (v: any): string[] => {
  if (!v) return [];
  if (Array.isArray(v))
    return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "object") {
    if (Array.isArray((v as any).items))
      return parseIngredients((v as any).items);
    return Object.values(v)
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof v === "string") {
    const s = v.trim();
    try {
      return parseIngredients(JSON.parse(s));
    } catch {}
    if (s.startsWith("{") && s.endsWith("}")) {
      return s
        .slice(1, -1)
        .split(",")
        .map((x) => x.replace(/^"+|"+$/g, "").trim())
        .filter(Boolean);
    }
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
};

export const nameFromProductRow = (row?: ProductRow): string | undefined =>
  row ? row.name || row.title || row.label || undefined : undefined;

export const descFromProductRow = (row?: ProductRow): string | undefined =>
  row ? row.description_pl ?? row.description ?? undefined : undefined;

export const ingredientsFromProductRow = (row?: ProductRow): string[] =>
  row
    ? parseIngredients(row.ingredients) ||
      parseIngredients(row.composition) ||
      parseIngredients(row.sklad) ||
      []
    : [];

/**
 * UWAGA: to jest 1:1 logika z route.ts, tylko wyniesiona do helpera.
 * Podajemy supabaseAdmin jako parametr (żeby uniknąć cykli importów).
 */
export async function fetchProductsByIds(
  supabaseAdmin: SupabaseClient,
  idsMixed: (string | number)[]
): Promise<Map<string, ProductRow>> {
  const ids = Array.from(new Set(idsMixed.map((x) => String(x)))).filter(Boolean) as string[];
  if (!ids.length) return new Map<string, ProductRow>();

  for (const table of PRODUCT_TABLES) {
    const { data, error } = await (supabaseAdmin as any)
      .from(table)
      .select(
        "id,name,title,label,description,description_pl,subcategory,category,ingredients,composition,sklad"
      )
      .in("id", ids);

    if (!error && data && (data as any[]).length) {
      const map = new Map<string, ProductRow>();
      (data as any[]).forEach((r) => map.set(String((r as any).id), r as ProductRow));
      return map;
    }
  }

  return new Map<string, ProductRow>();
}
