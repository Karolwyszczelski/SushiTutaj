// src/app/admin/page.tsx
import { createSupabaseServer } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { Route } from "next";
import type { Database } from "@/types/supabase";
import AdminLogin from "./login/page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Service role client - omija RLS
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, detectSessionInUrl: false } }
);

export default async function AdminEntry() {
  const supabase = await createSupabaseServer();

  // 1) Sesja użytkownika
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  // Niezalogowany → ekran logowania
  if (userErr || !user) {
    return <AdminLogin />;
  }

  // 2) Czy użytkownik jest administratorem którejkolwiek restauracji?
  // Używamy supabaseAdmin żeby ominąć RLS
  const { data: adminRow, error: adminErr } = await supabaseAdmin
    .from("restaurant_admins")
    .select("user_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin", "manager", "employee"])
    .limit(1)
    .maybeSingle();

  // 3) Routing wg uprawnień
  if (!adminErr && adminRow) {
    // Admin → panel administracyjny
    redirect("/admin/AdminPanel" as Route);
  }

  // Zalogowany, ale nie-admin → strona główna
  redirect("/" as Route);
}
