"use client";

import { useEffect, useMemo, useState } from "react";

type BlockedAddress = {
  id: string;
  pattern: string;
  note: string | null;
  active: boolean;
};

const emptyEntry: Omit<BlockedAddress, "id"> = {
  pattern: "",
  note: "",
  active: true,
};

export default function BlockedAddressesForm() {
  const [rows, setRows] = useState<BlockedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyEntry);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.pattern.localeCompare(b.pattern)),
    [rows]
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/blocked-addresses", {
        cache: "no-store",
      });
      if (!r.ok) {
        setError("Nie udało się pobrać listy blokowanych adresów.");
        setLoading(false);
        return;
      }
      const j = await r.json();
      setRows((j.addresses || []) as BlockedAddress[]);
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
    if (!draft.pattern.trim()) {
      setError("Wzorzec adresu nie może być pusty.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/blocked-addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j?.error || "Błąd zapisu.");
        return;
      }
      setDraft(emptyEntry);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function save(row: BlockedAddress) {
    setSavingId(row.id);
    setError(null);
    try {
      const { id, ...payload } = row;
      const r = await fetch(`/api/admin/blocked-addresses/${id}`, {
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
    if (!confirm("Usunąć ten wpis?")) return;
    setError(null);
    const r = await fetch(`/api/admin/blocked-addresses/${id}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j?.error || "Błąd usuwania.");
      return;
    }
    setRows((prev) => prev.filter((x) => x.id !== id));
  }

  function editLocal(id: string, key: keyof BlockedAddress, val: any) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [key]: val } : r))
    );
  }

  const inputCls =
    "h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 " +
    "shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300";

  const checkboxCls =
    "h-4 w-4 rounded border-slate-400 text-sky-600 focus:ring-sky-500";

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-700">
          {error}
        </div>
      )}

      {/* Lista blokad */}
      <div className="rounded-md border bg-white">
        <div className="border-b p-3 font-semibold">
          Blokowane adresy (dla aktualnej restauracji)
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-4 text-sm text-slate-600">Ładowanie…</div>
          ) : sorted.length === 0 ? (
            <div className="p-4 text-sm text-slate-600">
              Brak zablokowanych adresów.
            </div>
          ) : (
            sorted.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-1 gap-3 p-3 md:grid-cols-12 md:items-center"
              >
                <div className="md:col-span-4 flex flex-col gap-1">
                  <span className="text-[12px] text-slate-600">
                    Wzorzec adresu
                  </span>
                  <input
                    type="text"
                    className={inputCls}
                    value={row.pattern}
                    onChange={(e) =>
                      editLocal(row.id, "pattern", e.target.value)
                    }
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Np. &quot;ul. Leśna 12 Ciechanów&quot; albo fragment, który
                    ma blokować.
                  </p>
                </div>

                <div className="md:col-span-5 flex flex-col gap-1">
                  <span className="text-[12px] text-slate-600">Notatka</span>
                  <input
                    type="text"
                    className={inputCls}
                    value={row.note ?? ""}
                    onChange={(e) =>
                      editLocal(row.id, "note", e.target.value || null)
                    }
                  />
                </div>

                <label className="md:col-span-1 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className={checkboxCls}
                    checked={row.active}
                    onChange={(e) =>
                      editLocal(row.id, "active", e.target.checked)
                    }
                  />
                  <span>Aktywna</span>
                </label>

                <div className="md:col-span-2 flex gap-2">
                  <button
                    onClick={() => save(row)}
                    className="h-9 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    disabled={savingId === row.id}
                  >
                    Zapisz
                  </button>
                  <button
                    onClick={() => remove(row.id)}
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

      {/* Dodawanie nowej blokady */}
      <div className="rounded-md border bg-white">
        <div className="border-b p-3 font-semibold">Dodaj blokadę</div>
        <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-12 md:items-center">
          <div className="md:col-span-4 flex flex-col gap-1">
            <span className="text-[12px] text-slate-600">Wzorzec adresu</span>
            <input
              type="text"
              className={inputCls}
              value={draft.pattern}
              onChange={(e) =>
                setDraft({ ...draft, pattern: e.target.value })
              }
              placeholder='np. "ul. Leśna 12 Ciechanów"'
            />
          </div>
          <div className="md:col-span-5 flex flex-col gap-1">
            <span className="text-[12px] text-slate-600">Notatka</span>
            <input
              type="text"
              className={inputCls}
              value={draft.note ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, note: e.target.value || "" })
              }
              placeholder="info dla obsługi, np. powód blokady"
            />
          </div>
          <label className="md:col-span-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className={checkboxCls}
              checked={draft.active}
              onChange={(e) =>
                setDraft({ ...draft, active: e.target.checked })
              }
            />
            <span>Aktywna</span>
          </label>
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
