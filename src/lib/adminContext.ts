// src/lib/adminContext.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { Database } from "@/types/supabase"; // jeśli masz typy

export async function getAdminContext() {
  const cookieStore = cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (key) => cookieStore.get(key)?.value,
      },
    }
  );

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error("Unauthorized");

  const { data: membership } = await supabase
    .from("restaurant_admins")
    .select("restaurant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.restaurant_id) throw new Error("No restaurant access");

  return { supabase, user, restaurantId: membership.restaurant_id as string };
}
