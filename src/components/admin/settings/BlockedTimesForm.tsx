// src/components/admin/settings/BlockedTimesForm.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, CalendarX2, Trash2 } from "lucide-react";

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

function todayKeyPl() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

  // UX: filtr i akordeon
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [onlyFuture, setOnlyFuture] = useState(true);
  const [kindFilter, setKindFilter] = useState<BlockKind | "all">("all");

  const canUse = !!restaurantSlug;
  const today = todayKeyPl();

  const sortedSlots = useMemo(() => {
    const base = [...slots].sort((a, b) => {
      if (a.block_date === b.block_date) {
        const ta = (a.from_time || "00:00") as string;
        const tb = (b.from_time || "00:00") as string;
        return ta.localeCompare(tb);
      }
      return a.block_date.localeCompare(b.block_date);
    });

    const filtered = base.filter((s) => {
      if (onlyFuture && s.block_date < today) return false;
      if (kindFilter !== "all" && s.kind !== kindFilter) return false;
      return true;
    });

    return filtered;
  }, [slots, onlyFuture, kindFilter, today]);

  const groupedByDay = useMemo(() => {
    const map = new Map<string, BlockedSlot[]>();
    sortedSlots.forEach((s) => {
      const arr = map.get(s.block_date) || [];
      arr.push(s);
      map.set(s.block_date, arr);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sortedSlots]);

  useEffect(() => {
    // jeśli otwarty dzień przestał istnieć po filtrach — zamknij
    if (openDay && !groupedByDay.some(([d]) => d === openDay)) {
      setOpenDay(null);
    }
  }, [openDay, groupedByDay]);

    const fetchSlots = useCallback(async () => {
    if (!restaurantSlug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/blocked-times?restaurant=${encodeURIComponent(restaurantSlug)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Nie udało się pobrać blokad.");
      setSlots(json.slots || []);
    } catch (e: any) {
      setSlots([]);
      setError(e?.message || "Błąd sieci podczas pobierania listy blokad godzin.");
    } finally {
      setLoading(false);
    }
  }, [restaurantSlug]);

  useEffect(() => {
    void fetchSlots();
  }, [fetchSlots]);

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
      if (!res.ok) throw new Error(json?.error || "Nie udało się zapisać blokady.");

      const slot = json.slot as BlockedSlot;
      setSlots((prev) => [...prev, slot]);
      setOpenDay(slot.block_date); // UX: otwieramy dzień, do którego dodano
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
      setSlots((prev) => prev.filter((s) => s.id !== id));
    } catch (e: any) {
      setError(e?.message || "Błąd usuwania blokady.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDay(day: string, ids: string[]) {
    if (!restaurantSlug) return;
    if (!ids.length) return;
    if (!window.confirm(`Usunąć wszystkie blokady z dnia ${formatDatePl(day)}?`))
      return;

    setSaving(true);
    setError(null);
    try {
      // prosto i pewnie: lecimy DELETE per id (bez zmian w API)
      await Promise.all(
        ids.map((id) =>
          fetch(
            `/api/admin/blocked-times?id=${encodeURIComponent(
              id
            )}&restaurant=${encodeURIComponent(restaurantSlug)}`,
            { method: "DELETE" }
          ).then(async (r) => {
            if (!r.ok) {
              const j = await r.json().catch(() => ({}));
              throw new Error(j?.error || `Nie udało się usunąć blokady ${id}.`);
            }
          })
        )
      );
      setSlots((prev) => prev.filter((s) => s.block_date !== day));
      setOpenDay(null);
    } catch (e: any) {
      setError(e?.message || "Błąd usuwania blokad z dnia.");
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
          Ustaw przedziały godzin lub całe dni, w których ten lokal nie przyjmuje
          rezerwacji / zamówień online.
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
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
      >
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Dzień
          </label>
          <input
            type="date"
            // FIX: colorScheme light wymusza czarną ikonę i jasne tło popupu
            style={{ colorScheme: "light" }}
            className="w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={saving || !canUse}
            // FIX: kliknięcie gdziekolwiek w input otwiera kalendarz
            onClick={(e) => e.currentTarget.showPicker?.()}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Co blokujemy
          </label>
          <select
            className="w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
              // FIX: colorScheme light wymusza czarną ikonę i jasne tło popupu
              style={{ colorScheme: "light" }}
              className="w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              disabled={saving || fullDay || !canUse}
              // FIX: kliknięcie otwiera zegar
              onClick={(e) => e.currentTarget.showPicker?.()}
            />
            <span className="text-xs text-slate-500">–</span>
            <input
              type="time"
              step={300}
              style={{ colorScheme: "light" }}
              className="w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
              disabled={saving || fullDay || !canUse}
              onClick={(e) => e.currentTarget.showPicker?.()}
            />
          </div>
          <label className="mt-1 inline-flex cursor-pointer items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
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
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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

      {/* Lista blokad */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">
              Ustawione blokady
            </h3>
            {loading && <span className="text-xs text-slate-500">Ładowanie…</span>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                checked={onlyFuture}
                onChange={(e) => setOnlyFuture(e.target.checked)}
              />
              Tylko dziś i przyszłe
            </label>

            <select
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as any)}
            >
              <option value="all">Wszystkie</option>
              <option value="both">Rezerwacje + zamówienia</option>
              <option value="reservation">Tylko rezerwacje</option>
              <option value="order">Tylko zamówienia</option>
            </select>

            <button
              type="button"
              onClick={() => void fetchSlots()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              disabled={loading}
            >
              Odśwież
            </button>
          </div>
        </div>

        {groupedByDay.length === 0 && !loading ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-600">
            Brak blokad dla wybranych filtrów.
          </div>
        ) : (
          <div className="space-y-2">
            {groupedByDay.map(([day, daySlots]) => {
              const isOpen = openDay === day;
              const isToday = day === today;

              const summary = (() => {
                const hasFull = daySlots.some((s) => s.full_day);
                if (hasFull) return "zawiera blokadę całodniową";
                const first = daySlots[0];
                const last = daySlots[daySlots.length - 1];
                return `${timeRangeLabel(first)} … ${timeRangeLabel(last)}`;
              })();

              return (
                <div key={day} className="rounded-xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setOpenDay(isOpen ? null : day)}
                    className="w-full rounded-xl px-4 py-3 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                          <CalendarX2 size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">
                              {formatDatePl(day)}
                            </span>
                            {isToday && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                dziś
                              </span>
                            )}
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                              {daySlots.length}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600">
                            Kliknij, aby {isOpen ? "zwinąć" : "rozwinąć"} • {summary}
                          </div>
                        </div>
                      </div>

                      <ChevronDown
                        size={18}
                        className={`shrink-0 text-slate-500 transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-200 bg-white px-4 py-3">
                      <ul className="space-y-2">
                        {daySlots.map((slot) => (
                          <li
                            key={slot.id}
                            className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                          >
                            <div className="space-y-0.5">
                              <div className="text-sm font-medium text-slate-900">
                                {timeRangeLabel(slot)}
                              </div>
                              <div className="text-xs text-slate-600">
                                {kindLabel(slot.kind)}
                                {slot.note ? (
                                  <>
                                    {" "}
                                    · <span className="italic">{slot.note}</span>
                                  </>
                                ) : null}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDelete(slot.id)}
                              disabled={saving}
                              className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                            >
                              <Trash2 size={14} />
                              Usuń
                            </button>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteDay(
                              day,
                              daySlots.map((s) => s.id)
                            )
                          }
                          disabled={saving}
                          className="rounded-md border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          Usuń wszystkie z tego dnia
                        </button>
                      </div>
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