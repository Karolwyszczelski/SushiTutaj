// START: src/lib/popups.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

export type PromoPopup = {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  btn_type: "close" | "link" | "call";
  btn_label: string;
  btn_url: string;
  position: number;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "sushitutaj-popups" } },
  });
}

export async function getActivePopupsByRestaurantId(
  restaurantId: string
): Promise<PromoPopup[]> {
  if (!restaurantId) return [];

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("restaurant_popups")
    .select("id,title,content,image_url,btn_type,btn_label,btn_url,position")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return [];
  return (data as PromoPopup[]) ?? [];
}
// END: src/lib/popups.ts
