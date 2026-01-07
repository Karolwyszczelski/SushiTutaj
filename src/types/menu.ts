// lib/menu.ts
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export async function fetchMenu(restaurantSlug: string) {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.rpc("get_menu", {
    p_restaurant_slug: restaurantSlug,
    p_now: new Date().toISOString(),
  });
  if (error) throw error;
  return data as any; // potem typujesz
}
