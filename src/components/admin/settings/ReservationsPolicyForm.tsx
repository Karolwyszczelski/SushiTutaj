// src/components/admin/settings/ReservationsPolicyForm.tsx
"use client";

import { useEffect, useState } from "react";
import type { Database } from "@/types/supabase";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface Policy {
  max_party_size: number;
  min_notice_hours: number;
  allow_same_day: boolean;
  cancellation_deadline_hours: number;
}

type Props = { supabase: ReturnType<typeof createClientComponentClient<Database>> };

export default function ReservationsPolicyForm({ supabase }: Props) {
  const [p, setP] = useState<Policy>({
    max_party_size: 10,
    min_notice_hours: 1,
    allow_same_day: true,
    cancellation_deadline_hours: 2,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.reservations_policy) setP(data.reservations_policy);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservations_policy: p }),
    });
    if (!res.ok) alert("Błąd zapisu");
    setSaving(false);
  };

  if (loading) return <p>Ładowanie…</p>;

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <label className="block text-sm">Max. liczba osób</label>
        <input
          type="number"
          min={1}
          value={p.max_party_size}
          onChange={e => setP({ ...p, max_party_size: +e.target.value })}
          className="mt-1 w-full border rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm">Min. czas przed rezerwacją (h)</label>
        <input
          type="number"
          min={0}
          value={p.min_notice_hours}
          onChange={e => setP({ ...p, min_notice_hours: +e.target.value })}
          className="mt-1 w-full border rounded px-3 py-2"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={p.allow_same_day}
          onChange={e => setP({ ...p, allow_same_day: e.target.checked })}
        />
        <span className="text-sm">Pozwól na rezerwacje tego samego dnia</span>
      </div>
      <div>
        <label className="block text-sm">Deadline odwołania (h przed)</label>
        <input
          type="number"
          min={0}
          value={p.cancellation_deadline_hours}
          onChange={e => setP({ ...p, cancellation_deadline_hours: +e.target.value })}
          className="mt-1 w-full border rounded px-3 py-2"
        />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
      >
        {saving ? "Zapisywanie…" : "Zapisz politykę rezerwacji"}
      </button>
    </div>
  );
}
