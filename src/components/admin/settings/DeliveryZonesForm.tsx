"use client";

import { useEffect, useMemo, useState } from "react";

type Zone = {
  id: string;
  min_distance_km: number;
  max_distance_km: number;
  min_order_value: number;
  cost: number;
  free_over: number | null;
  eta_min_minutes: number;
  eta_max_minutes: number;
  cost_fixed: number;
  cost_per_km: number;
};

const emptyZone: Omit<Zone, "id"> = {
  min_distance_km: 0,
  max_distance_km: 3,
  min_order_value: 0,
  cost: 0,
  free_over: null,
  eta_min_minutes: 30,
  eta_max_minutes: 60,
  cost_fixed: 0,
  cost_per_km: 0,
};

export default function DeliveryZonesForm() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyZone);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...zones].sort(
        (a, b) =>
          a.min_distance_km - b.min_distance_km ||
          a.max_distance_km - b.max_distance_km
      ),
    [zones]
  );

  async function load() {
  setLoading(true);
  setError(null);
  try {
    const r = await fetch("/api/admin/delivery-zones", {
      cache: "no-store",
    });

    if (!r.ok) {
      let msg = "Nie udało się pobrać stref.";
      try {
        const j = await r.json();
        if (j?.error) msg = j.error;
        console.error("delivery-zones GET error", r.status, j);
      } catch (e) {
        console.error("delivery-zones GET error", r.status, e);
      }
      setError(msg);
      setLoading(false);
      return;
    }

    const j = await r.json();
    setZones((j.zones || []) as Zone[]);
  } catch (e) {
    console.error(e);
    setError("Błąd połączenia z API.");
  } finally {
    setLoading(false);
  }
}

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/delivery-zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j?.error || "Błąd zapisu.");
        return;
      }
      setDraft(emptyZone);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function save(z: Zone) {
    setSavingId(z.id);
    setError(null);
    try {
      const { id, ...payload } = z;
      const r = await fetch(`/api/admin/delivery-zones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j?.error || "Błąd zapisu.");
        return;
      }
      await load();
    } finally {
      setSavingId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Usunąć tę strefę?")) return;
    setError(null);
    const r = await fetch(`/api/admin/delivery-zones/${id}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j?.error || "Błąd usuwania.");
      return;
    }
    setZones((prev) => prev.filter((x) => x.id !== id));
  }

  function editLocal(id: string, key: keyof Zone, val: number | null) {
    setZones((prev) =>
      prev.map((z) => (z.id === id ? { ...z, [key]: val as any } : z))
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-700">
          {error}
        </div>
      )}

      {/* Lista stref */}
      <div className="rounded-md border bg-white">
        <div className="border-b p-3 font-semibold">
          Strefy dostawy (dla aktualnej restauracji)
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-4 text-sm text-slate-600">Ładowanie…</div>
          ) : sorted.length === 0 ? (
            <div className="p-4 text-sm text-slate-600">Brak stref.</div>
          ) : (
            sorted.map((z) => (
              <div
                key={z.id}
                className="grid grid-cols-1 gap-3 p-3 md:grid-cols-12 md:items-center"
              >
                <Num
                  label="Min km"
                  value={z.min_distance_km}
                  onChange={(v) => editLocal(z.id, "min_distance_km", v)}
                />
                <Num
                  label="Max km"
                  value={z.max_distance_km}
                  onChange={(v) => editLocal(z.id, "max_distance_km", v)}
                />
                <Num
                  label="Min zam. (zł)"
                  value={z.min_order_value}
                  onChange={(v) => editLocal(z.id, "min_order_value", v)}
                />
                <Num
                  label="Koszt (zł)"
                  value={z.cost}
                  onChange={(v) => editLocal(z.id, "cost", v)}
                />
                <Num
                  label="Free od (zł)"
                  value={z.free_over ?? 0}
                  nullable
                  onChange={(v) => editLocal(z.id, "free_over", v)}
                />
                <Num
                  label="ETA min"
                  value={z.eta_min_minutes}
                  onChange={(v) => editLocal(z.id, "eta_min_minutes", v)}
                />
                <Num
                  label="ETA max"
                  value={z.eta_max_minutes}
                  onChange={(v) => editLocal(z.id, "eta_max_minutes", v)}
                />
                <Num
                  label="Stała (zł)"
                  value={z.cost_fixed}
                  onChange={(v) => editLocal(z.id, "cost_fixed", v)}
                />
                <Num
                  label="zł/km"
                  value={z.cost_per_km}
                  onChange={(v) => editLocal(z.id, "cost_per_km", v)}
                />
                <div className="md:col-span-2 flex gap-2">
                  <button
                    onClick={() => save(z)}
                    className="h-9 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    disabled={savingId === z.id}
                  >
                    Zapisz
                  </button>
                  <button
                    onClick={() => remove(z.id)}
                    className="h-9 rounded-md bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-500"
                  >
                    Usuń
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Dodawanie */}
      <div className="rounded-md border bg-white">
        <div className="border-b p-3 font-semibold">Dodaj strefę</div>
        <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-12 md:items-center">
          <Num
            label="Min km"
            value={draft.min_distance_km}
            onChange={(v) => setDraft({ ...draft, min_distance_km: v ?? 0 })}
          />
          <Num
            label="Max km"
            value={draft.max_distance_km}
            onChange={(v) => setDraft({ ...draft, max_distance_km: v ?? 0 })}
          />
          <Num
            label="Min zam. (zł)"
            value={draft.min_order_value}
            onChange={(v) => setDraft({ ...draft, min_order_value: v ?? 0 })}
          />
          <Num
            label="Koszt (zł)"
            value={draft.cost}
            onChange={(v) => setDraft({ ...draft, cost: v ?? 0 })}
          />
          <Num
            label="Free od (zł)"
            value={draft.free_over}
            nullable
            onChange={(v) => setDraft({ ...draft, free_over: v })}
          />
          <Num
            label="ETA min"
            value={draft.eta_min_minutes}
            onChange={(v) =>
              setDraft({ ...draft, eta_min_minutes: v ?? 0 })
            }
          />
          <Num
            label="ETA max"
            value={draft.eta_max_minutes}
            onChange={(v) =>
              setDraft({ ...draft, eta_max_minutes: v ?? 0 })
            }
          />
          <Num
            label="Stała (zł)"
            value={draft.cost_fixed}
            onChange={(v) => setDraft({ ...draft, cost_fixed: v ?? 0 })}
          />
          <Num
            label="zł/km"
            value={draft.cost_per_km}
            onChange={(v) => setDraft({ ...draft, cost_per_km: v ?? 0 })}
          />
          <div className="md:col-span-2">
            <button
              onClick={create}
              className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              disabled={creating}
            >
              Dodaj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  nullable = false,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  nullable?: boolean;
}) {
  const inputCls =
    "h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 " +
    "shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300";

  return (
    <label className="flex flex-col gap-1 md:col-span-1">
      <span className="text-[12px] text-slate-600">{label}</span>
      <input
        type="number"
        className={inputCls}
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (nullable && v === "") onChange(null);
          else onChange(Number(v));
        }}
      />
    </label>
  );
}
