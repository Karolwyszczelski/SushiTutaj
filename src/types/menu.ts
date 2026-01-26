// lib/menu.ts
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export async function fetchMenu(restaurantSlug: string) {
  const supabase = getSupabaseBrowser();
  // Use the view instead of RPC
  const { data, error } = await supabase
    .from("v_menu_by_slug")
    .select("*")
    .eq("restaurant_slug", restaurantSlug);
  if (error) throw error;
  return data as any;
}
