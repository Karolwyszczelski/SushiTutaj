// src/components/admin/settings/BusinessInfoForm.tsx
"use client";

import { useEffect, useState } from "react";
import type { Database } from "@/types/supabase";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Props = { supabase: ReturnType<typeof createClientComponentClient<Database>> };

interface Settings {
  business_name: string;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  timezone: string;
}

export default function BusinessInfoForm({ supabase }: Props) {
  const [s, setS] = useState<Settings>({
    business_name: "",
    address:       "",
    phone:         "",
    email:         "",
    logo_url:      "",
    timezone:      Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setS(data);
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    if (!res.ok) {
      alert("Błąd zapisu: " + await res.text());
    } else {
      alert("Zapisano dane biznesowe");
    }
    setSaving(false);
  };

  if (loading) return <p>Ładowanie…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Nazwa *</label>
          <input
            type="text"
            value={s.business_name}
            onChange={e => setS({ ...s, business_name: e.target.value })}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Strefa czasowa</label>
          <input
            type="text"
            value={s.timezone}
            onChange={e => setS({ ...s, timezone: e.target.value })}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Telefon</label>
          <input
            type="tel"
            value={s.phone}
            onChange={e => setS({ ...s, phone: e.target.value })}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">E‑mail</label>
          <input
            type="email"
            value={s.email}
            onChange={e => setS({ ...s, email: e.target.value })}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium">Adres</label>
          <input
            type="text"
            value={s.address}
            onChange={e => setS({ ...s, address: e.target.value })}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium">Logo (URL)</label>
          <input
            type="url"
            value={s.logo_url}
            onChange={e => setS({ ...s, logo_url: e.target.value })}
            className="mt-1 w-full border rounded px-3 py-2"
          />
          {s.logo_url && (
            <img src={s.logo_url} alt="Logo" className="mt-2 h-16 object-contain" />
          )}
        </div>
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
      >
        {saving ? "Zapisywanie…" : "Zapisz dane biznesowe"}
      </button>
    </div>
  );
}
