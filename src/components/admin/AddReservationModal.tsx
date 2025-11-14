"use client";

import React, { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function AddReservationModal({
  onClose,
  onCreated,
}: {
  onClose(): void;
  onCreated(): void;
}) {
  const supabase = createClientComponentClient();
  const [customerName, setCustomerName] = useState("");
  const [reserveDateTime, setReserveDateTime] = useState(""); // "YYYY-MM-DDTHH:MM"
  const [partySize, setPartySize] = useState(1);
  const [phone, setPhone] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    // rozbijamy datetime-local na datę + godzinę
    const [reservation_date, reservation_time] = reserveDateTime.split("T");

    const { error } = await supabase
      .from("reservations")
      .insert({
        customer_name:    customerName,
        customer_phone:   phone,
        reservation_date: reservation_date,
        reservation_time: reservation_time,
        number_of_guests: partySize,
      });

    if (error) {
      console.error("Nie udało się dodać rezerwacji:", error.message);
    } else {
      onCreated();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-30"
        onClick={onClose}
      />
      <form
        onSubmit={save}
        className="relative bg-white rounded-lg shadow-lg p-6 w-full max-w-md space-y-4"
      >
        <h2 className="text-xl font-bold">Nowa rezerwacja</h2>

        <div>
          <label className="block text-sm">Imię i nazwisko</label>
          <input
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            required
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm">Data i godzina</label>
          <input
            type="datetime-local"
            value={reserveDateTime}
            onChange={e => setReserveDateTime(e.target.value)}
            required
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm">Liczba osób</label>
          <input
            type="number"
            min={1}
            value={partySize}
            onChange={e => setPartySize(+e.target.value)}
            required
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm">Telefon</label>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            required
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded hover:bg-gray-100"
          >
            Anuluj
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Zapisz
          </button>
        </div>
      </form>
    </div>
  );
}
