// src/components/EditReservationButton.tsx
"use client";

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function EditReservationButton({
  reservation,
  onUpdated,
}: {
  reservation: {
    id: string;
    reservation_date: string;  // "YYYY-MM-DD"
    reservation_time: string;  // "HH:MM"
    number_of_guests: number;
  };
  onUpdated?(): void;
}) {
  const supabase = createClientComponentClient();

  // modal open
  const [open, setOpen] = useState(false);

  // form fields
  const [time, setTime] = useState(reservation.reservation_time);
  const [partySize, setPartySize] = useState(reservation.number_of_guests);

  // tables assignment
  const [tables, setTables] = useState<
    { id: string; table_number: number; seats: number }[]
  >([]);
  const [selectedTable, setSelectedTable] = useState<string>("");

  // loading state
  const [saving, setSaving] = useState(false);

  // fetch available tables when modal opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("restaurant_tables")
        .select("id, table_number, seats")
        .order("table_number", { ascending: true });
      if (data) {
        setTables(data);
        // optionally prefill selectedTable from existing assignment
        const { data: assign } = await supabase
          .from("table_assignments")
          .select("table_id")
          .eq("reservation_id", reservation.id)
          .single();
        if (assign?.table_id) {
          setSelectedTable(assign.table_id);
        }
      }
    })();
  }, [open, reservation.id, supabase]);

  // save changes: time, partySize, table assignment
  const handleSave = async () => {
    setSaving(true);
    // update reservation
    const { error: resErr } = await supabase
      .from("reservations")
      .update({
        reservation_time: time,
        number_of_guests: partySize,
      })
      .eq("id", reservation.id);
    if (resErr) {
      console.error("Błąd aktualizacji rezerwacji:", resErr.message);
      setSaving(false);
      return;
    }

    // upsert table assignment
    if (selectedTable) {
      const { error: upsertErr } = await supabase
        .from("table_assignments")
        .upsert({
          reservation_id: reservation.id,
          table_id: selectedTable,
        })
        .eq("reservation_id", reservation.id);
      if (upsertErr) {
        console.error("Błąd przypisania stolika:", upsertErr.message);
      }
    } else {
      // if unselecting table, remove assignment
      await supabase
        .from("table_assignments")
        .delete()
        .eq("reservation_id", reservation.id);
    }

    setSaving(false);
    setOpen(false);
    onUpdated?.();
  };

  // cancel reservation: set cancelled_at
  const handleCancel = async () => {
    const { error } = await supabase
      .from("reservations")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("id", reservation.id);
    if (error) {
      console.error("Błąd anulowania:", error.message);
    } else {
      setOpen(false);
      onUpdated?.();
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full"
      >
        Edytuj
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black bg-opacity-30"
            onClick={() => setOpen(false)}
          />

          <div className="relative bg-white p-6 rounded-lg shadow-lg w-full max-w-sm space-y-4">
            <h4 className="text-xl font-semibold">Edytuj rezerwację</h4>

            {/* Godzina */}
            <div>
              <label className="block text-sm font-medium">Godzina</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full border rounded px-2 py-1"
              />
            </div>

            {/* Liczba gości */}
            <div>
              <label className="block text-sm font-medium">Liczba osób</label>
              <input
                type="number"
                min={1}
                max={20}
                value={partySize}
                onChange={(e) => setPartySize(+e.target.value)}
                className="w-full border rounded px-2 py-1"
              />
            </div>

            {/* Wybór stolika */}
            <div>
              <label className="block text-sm font-medium">Stolik</label>
              <select
                value={selectedTable}
                onChange={(e) => setSelectedTable(e.target.value)}
                className="w-full border rounded px-2 py-1"
              >
                <option value="">— brak przypisania —</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    Stolik {t.table_number} ({t.seats} os.)
                  </option>
                ))}
              </select>
            </div>

            {/* Akcje */}
            <div className="flex justify-between pt-4 border-t">
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Anuluj rezerwację
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 bg-gray-200 rounded"
                >
                  Zamknij
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Zapisz
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
