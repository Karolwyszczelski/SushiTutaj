"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock,
  ChevronDown,
  Trash2,
  Info,
} from "lucide-react";

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

function kindBadgeClass(kind: BlockKind) {
  switch (kind) {
    case "reservation":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "order":
      return "bg-amber-50 text-amber-800 border-amber-200";
    default:
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
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

  // accordion: która data rozwinięta
  const [openDate, setOpenDate] = useState<string | null>(null);

  const sortedSlots = useMemo(() => {
    return [...slots].sort((a, b) => {
      if (a.block_date === b.block_date) {
        const ta = (a.from_time || "00:00") as string;
        const tb = (b.from_time || "00:00") as string;
        return ta.localeCompare(tb);
      }
      return a.block_date.localeCompare(b.block_date);
    });
  }, [slots]);

  const grouped = useMemo(() => {
    const map = new Map<string, BlockedSlot[]>();
    for (const s of sortedSlots) {
      if (!map.has(s.block_date)) map.set(s.block_date, []);
      map.get(s.block_date)!.push(s);
    }
    return Array.from(map.entries()).map(([block_date, items]) => ({
      block_date,
      items,
    }));
  }, [sortedSlots]);

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
      if (!res.ok) throw new Error(json?.error || "Nie udało się pobrać blokad.");
      const next = (json.slots || []) as BlockedSlot[];
      setSlots(next);

      // jeśli nic nie jest rozwinięte, a są dane – rozwiń najbliższą datę (pierwszą po sortowaniu)
      if (!openDate && next.length > 0) {
        const first = [...next]
          .sort((a, b) => a.block_date.localeCompare(b.block_date))[0]?.block_date;
        setOpenDate(first || null);
      }
    } catch (e: any) {
      setSlots([]);
      setError(e?.message || "Błąd sieci podczas pobierania listy blokad godzin.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    if (!fullDay && fromTime && toTime && fromTime >= toTime) {
      setError("Godzina „od” musi być wcześniejsza niż „do”.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/blocked-times?restaurant=${encodeURIComponent(restaurantSlug)}`,
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
      if (!res.ok) throw new Error(json?.error || "Nie udało się zapisać blokady.");

      const slot = json.slot as BlockedSlot;
      setSlots((prev) => [...prev, slot]);
      setOpenDate(slot.block_date); // po dodaniu od razu rozwiń tę datę
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
      if (!res.ok) throw new Error(json?.error || "Nie udało się usunąć blokady.");

      setSlots((prev) => {
        const next = prev.filter((s) => s.id !== id);

        // jeśli usunięto ostatni wpis z rozwiniętej daty – zwin albo przestaw na inną
        if (openDate) {
          const stillHas = next.some((s) => s.block_date === openDate);
          if (!stillHas) {
            const nextDate = next
              .map((s) => s.block_date)
              .sort()
              .at(0);
            setOpenDate(nextDate || null);
          }
        }

        return next;
      });
    } catch (e: any) {
      setError(e?.message || "Błąd usuwania blokady.");
    } finally {
      setSaving(false);
    }
  }

  return (
    // [color-scheme:light] → wymusza jasny wygląd natywnych pickerów/selectów na wielu urządzeniach
    <div className="space-y-5 [color-scheme:light]">
      <div>
        <h2 className="text-lg font-semibold">Blokowane godziny / dni</h2>
        <p className="mt-1 text-sm text-slate-600">
          Ustaw przedziały godzin lub całe dni, w których lokal nie przyjmuje{" "}
          rezerwacji i/lub zamówień online. (Czas: Polska)
        </p>
      </div>

      {!canUse && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Brakuje parametru <code>?restaurant=slug</code> w adresie URL panelu.
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
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2"
      >
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Dzień (kliknij, aby wybrać)
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="date"
              className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white pl-10 pr-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={saving || !canUse}
            />
          </div>
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Info className="h-3.5 w-3.5" />
            Na mobile otworzy się natywny wybór daty.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Co blokujemy
          </label>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
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
            Godziny (PL)
          </label>

          <div className="relative">
            <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <div className="flex items-center gap-2 pl-10">
              <input
                type="time"
                step={300}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:bg-slate-50"
                value={fromTime}
                onChange={(e) => setFromTime(e.target.value)}
                disabled={saving || fullDay || !canUse}
              />
              <span className="text-xs text-slate-500">–</span>
              <input
                type="time"
                step={300}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:bg-slate-50"
                value={toTime}
                onChange={(e) => setToTime(e.target.value)}
                disabled={saving || fullDay || !canUse}
              />
            </div>
          </div>

          <label className="mt-1 inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={fullDay}
              onChange={(e) => setFullDay(e.target.checked)}
              disabled={saving || !canUse}
            />
            <span>Pełny dzień</span>
            <span className="text-xs text-slate-500">
              (ignoruje godziny od/do)
            </span>
          </label>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Notatka (opcjonalnie)
          </label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
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
            className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? "Zapisywanie…" : "Dodaj blokadę"}
          </button>
        </div>
      </form>

      {/* Lista istniejących blokad (accordion po dacie) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            Ustawione blokady
          </h3>
          {loading && <span className="text-xs text-slate-500">Ładowanie…</span>}
        </div>

        {grouped.length === 0 && !loading ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-600">
            Brak blokad – lokal przyjmuje rezerwacje i zamówienia w standardowych
            godzinach.
          </div>
        ) : (
          <div className="space-y-2">
            {grouped.map(({ block_date, items }) => {
              const isOpen = openDate === block_date;
              return (
                <div
                  key={block_date}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenDate((prev) => (prev === block_date ? null : block_date))
                    }
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
                    aria-expanded={isOpen}
                    aria-controls={`bt-${block_date}`}
                    title="Kliknij, aby rozwinąć / zwinąć"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {formatDatePl(block_date)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {items.length} {items.length === 1 ? "blokada" : "blokady"}
                      </div>
                    </div>

                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div id={`bt-${block_date}`} className="border-t border-slate-200">
                      <ul className="divide-y divide-slate-100">
                        {items.map((slot) => (
                          <li
                            key={slot.id}
                            className="flex items-start justify-between gap-3 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-slate-900">
                                  {timeRangeLabel(slot)}
                                </span>
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${kindBadgeClass(
                                    slot.kind
                                  )}`}
                                >
                                  {kindLabel(slot.kind)}
                                </span>
                              </div>

                              {slot.note ? (
                                <div className="mt-1 text-xs text-slate-600">
                                  <span className="italic">{slot.note}</span>
                                </div>
                              ) : null}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDelete(slot.id)}
                              disabled={saving}
                              className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                              title="Usuń blokadę"
                            >
                              <Trash2 className="h-4 w-4" />
                              Usuń
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
