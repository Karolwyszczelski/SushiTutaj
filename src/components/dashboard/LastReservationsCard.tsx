"use client";

import React from "react";
import Link from "next/link";

// Przykładowe dane zasymulowane
const mockReservations = [
  { id: "1", name: "Anna Kowalska", time: "18:00", guests: 2 },
  { id: "2", name: "Jan Nowak", time: "19:30", guests: 4 },
  { id: "3", name: "Marta Wiśniewska", time: "20:15", guests: 3 },
  { id: "4", name: "Krzysztof Mazur", time: "21:00", guests: 5 },
];

export default function LastReservationsCard() {
  return (
    <div className="bg-gray-900 rounded-lg p-6 shadow-md border border-gray-700 text-white w-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Ostatnie rezerwacje</h2>
        <Link href="/admin/reservations" className="text-sm text-blue-400 hover:underline">
          Zobacz wszystkie
        </Link>
      </div>

      <ul className="space-y-3">
        {mockReservations.map((res) => (
          <li
            key={res.id}
            className="bg-gray-800 p-3 rounded hover:bg-gray-700 transition flex justify-between items-center"
          >
            <div>
              <p className="font-medium">{res.name}</p>
              <p className="text-sm text-gray-400">
                Godz. {res.time} • {res.guests} os.
              </p>
            </div>
            <Link
              href="/admin/reservations"
              className="text-sm text-blue-400 hover:underline"
            >
              Szczegóły
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
