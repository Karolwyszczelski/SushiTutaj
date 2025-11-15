// src/components/admin/OrdersTable.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

export default function OrdersTable({ limit }: { limit?: number }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch(
          `/api/orders/current?scope=open&limit=${limit || 10}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        setOrders(json.orders || []);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [limit]);

  if (loading)
    return <p className="text-sm text-gray-500">Ładowanie…</p>;
  if (!orders.length)
    return <p className="text-sm text-gray-500">Brak zamówień.</p>;

  return (
    <table className="w-full text-left">
      <thead>
        <tr>
          <th>ID</th>
          <th>Klient</th>
          <th>Kwota</th>
          <th>Status</th>
          <th>Data</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o: any) => (
          <tr key={o.id} className="border-t">
            <td>
              <Link
                href={{
                  pathname: "/admin/order/[id]",
                  query: { id: String(o.id) },
                }}
              >
                {o.id}
              </Link>
            </td>
            <td>{o.customer_name || o.client_name || o.name || "—"}</td>
            <td>{Number(o.total_price || 0).toFixed(2)} zł</td>
            <td>{o.status}</td>
            <td>
              {o.created_at
                ? new Date(o.created_at).toLocaleString("pl-PL")
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
