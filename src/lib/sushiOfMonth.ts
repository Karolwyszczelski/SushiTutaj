import { createSupabaseServer } from "@/lib/supabaseServer";

export async function getSushiOfMonth(restaurantId?: string) {
  const supabase = await createSupabaseServer();

  // najpierw próbujemy konkretny lokal (jeśli masz w cookie/ctx)
  if (restaurantId) {
    const { data } = await supabase
      .from("sushi_of_month")
      .select("*")
      .eq("legacy_id", "current")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  // fallback – dowolny "current"
  const { data } = await supabase
    .from("sushi_of_month")
    .select("*")
    .eq("legacy_id", "current")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}
