"use client";

import React, { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import Link from "next/link";

type Reservation = {
  id: string;
  customer_name: string;
  reservation_time: string;
  party_size: number;
  status: string;
};

export default function ReservationsTable({ limit }: { limit?: number }) {
  const supabase = createClientComponentClient();
  const [reservations, setReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    supabase
      .from("reservations")
      .select("id, customer_name, reservation_time, party_size, status")
      .order("reservation_time", { ascending: false })
      .limit(limit ?? 10)
      .then(({ data, error }) => {
        if (error) {
          console.error("Błąd pobierania rezerwacji:", error.message);
        } else {
          setReservations(data);
        }
      });
  }, [supabase, limit]);

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="bg-gray-100">
          <th className="px-2 py-1">ID</th>
          <th className="px-2 py-1">Klient</th>
          <th className="px-2 py-1">Data rezerwacji</th>
          <th className="px-2 py-1">Liczba osób</th>
          <th className="px-2 py-1">Status</th>
        </tr>
      </thead>
      <tbody>
        {reservations.map((r) => (
          <tr key={r.id} className="border-t hover:bg-gray-50">
            <td className="px-2 py-1">
              <Link href={`/admin/reservations/${r.id}`} className="text-blue-600 hover:underline">
                {r.id}
              </Link>
            </td>
            <td className="px-2 py-1">{r.customer_name}</td>
            <td className="px-2 py-1">
              {new Date(r.reservation_time).toLocaleString()}
            </td>
            <td className="px-2 py-1">{r.party_size}</td>
            <td className="px-2 py-1 capitalize">{r.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
