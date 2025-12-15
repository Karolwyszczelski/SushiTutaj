// lib/menu.ts
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export async function fetchMenu(restaurantSlug: string) {
  const supabase = createClientComponentClient();
  const { data, error } = await supabase.rpc("get_menu", {
    p_restaurant_slug: restaurantSlug,
    p_now: new Date().toISOString(),
  });
  if (error) throw error;
  return data as any; // potem typujesz
}
