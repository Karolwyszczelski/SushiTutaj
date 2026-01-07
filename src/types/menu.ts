// lib/menu.ts
import { createBrowserClient } from "@supabase/ssr";

export async function fetchMenu(restaurantSlug: string) {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data, error } = await supabase.rpc("get_menu", {
    p_restaurant_slug: restaurantSlug,
    p_now: new Date().toISOString(),
  });
  if (error) throw error;
  return data as any; // potem typujesz
}
