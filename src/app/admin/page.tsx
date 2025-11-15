// src/app/admin/page.tsx
import { supabaseServer } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";
import type { Route } from "next";
import AdminLogin from "./login/page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminEntry() {
  const supabase = supabaseServer();

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
  const { data: adminRow, error: adminErr } = await supabase
    .from("restaurant_admins")
    .select("user_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin", "manager"])
    .limit(1)
    .maybeSingle();

  // 3) Routing wg uprawnień
  if (!adminErr && adminRow) {
    // Admin → panel administracyjny
    redirect("/admin/login" as Route);
  }

  // Zalogowany, ale nie-admin → strona główna
  redirect("/" as Route);
}
