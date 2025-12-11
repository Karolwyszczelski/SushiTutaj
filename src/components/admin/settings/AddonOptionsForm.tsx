// src/components/admin/settings/AddonOptionsForm.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";

type GroupKey =
  | "ramune"
  | "bubble_tea"
  | "juice"
  | "lipton"
  | "cola"
  | "water"
  | "gyoza"
  | "sushi_specjal";

type Row = {
  id: string;
  group_key: GroupKey;
  value: string;
  active: boolean;
  sort: number;
  created_at?: string;
};

const GROUPS: { key: GroupKey; title: string; hint: string; placeholder: string }[] = [
  { key: "ramune", title: "Ramune — smaki", hint: "Np. kiwi, truskawka, winogrono…", placeholder: "np. granat" },
  { key: "bubble_tea", title: "Bubble tea — smaki", hint: "Np. mango, brzoskwinia…", placeholder: "np. marakuja" },
  { key: "juice", title: "Soki — smaki", hint: "Np. jabłko, pomarańcza…", placeholder: "np. multiwitamina" },
  { key: "lipton", title: "Lipton — smaki", hint: "Np. cytryna, brzoskwinia…", placeholder: "np. zielona herbata" },
  { key: "cola", title: "Cola/Pepsi — wariant", hint: "Np. zwykła, zero…", placeholder: "np. cherry" },
  { key: "water", title: "Woda — wariant", hint: "Np. gazowana, niegazowana…", placeholder: "np. lekko gazowana" },
  { key: "gyoza", title: "Gyoza — wariant", hint: "Np. warzywne, z kurczakiem…", placeholder: "np. z krewetką" },
  { key: "sushi_specjal", title: "SUSHI SPECJAŁ — proporcje", hint: "Np. 50/50, 60/40…", placeholder: "np. 70% pieczone / 30% surowe" },
];

export default function AddonOptionsForm({
  restaurantSlug,
}: {
  restaurantSlug: string | null;
}) {
  const canUse = !!restaurantSlug;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Record<string, string>>({});

  const grouped = useMemo(() => {
    const map: Record<string, Row[]> = {};
    rows.forEach((r) => {
      (map[r.group_key] ||= []).push(r);
    });
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => (a.sort - b.sort) || a.value.localeCompare(b.value))
    );
    return map as Record<GroupKey, Row[]>;
  }, [rows]);

  async function fetchAll() {
    if (!restaurantSlug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/addon-options?restaurant=${encodeURIComponent(restaurantSlug)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Nie udało się pobrać opcji.");
      setRows((json.items || []) as Row[]);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || "Błąd pobierania opcji dodatków.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantSlug]);

  async function addOne(group_key: GroupKey) {
    if (!restaurantSlug) return;
    const value = String(draft[group_key] || "").trim();
    if (!value) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/addon-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantSlug, group_key, value, active: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Nie udało się dodać opcji.");
      setRows((prev) => [...prev, json.item as Row]);
      setDraft((p) => ({ ...p, [group_key]: "" }));
    } catch (e: any) {
      setError(e?.message || "Błąd dodawania opcji.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, active: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/addon-options", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Nie udało się zapisać.");
      const updated = json.item as Row;
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e: any) {
      setError(e?.message || "Błąd zapisu.");
    } finally {
      setSaving(false);
    }
  }

  async function removeOne(id: string) {
    if (!window.confirm("Usunąć tę opcję?")) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/addon-options?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Nie udało się usunąć.");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      setError(e?.message || "Błąd usuwania.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Smaki / warianty napojów (per miasto)</h2>
        <p className="mt-1 text-sm text-slate-600">
          To steruje listą wyboru w koszyku (Checkout). Jeśli nic nie ustawisz — system może użyć domyślnych opcji z kodu.
        </p>
      </div>

      {!canUse && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Brakuje parametru <code>?restaurant=slug</code>.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">Konfiguracja</div>
        <div className="flex items-center gap-2">
          {loading && <span className="text-xs text-slate-500">Ładowanie…</span>}
          <button
            type="button"
            onClick={() => void fetchAll()}
            disabled={loading}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Odśwież
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {GROUPS.map((g) => {
          const items = grouped[g.key] || [];
          return (
            <div key={g.key} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{g.title}</div>
                  <div className="text-xs text-slate-600">{g.hint}</div>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={draft[g.key] || ""}
                  onChange={(e) => setDraft((p) => ({ ...p, [g.key]: e.target.value }))}
                  placeholder={g.placeholder}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  disabled={saving || !canUse}
                />
                <button
                  type="button"
                  onClick={() => void addOne(g.key)}
                  disabled={saving || !canUse || !(draft[g.key] || "").trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  <Plus size={16} />
                  Dodaj
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-xs text-slate-600">
                    Brak wpisów dla tej grupy.
                  </div>
                ) : (
                  items.map((r) => (
                    <div
                      key={r.id}
                      className={clsx(
                        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2",
                        r.active
                          ? "border-slate-200 bg-white"
                          : "border-slate-200 bg-slate-50"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {r.value}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          {r.active ? "Aktywne (widoczne w koszyku)" : "Wyłączone"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleActive(r.id, !r.active)}
                          disabled={saving}
                          className={clsx(
                            "rounded-md border px-3 py-1.5 text-xs font-semibold",
                            r.active
                              ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          )}
                        >
                          {r.active ? "Wyłącz" : "Włącz"}
                        </button>

                        <button
                          type="button"
                          onClick={() => void removeOne(r.id)}
                          disabled={saving}
                          className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          <Trash2 size={14} />
                          Usuń
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
