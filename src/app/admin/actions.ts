// src/app/admin/actions.ts
"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function updateOrderStatus(orderId: string, nextStatus: string) {
  // W Next 15 cookies() jest asynchroniczne
  const cookieStore = await cookies();

  // Tworzymy klienta Supabase (zachowuję Twoją logikę – supabase może być
  // potrzebny do odświeżenia sesji / RLS, nawet jeśli tu go nie używasz wprost)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (k: string) => cookieStore.get(k)?.value,
      },
    }
  );

  // Wywołanie API do zmiany statusu zamówienia
  const resp = await fetch(`/api/orders/status/${orderId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: nextStatus }),
  });

  if (!resp.ok) {
    const payload = await resp.json().catch(() => ({}));
    throw new Error(payload?.error || "Update failed");
  }
}
