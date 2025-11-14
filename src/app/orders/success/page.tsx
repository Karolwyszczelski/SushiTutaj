// src/app/admin/orders/page.tsx  (Server Component)
import { getAdminContext } from "@/lib/adminContext";

export default async function AdminOrdersPage() {
  const { supabase, restaurantId } = await getAdminContext();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, created_at, name, phone, total_price, status, eta, payment_method, payment_status")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Zamówienia</h1>
      <div className="grid gap-3">
        {orders?.map((o) => (
          <div key={o.id} className="rounded-2xl border p-4">
            <div className="flex justify-between">
              <div>#{o.id}</div>
              <div>{new Date(o.created_at!).toLocaleString("pl-PL")}</div>
            </div>
            <div className="text-sm text-gray-600">{o.name ?? "—"} • {o.phone ?? "—"}</div>
            <div className="mt-2 text-sm">
              Status: <b>{o.status}</b> • Płatność: <b>{o.payment_method}/{o.payment_status}</b> • Suma: <b>{Number(o.total_price).toFixed(2)} zł</b>
            </div>
            {/* przyciski zmiany statusu – patrz poniżej */}
          </div>
        ))}
      </div>
    </div>
  );
}
