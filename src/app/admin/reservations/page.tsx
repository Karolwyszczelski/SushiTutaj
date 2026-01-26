"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { useSearchParams } from "next/navigation";

/* ===== pomocnicze ===== */
const getCookie = (k: string): string | null => {
  if (typeof document === "undefined") return null;
  const row =
    document.cookie
      .split("; ")
      .find(
        (r) =>
          r.startsWith(`${k}=`) ||
          r.startsWith(`${encodeURIComponent(k)}=`)
      ) || null;
  if (!row) return null;
  const value = row.substring(row.indexOf("=") + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

type Reservation = {
  id: string;
  restaurant_id: string | null;
  reservation_date: string; // YYYY-MM-DD
  reservation_time: string; // HH:MM:SS
  guests: number | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  status: string | null; // new | accepted | cancelled
  confirmed_at?: string | null;

  // pola już istniejące w tabeli – wykorzystamy je do oznaczenia zamówienia
  admin_note?: string | null;
  table_ref?: string | null;
  table_label?: string | null;
  table_id?: string | null;
};

export default function ReservationsPage() {
  const supabase = getSupabaseBrowser();
  const searchParams = useSearchParams();
  const urlSlug =
    (searchParams.get("restaurant") || "").toLowerCase() || null;

  const today = new Date();

  // miasto: z query ?restaurant, z ensure-cookie lub z cookie.
  const [booted, setBooted] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  // kalendarz
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [reservedDays, setReservedDays] = useState<Set<number>>(new Set());

  // dane
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  /* --- init ze slugiem + restaurant_id z /api/restaurants/ensure-cookie --- */
  useEffect(() => {
    const init = async () => {
      try {
        const url = urlSlug
          ? `/api/restaurants/ensure-cookie?restaurant=${encodeURIComponent(
              urlSlug
            )}`
          : "/api/restaurants/ensure-cookie";

        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json().catch(() => ({} as any));

        const s =
          urlSlug ||
          (j?.restaurant_slug as string | undefined) ||
          getCookie("restaurant_slug") ||
          null;

        setSlug(s);

        if (j?.restaurant_id && typeof j.restaurant_id === "string") {
          setRestaurantId(j.restaurant_id);
        }
      } finally {
        setBooted(true);
      }
    };
    void init();
  }, [urlSlug]);

  const fmtDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  /* --- ładowanie listy dnia + zaznaczenia miesiąca --- */
  useEffect(() => {
    if (!restaurantId) return;
    let stop = false;

    const load = async () => {
      setLoading(true);
      try {
        const dateStr = fmtDate(selectedDate);

        const [{ data, error }, marks] = await Promise.all([
          supabase
            .from("reservations")
            .select("*")
            .eq("restaurant_id", restaurantId)
            .eq("reservation_date", dateStr)
            .order("reservation_time", { ascending: true }),
          supabase
            .from("reservations")
            .select("reservation_date")
            .eq("restaurant_id", restaurantId)
            .gte(
              "reservation_date",
              fmtDate(new Date(viewYear, viewMonth, 1))
            )
            .lte(
              "reservation_date",
              fmtDate(new Date(viewYear, viewMonth + 1, 0))
            ),
        ]);

        if (!stop) {
          if (error) throw error;
          setReservations((data as Reservation[]) ?? []);
          const s = new Set<number>();
          (marks.data || []).forEach((r: any) =>
            s.add(parseInt(String(r.reservation_date).slice(8, 10), 10))
          );
          setReservedDays(s);
        }
      } catch (e) {
        if (!stop) {
          console.error("Błąd ładowania rezerwacji", e);
          setReservations([]);
          setReservedDays(new Set());
        }
      } finally {
        if (!stop) setLoading(false);
      }
    };

    void load();
    return () => {
      stop = true;
    };
  }, [restaurantId, selectedDate, viewYear, viewMonth, supabase]);

  /* --- kalendarz siatka --- */
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const offset = (firstDow + 6) % 7;
  const weeks: (number | null)[][] = [];
  let d = 1 - offset;
  while (d <= daysInMonth) {
    const w: (number | null)[] = [];
    for (let i = 0; i < 7; i++, d++) {
      w.push(d >= 1 && d <= daysInMonth ? d : null);
    }
    weeks.push(w);
  }

  /* --- grupowanie po HH:MM --- */
  const byHour = useMemo(() => {
    const out: Record<string, Reservation[]> = {};
    for (const r of reservations) {
      const hhmm = String(r.reservation_time).slice(0, 5);
      (out[hhmm] ||= []).push(r);
    }
    return out;
  }, [reservations]);

  const headerDate = selectedDate.toLocaleDateString("pl-PL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  /* --- nawigacja dzień-po-dniu (widoczna i na mobile) --- */
  function shiftDay(step: 1 | -1) {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + step);
    setSelectedDate(next);
    // zsynchronizuj widok miesiąca
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  /* --- akcje accept/cancel z mailem (API) --- */
  async function act(id: string, action: "accept" | "cancel") {
    setBusyId(id);
    try {
      const r = await fetch("/api/reservations/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j?.error || "Błąd operacji");
        return;
      }
      // miękkie odświeżenie
      setSelectedDate(new Date(selectedDate));
    } finally {
      setBusyId(null);
    }
  }

  /* --- UI --- */
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* komunikat gdy brak sluga / restauracji */}
      {booted && !slug && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Brak <code>restaurant_slug</code> w cookie. Otwórz stronę wyboru
          restauracji lub dodaj parametr <code>?restaurant=ciechanow</code>.
        </div>
      )}
      {booted && slug && !restaurantId && (
        <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-900">
          Nie udało się pobrać <code>restaurant_id</code> dla slugu{" "}
          <code>{slug}</code>. Sprawdź, czy istnieje wpis w tabeli{" "}
          <code>restaurants</code> oraz polityki RLS.
        </div>
      )}

      {/* Header jak w AdminPanel, bez selektora miast */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Rezerwacje</h1>
          <p className="text-sm text-slate-600">
            Akceptuj i zarządzaj dla aktualnego lokalu.
          </p>
        </div>

        {/* Pasek dnia – widoczny, ciemne strzałki, wygodny na mobile */}
        <div className="sticky top-0 z-10 flex items-center gap-2 rounded-xl border bg-white px-2 py-1 shadow-sm sm:static">
          <button
            aria-label="Poprzedni dzień"
            onClick={() => shiftDay(-1)}
            className="rounded-lg p-2 text-slate-700 hover:bg-slate-100"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-[180px] select-none px-1 text-sm font-semibold text-slate-800">
            {headerDate}
          </div>
          <button
            aria-label="Następny dzień"
            onClick={() => shiftDay(1)}
            className="rounded-lg p-2 text-slate-700 hover:bg-slate-100"
          >
            <ChevronRight size={18} />
          </button>
          <button
            aria-label="Odśwież"
            onClick={() => setSelectedDate(new Date(selectedDate))}
            className="ml-1 hidden rounded-lg p-2 text-slate-700 hover:bg-slate-100 sm:block"
            title="Odśwież listę"
          >
            <RotateCw size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Kalendarz. Strzałki miesiąca mają ciemny kolor. */}
        <aside className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <button
              onClick={() => {
                const prev = new Date(viewYear, viewMonth - 1, 1);
                setViewYear(prev.getFullYear());
                setViewMonth(prev.getMonth());
              }}
              className="rounded-lg border px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-slate-800">
              {new Date(viewYear, viewMonth).toLocaleDateString("pl-PL", {
                month: "long",
                year: "numeric",
              })}
            </span>
            <button
              onClick={() => {
                const next = new Date(viewYear, viewMonth + 1, 1);
                setViewYear(next.getFullYear());
                setViewMonth(next.getMonth());
              }}
              className="rounded-lg border px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <table className="w-full table-fixed text-center">
            <thead>
              <tr className="text-xs text-slate-600">
                {["pon", "wt", "śr", "czw", "pt", "sob", "nd"].map((d) => (
                  <th key={d} className="py-1">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-sm">
              {weeks.map((w, wi) => (
                <tr key={wi}>
                  {w.map((day, di) => {
                    const isToday =
                      day === today.getDate() &&
                      viewMonth === today.getMonth() &&
                      viewYear === today.getFullYear();
                    const isSel =
                      day === selectedDate.getDate() &&
                      viewMonth === selectedDate.getMonth() &&
                      viewYear === selectedDate.getFullYear();
                    return (
                      <td
                        key={di}
                        onClick={() =>
                          day &&
                          setSelectedDate(
                            new Date(viewYear, viewMonth, day)
                          )
                        }
                        className={`h-10 cursor-pointer align-top ${
                          day ? "hover:bg-slate-50" : ""
                        } ${isSel ? "bg-sky-50 font-semibold" : ""}`}
                      >
                        <span
                          className={
                            day == null
                              ? "text-transparent"
                              : reservedDays.has(day)
                              ? "text-rose-600"
                              : isToday
                              ? "text-sky-600"
                              : "text-slate-800"
                          }
                        >
                          {day ?? ""}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </aside>

        {/* Lista rezerwacji dnia. Mobile: karty, duże przyciski. */}
        <section className="lg:col-span-2 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between sm:hidden">
            <button
              onClick={() => setSelectedDate(new Date(selectedDate))}
              className="rounded-lg border bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Odśwież
            </button>
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-slate-400">
              Ładowanie…
            </p>
          ) : Object.keys(byHour).length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Brak rezerwacji.
            </p>
          ) : (
            Object.entries(byHour).map(([hhmm, list]) => (
              <div key={hhmm} className="mb-6">
                <h3 className="mb-2 text-sm font-semibold text-slate-600">
                  {hhmm}
                </h3>

                {/* mobile -> karty; desktop -> rządki wyglądają tak samo */}
                <ul className="space-y-2">
                  {list.map((r) => {
                    const hasOrder =
                      (r.table_ref || "").toLowerCase() === "orders" &&
                      Boolean(r.table_id);
                    return (
                      <li
                        key={r.id}
                        className="flex flex-col items-start gap-3 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {r.name || "—"}
                          </div>
                          <div className="text-xs text-slate-600">
                            {r.guests || 1} os. • {r.phone || "—"}{" "}
                            {r.email ? `• ${r.email}` : ""}
                          </div>
                          {r.note && (
                            <div className="mt-1 text-xs text-slate-500">
                              Notatka: {r.note}
                            </div>
                          )}

                          {/* status + info o powiązanym zamówieniu */}
                          <div className="mt-1 text-[11px]">
                            <span
                              className={`rounded-full px-2 py-0.5 font-semibold ${
                                (r.status || "new") === "accepted"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : (r.status || "new") === "cancelled"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {(r.status || "new").toUpperCase()}
                            </span>
                            {r.confirmed_at && (
                              <span className="ml-2 text-slate-500">
                                potw.:{" "}
                                {new Date(
                                  r.confirmed_at
                                ).toLocaleString("pl-PL")}
                              </span>
                            )}
                            {hasOrder && (
                              <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">
                                powiązane zamówienie
                              </span>
                            )}
                          </div>

                          {hasOrder && (
                            <div className="mt-1 text-xs text-sky-700">
                              Zamówienie:{" "}
                              <span className="font-semibold">
                                {r.table_label ||
                                  `ID: ${String(r.table_id).slice(0, 8)}`}
                              </span>
                            </div>
                          )}

                          {r.admin_note && (
                            <div className="mt-1 text-[11px] text-slate-500">
                              {r.admin_note}
                            </div>
                          )}
                        </div>

                        <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                          <button
                            onClick={() => act(r.id, "accept")}
                            disabled={
                              busyId === r.id || r.status === "accepted"
                            }
                            className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
                            title="Potwierdź i wyślij e-mail"
                          >
                            Akceptuj
                          </button>
                          <button
                            onClick={() => act(r.id, "cancel")}
                            disabled={
                              busyId === r.id || r.status === "cancelled"
                            }
                            className="w-full rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 sm:w-auto"
                          >
                            Anuluj
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
