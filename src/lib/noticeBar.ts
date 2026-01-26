import { createClient } from "@supabase/supabase-js";

export type NoticeBarConfig = {
  key: string;
  scope: "global" | "restaurant";
  restaurant_slug: string;
  enabled: boolean;
  open_time: string; // np. "12:00:00"
  close_time: string | null; // np. "22:00:00"
  message_pre_open: string;
  message_post_close: string;
  updated_at: string;
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false, detectSessionInUrl: false },
  }
);

export async function getResolvedNoticeBar(
  restaurantSlug: string
): Promise<NoticeBarConfig | null> {
  const slug = (restaurantSlug || "").toLowerCase().trim();
  const restaurantKey = slug ? `restaurant:${slug}` : null;

  if (restaurantKey) {
    const { data: r } = await supabaseAdmin
      .from("notice_bars")
      .select("*")
      .eq("key", restaurantKey)
      .maybeSingle();

    if (r?.enabled) return r as NoticeBarConfig;
  }

  const { data: g } = await supabaseAdmin
    .from("notice_bars")
    .select("*")
    .eq("key", "global")
    .maybeSingle();

  return g?.enabled ? (g as NoticeBarConfig) : null;
}
