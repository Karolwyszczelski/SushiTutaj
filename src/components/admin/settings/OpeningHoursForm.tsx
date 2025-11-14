// src/components/admin/settings/OpeningHoursForm.tsx
"use client";

import { useEffect, useState } from "react";
import type { Database } from "@/types/supabase";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export interface DayHours {
  day: string;
  open: string;
  close: string;
  breakStart?: string;
  breakEnd?: string;
  closed: boolean;
}

type Props = { supabase: ReturnType<typeof createClientComponentClient<Database>> };

export default function OpeningHoursForm({ supabase }: Props) {
  const weekdays = ["Poniedziałek","Wtorek","Środa","Czwartek","Piątek","Sobota","Niedziela"];
  const [hours, setHours] = useState<DayHours[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.opening_hours) {
        setHours(data.opening_hours);
      } else {
        // domyślne puste godziny
        setHours(weekdays.map(d => ({ day: d, open: "09:00", close: "17:00", breakStart: "", breakEnd: "", closed: false })));
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opening_hours: hours }),
    });
    if (!res.ok) alert("Błąd zapisu");
    setSaving(false);
  };

  if (loading) return <p>Ładowanie…</p>;

  return (
    <div className="space-y-4">
      <table className="w-full table-auto border-collapse">
        <thead>
          <tr>
            <th className="border px-2 py-1">Dzień</th>
            <th className="border px-2 py-1">Otwarcie</th>
            <th className="border px-2 py-1">Zamknięcie</th>
            <th className="border px-2 py-1">Przerwa od</th>
            <th className="border px-2 py-1">Przerwa do</th>
            <th className="border px-2 py-1">Zamknięty</th>
          </tr>
        </thead>
        <tbody>
          {hours.map((h, i) => (
            <tr key={h.day}>
              <td className="border px-2 py-1">{h.day}</td>
              <td className="border px-2 py-1">
                <input
                  type="time"
                  value={h.open}
                  disabled={h.closed}
                  onChange={e => {
                    const v = e.target.value;
                    setHours(prev => {
                      const copy = [...prev];
                      copy[i].open = v;
                      return copy;
                    });
                  }}
                  className="w-full"
                />
              </td>
              <td className="border px-2 py-1">
                <input
                  type="time"
                  value={h.close}
                  disabled={h.closed}
                  onChange={e => {
                    const v = e.target.value;
                    setHours(prev => {
                      const copy = [...prev];
                      copy[i].close = v;
                      return copy;
                    });
                  }}
                  className="w-full"
                />
              </td>
              <td className="border px-2 py-1">
                <input
                  type="time"
                  value={h.breakStart || ""}
                  disabled={h.closed}
                  onChange={e => {
                    const v = e.target.value;
                    setHours(prev => {
                      const copy = [...prev];
                      copy[i].breakStart = v;
                      return copy;
                    });
                  }}
                  className="w-full"
                />
              </td>
              <td className="border px-2 py-1">
                <input
                  type="time"
                  value={h.breakEnd || ""}
                  disabled={h.closed}
                  onChange={e => {
                    const v = e.target.value;
                    setHours(prev => {
                      const copy = [...prev];
                      copy[i].breakEnd = v;
                      return copy;
                    });
                  }}
                  className="w-full"
                />
              </td>
              <td className="border px-2 py-1 text-center">
                <input
                  type="checkbox"
                  checked={h.closed}
                  onChange={e => {
                    const v = e.target.checked;
                    setHours(prev => {
                      const copy = [...prev];
                      copy[i].closed = v;
                      return copy;
                    });
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        onClick={save}
        disabled={saving}
        className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
      >
        {saving ? "Zapisywanie…" : "Zapisz godziny otwarcia"}
      </button>
    </div>
  );
}
