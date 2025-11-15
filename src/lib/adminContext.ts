// src/lib/adminContext.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { Database } from "@/types/supabase";

export async function getAdminContext() {
  // w Next 15 cookies() jest asynchroniczne
  const cookieStore = await cookies();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // w route handlers będzie dostępne .set, w RSC try/catch to przechwyci
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll wywołane z komponentu serwerowego – można zignorować
          }
        },
      },
    }
  );

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    throw new Error("Unauthorized");
  }

  const { data: membership, error: membershipErr } = await supabase
    .from("restaurant_admins")
    .select("restaurant_id")
    .eq("user_id", user.id)
    .single();

  if (membershipErr || !membership?.restaurant_id) {
    throw new Error("No restaurant access");
  }

  return {
    supabase,
    user,
    restaurantId: membership.restaurant_id as string,
  };
}
