// src/components/admin/settings/TaxSettingsForm.tsx
"use client";

import { useEffect, useState } from "react";
import type { Database } from "@/types/supabase";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface TaxRate {
  category: string;
  rate: number;
}
type Props = { supabase: ReturnType<typeof createClientComponentClient<Database>> };

export default function TaxSettingsForm({ supabase }: Props) {
  const [taxes, setTaxes] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings");
      const json = await res.json();
      setTaxes(json.tax_rates ?? [{ category: "", rate: 0 }]);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tax_rates: taxes }),
    });
    if (!res.ok) alert("Błąd zapisu stawek VAT");
    setSaving(false);
  };

  if (loading) return <p>Ładowanie…</p>;

  return (
    <div className="space-y-4 max-w-md">
      {taxes.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Kategoria"
            value={t.category}
            onChange={e => {
              const v = e.target.value;
              setTaxes(prev => prev.map((x,j) => j===i ? { ...x, category: v } : x));
            }}
            className="flex-1 border rounded px-2 py-1"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={t.rate}
            onChange={e => {
              const v = +e.target.value;
              setTaxes(prev => prev.map((x,j) => j===i ? { ...x, rate: v } : x));
            }}
            className="w-20 border rounded px-2 py-1"
          />
          <button
            type="button"
            onClick={() => setTaxes(prev => prev.filter((_,j) => j!==i))}
            className="text-red-600"
          >
            🗑
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setTaxes(prev => [...prev, { category: "", rate: 0 }])}
        className="text-blue-600 hover:underline"
      >
        + Dodaj stawkę VAT
      </button>
      <div>
        <button
          onClick={save}
          disabled={saving}
          className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          {saving ? "Zapisywanie…" : "Zapisz VAT"}
        </button>
      </div>
    </div>
  );
}
