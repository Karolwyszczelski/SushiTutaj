// src/components/admin/settings/BlockedTimesForm.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type BlockKind = "reservation" | "order" | "both";

type BlockedSlot = {
  id: string;
  restaurant_id: string;
  block_date: string; // YYYY-MM-DD
  full_day: boolean;
  from_time: string | null;
  to_time: string | null;
  kind: BlockKind;
  note: string | null;
  created_at?: string;
};

function formatDatePl(d: string) {
  if (!d) return "-";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("pl-PL", {
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function timeRangeLabel(slot: BlockedSlot) {
  if (slot.full_day) return "cały dzień";
  if (!slot.from_time || !slot.to_time) return "—";
  const from = slot.from_time.slice(0, 5);
  const to = slot.to_time.slice(0, 5);
  return `${from}–${to}`;
}

function kindLabel(kind: BlockKind) {
  switch (kind) {
    case "reservation":
      return "Tylko rezerwacje";
    case "order":
      return "Tylko zamówienia online";
    default:
      return "Rezerwacje + zamówienia";
  }
}

export default function BlockedTimesForm({
  restaurantSlug,
}: {
  restaurantSlug: string | null;
}) {
  const [slots, setSlots] = useState<BlockedSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // formularz
  const [date, setDate] = useState("");
  const [fullDay, setFullDay] = useState(false);
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [kind, setKind] = useState<BlockKind>("both");
  const [note, setNote] = useState("");

  const canUse = !!restaurantSlug;

  const sortedSlots = useMemo(
    () =>
      [...slots].sort((a, b) => {
        if (a.block_date === b.block_date) {
          const ta = (a.from_time || "00:00") as string;
          const tb = (b.from_time || "00:00") as string;
          return ta.localeCompare(tb);
        }
        return a.block_date.localeCompare(b.block_date);
      }),
    [slots]
  );

  async function fetchSlots() {
    if (!restaurantSlug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/blocked-times?restaurant=${encodeURIComponent(
          restaurantSlug
        )}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Nie udało się pobrać blokad.");
      }
      setSlots(json.slots || []);
    } catch (e: any) {
      setSlots([]);
      setError(
        e?.message || "Błąd sieci podczas pobierania listy blokad godzin."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchSlots();
  }, [restaurantSlug]);

  function resetForm() {
    setDate("");
    setFullDay(false);
    setFromTime("");
    setToTime("");
    setKind("both");
    setNote("");
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!restaurantSlug) return;

    setError(null);

    if (!date) {
      setError("Wybierz dzień, dla którego chcesz ustawić blokadę.");
      return;
    }
    if (!fullDay && (!fromTime || !toTime)) {
      setError(
        "Ustaw godziny od / do lub zaznacz „Pełny dzień”, żeby zablokować cały dzień."
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/blocked-times?restaurant=${encodeURIComponent(
          restaurantSlug
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            block_date: date,
            full_day: fullDay,
            from_time: fullDay ? null : fromTime,
            to_time: fullDay ? null : toTime,
            kind,
            note: note.trim() || null,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Nie udało się zapisać blokady.");
      }

      const slot = json.slot as BlockedSlot;
      setSlots((prev) => [...prev, slot]);
      resetForm();
    } catch (e: any) {
      setError(e?.message || "Błąd podczas zapisywania blokady.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!restaurantSlug) return;
    if (!window.confirm("Na pewno usunąć tę blokadę?")) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/blocked-times?id=${encodeURIComponent(
          id
        )}&restaurant=${encodeURIComponent(restaurantSlug)}`,
        { method: "DELETE" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Nie udało się usunąć blokady.");
      }
      setSlots((prev) => prev.filter((s) => s.id !== id));
    } catch (e: any) {
      setError(e?.message || "Błąd usuwania blokady.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">
          Blokowane godziny / dni (czas polski)
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Ustaw przedziały godzin lub całe dni, w których ten lokal nie
          przyjmuje rezerwacji / zamówień online. System później wykorzysta te
          dane w koszyku i przy rezerwacjach.
        </p>
      </div>

      {!canUse && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Brakuje parametru <code>?restaurant=slug</code> w adresie URL panelu.
          Blokady godzin są powiązane z konkretnym lokalem, więc najpierw
          wybierz restaurację.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      {/* Formularz dodawania blokady */}
      <form
        onSubmit={handleAdd}
        className="grid gap-3 rounded-md border bg-white p-4 sm:grid-cols-2"
      >
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Dzień
          </label>
          <input
            type="date"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={saving || !canUse}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Co blokujemy
          </label>
          <select
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as BlockKind)}
            disabled={saving || !canUse}
          >
            <option value="both">Rezerwacje + zamówienia online</option>
            <option value="reservation">Tylko rezerwacje</option>
            <option value="order">Tylko zamówienia online</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Godziny (czas polski)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="time"
              step={300}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              disabled={saving || fullDay || !canUse}
            />
            <span className="text-xs text-slate-500">–</span>
            <input
              type="time"
              step={300}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
              disabled={saving || fullDay || !canUse}
            />
          </div>
          <label className="mt-1 inline-flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={fullDay}
              onChange={(e) => setFullDay(e.target.checked)}
              disabled={saving || !canUse}
            />
            <span>Pełny dzień (ignoruje godziny od / do)</span>
          </label>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Notatka (opcjonalnie)
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
            placeholder="np. Święta, awaria kuchni, impreza zamknięta…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving || !canUse}
          />
        </div>

        <div className="mt-2 flex justify-end sm:col-span-2">
          <button
            type="submit"
            disabled={saving || !canUse}
            className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? "Zapisywanie…" : "Dodaj blokadę"}
          </button>
        </div>
      </form>

      {/* Lista istniejących blokad */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            Ustawione blokady
          </h3>
          {loading && (
            <span className="text-xs text-slate-500">Ładowanie…</span>
          )}
        </div>

        {sortedSlots.length === 0 && !loading ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
            Brak blokad – lokal przyjmuje rezerwacje i zamówienia w
            standardowych godzinach.
          </div>
        ) : (
          <ul className="space-y-2">
            {sortedSlots.map((slot) => (
              <li
                key={slot.id}
                className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              >
                <div className="space-y-0.5">
                  <div className="font-medium text-slate-900">
                    {formatDatePl(slot.block_date)} ·{" "}
                    {timeRangeLabel(slot)}
                  </div>
                  <div className="text-xs text-slate-600">
                    {kindLabel(slot.kind)}
                    {slot.note && (
                      <>
                        {" "}
                        · <span className="italic">{slot.note}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(slot.id)}
                  disabled={saving}
                  className="ml-3 inline-flex items-center rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                >
                  Usuń
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
