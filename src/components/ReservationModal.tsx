// src/components/ReservationModal.tsx
"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { format, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import { pl } from "date-fns/locale";
import { createClient } from "@supabase/supabase-js";
import { toZonedTime } from "date-fns-tz";

const TZ = "Europe/Warsaw";
const nowPL = () => toZonedTime(new Date(), TZ);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Props = { isOpen: boolean; onClose: () => void; id?: string };

/** Sloty 11:30–22:00 co 90 min, max 5 rezerwacji na slot */
const SLOT_DURATION_MIN = 90;
const START_HOUR = 12;
const START_MIN = 30;
const END_HOUR = 20;
const SLOT_COUNT =
  Math.floor(((END_HOUR * 60) - (START_HOUR * 60 + START_MIN)) / SLOT_DURATION_MIN) + 1;
const MAX_PER_SLOT = 5;

/** Minimalny czas wyprzedzenia rezerwacji (w minutach) – żeby nie było „za 15 minut” */
const MIN_LEAD_MIN = 60;

/* ===== helpers ===== */
const getSlugFromPath = () => {
  if (typeof window === "undefined") return null;
  const seg = window.location.pathname.split("/").filter(Boolean);
  const s0 = seg[0] || null;
  if (s0 === "admin" || s0 === "api") return null;
  return s0;
};

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

export default function ReservationModal({ isOpen, onClose, id }: Props) {
  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [countsPerDay, setCountsPerDay] = useState<Record<string, number>>({});
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [countsPerSlot, setCountsPerSlot] = useState<Record<string, number>>({});
  const [selectedTime, setSelectedTime] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState(""); // wymagany e-mail
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* ===== init: określ restaurację po slugu ===== */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const slug =
          getSlugFromPath() ||
          getCookie("restaurant_slug") ||
          null;
        setRestaurantSlug(slug);

        if (!slug) return;

        const { data, error } = await supabase
          .from("restaurants")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (error) throw error;
        if (active) setRestaurantId(data?.id ?? null);
      } catch {
        if (active) setRestaurantId(null);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /* ===== miesięczne obłożenie per restauracja ===== */
  useEffect(() => {
    if (!currentMonth || !restaurantId) return;
    let stop = false;
    (async () => {
      try {
        const from = format(startOfMonth(currentMonth), "yyyy-MM-dd");
        const to = format(endOfMonth(currentMonth), "yyyy-MM-dd");
        const { data, error } = await supabase
          .from("reservations")
          .select("reservation_date")
          .eq("restaurant_id", restaurantId)
          .gte("reservation_date", from)
          .lte("reservation_date", to);
        if (error) throw error;
        if (stop) return;
        const perDay: Record<string, number> = {};
        (data || []).forEach((r: any) => {
          const k = r.reservation_date as string;
          perDay[k] = (perDay[k] || 0) + 1;
        });
        setCountsPerDay(perDay);
      } catch (e: any) {
        console.error(e?.message || e);
      }
    })();
    return () => {
      stop = true;
    };
  }, [currentMonth, restaurantId]);

  /* ===== obłożenie slotów dnia per restauracja ===== */
  useEffect(() => {
    // reset przy zmianie dnia
    setSelectedTime("");
    setGuestCount(1);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setNotes("");
    setErrorMsg(null);

    if (!selectedDate || !restaurantId) {
      setCountsPerSlot({});
      return;
    }
    let stop = false;
    (async () => {
      try {
        const day = format(selectedDate, "yyyy-MM-dd");
        const { data, error } = await supabase
          .from("reservations")
          .select("reservation_time")
          .eq("restaurant_id", restaurantId)
          .eq("reservation_date", day);
        if (error) throw error;
        if (stop) return;
        const perSlot: Record<string, number> = {};
        (data || []).forEach((r: any) => {
          const hhmm = String(r.reservation_time).slice(0, 5);
          perSlot[hhmm] = (perSlot[hhmm] || 0) + 1;
        });
        setCountsPerSlot(perSlot);
      } catch (e: any) {
        console.error(e?.message || e);
      }
    })();
    return () => {
      stop = true;
    };
  }, [selectedDate, restaurantId]);

  /** Sloty czasowe (dla „dziś” wycina przeszłe godziny + te < MIN_LEAD_MIN) */
  const generateSlots = () => {
    if (!selectedDate) return [];
    const slots: string[] = [];

    // "teraz" w Polsce
    const now = nowPL();

    const dayKey = format(selectedDate, "yyyy-MM-dd");
    const isToday = dayKey === format(now, "yyyy-MM-dd");

    // startowy slot w strefie PL
    let d = toZonedTime(selectedDate, TZ);
    d.setHours(START_HOUR, START_MIN, 0, 0);

    for (let i = 0; i < SLOT_COUNT; i++) {
      const hhmm = format(d, "HH:mm");

      if (!isToday) {
        // dla innych dni wszystkie sloty są dostępne
        slots.push(hhmm);
      } else {
        // dla dzisiaj – filtrujemy po MIN_LEAD_MIN, ale w czasie PL
        const diffMinutes = (d.getTime() - now.getTime()) / 60000;
        if (diffMinutes >= MIN_LEAD_MIN) {
          slots.push(hhmm);
        }
      }

      d = new Date(d.getTime() + SLOT_DURATION_MIN * 60000);
    }

    return slots;
  };

  /** Koloryzacja dni (pełny dzień = wszystkie sloty zajęte) */
  const modifiers = {
    past: (day: Date) =>
      format(day, "yyyy-MM-dd") <
      format(nowPL(), "yyyy-MM-dd"),
    full: (day: Date) => {
      const key = format(day, "yyyy-MM-dd");
      return (countsPerDay[key] || 0) >= MAX_PER_SLOT * SLOT_COUNT;
    },
  } as const;

  const modifiersClassNames = {
    past: "opacity-40",
    full: "bg-red-200 text-red-700",
  } as const;

  // walidacje
  const emailValid =
    customerEmail.trim().length > 3 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim());
  const isValid =
    Boolean(
      selectedDate &&
        selectedTime &&
        customerName.trim() &&
        customerPhone.trim() &&
        emailValid &&
        restaurantId
    );

  /** Wspólna funkcja zapisu – może albo tylko zarezerwować, albo zarezerwować i przejść do zamówień */
  async function submitReservation(goToOrder: boolean) {
    setErrorMsg(null);
    if (!isValid || loading) return;
    setLoading(true);
    try {
      const day = format(selectedDate!, "yyyy-MM-dd");
      const hhmm = selectedTime;

      // zabezpieczenie pojemności slotu tuż przed zapisem (lokalny stan)
      const localUsed = countsPerSlot[hhmm] || 0;
      if (localUsed >= MAX_PER_SLOT) {
        throw new Error("Wybrany termin jest już pełny.");
      }

      const res = await fetch("/api/reservations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          restaurant_slug: restaurantSlug,
          date: day,
          time: hhmm,
          guests: guestCount,
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
          note: notes,
          status: "new",
          with_order: goToOrder, // informacja dla backendu, że po rezerwacji będzie zamówienie
        }),
      });

      const jr = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(jr?.error || "Błąd zapisu");
      }

       // jeżeli użytkownik wybrał „Zarezerwuj i przejdź do zamówienia”
      if (goToOrder) {
        const reservationId: string | undefined =
          jr?.id || jr?.reservation_id || jr?.reservationId;

        if (reservationId) {
          // jeśli znamy lokal → /{slug}?reservation=...#menu
          if (restaurantSlug) {
            const target = `/${restaurantSlug}?reservation=${encodeURIComponent(
              reservationId
            )}#menu`;
            window.location.href = target;
          } else {
            // fallback: globalne /menu z tą samą logiką
            const target = `/menu?reservation=${encodeURIComponent(
              reservationId
            )}#menu`;
            window.location.href = target;
          }
          return;
        }
      }

      // standardowa ścieżka – tylko rezerwacja, zamknięcie modala
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Nie udało się zapisać rezerwacji.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    await submitReservation(false);
  }

  async function handleSubmitAndGoToOrder(e: React.MouseEvent) {
    e.preventDefault();
    await submitReservation(true);
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      id={id || "reservation-modal"}
    >
      {/* Backdrop – klik zamyka */}
      <button
        aria-hidden
        className="absolute inset-0 bg-black/60"
        onMouseDown={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-[71] w-full max-w-3xl bg-white text-black shadow-2xl
                   grid grid-rows-[auto,1fr] max-h-[70vh]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
          <h2 className="text-xl font-semibold">Rezerwacja stolika</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-black/5"
            aria-label="Zamknij"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scroll area */}
        <div className="overflow-y-auto overscroll-contain">
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 lg:grid-cols-2 gap-0"
          >
            {/* Kalendarz */}
            <div className="p-6 border-b lg:border-b-0 lg:border-r border-black/10">
              <DayPicker
                mode="single"
                className="rdp text-black"
                captionLayout="dropdown"
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                selected={selectedDate}
                onSelect={setSelectedDate}
                locale={pl}
                fromDate={nowPL()}
                modifiers={modifiers as any}
                modifiersClassNames={modifiersClassNames as any}
                styles={{
                  day: { borderRadius: 12 },
                  head_cell: { fontWeight: 600 },
                  day_selected: { background: "black", color: "white" },
                }}
              />
              <p className="mt-3 text-xs text-black/60">
                Wybierz dzień, a następnie godzinę i uzupełnij dane.
              </p>
              {!restaurantId && (
                <p className="mt-2 text-xs text-red-600">
                  Nie wykryto lokalu. Odśwież stronę z adresem miasta lub wybierz lokal.
                </p>
              )}
            </div>

            {/* Sloty + formularz */}
            <div className="p-6 space-y-5">
              {/* Godziny */}
              <div>
                <div className="font-medium mb-2">Godzina</div>
                {!selectedDate ? (
                  <p className="text-sm text-black/60">
                    Najpierw wybierz dzień.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {generateSlots().map((slot) => {
                      const full = (countsPerSlot[slot] || 0) >= MAX_PER_SLOT;
                      const active = selectedTime === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={full}
                          onClick={() => setSelectedTime(slot)}
                          className={[
                            "h-11 rounded-full text-sm font-semibold transition",
                            "border border-black/10",
                            active
                              ? "text-white [background:linear-gradient(180deg,#b31217_0%,#7a0b0b_100%)] shadow-[0_10px_22px_rgba(0,0,0,.20),inset_0_1px_0_rgba(255,255,255,.15)]"
                              : "bg-white text-black hover:bg-black/5",
                            full && "opacity-50 cursor-not-allowed",
                          ].join(" ")}
                          title={full ? "Ten termin jest już pełny" : slot}
                        >
                          {slot}
                          <span className="sr-only">
                            {full ? " (pełny)" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedDate && (
                  <p className="mt-2 text-[11px] text-black/60">
                    Rezerwacje możliwe najwcześniej{" "}
                    {MIN_LEAD_MIN} minut przed wybraną godziną.
                  </p>
                )}
              </div>

              {/* Liczba gości */}
              {selectedDate && (
                <div>
                  <div className="font-medium mb-2">Liczba gości</div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={guestCount}
                      onChange={(e) => setGuestCount(Number(e.target.value))}
                      className="w-24 rounded-md border border-black/15 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/20"
                    />
                    <span className="text-sm text-black/60">
                      max 10 osób
                    </span>
                  </div>
                </div>
              )}

              {/* Dane klienta + e-mail wymagany */}
              {selectedTime && (
                <>
                  <div>
                    <div className="font-medium mb-2">Twoje dane</div>
                    <input
                      type="text"
                      placeholder="Imię i nazwisko"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="mb-2 w-full rounded-md border border-black/15 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/20"
                    />
                    <input
                      type="tel"
                      placeholder="Telefon"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="mb-2 w-full rounded-md border border-black/15 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/20"
                    />
                    <input
                      type="email"
                      placeholder="E-mail do potwierdzenia"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className={`w-full rounded-md border bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/20 ${
                        customerEmail && !emailValid
                          ? "border-red-400"
                          : "border-black/15"
                      }`}
                    />
                    {!emailValid && customerEmail.length > 0 && (
                      <p className="mt-1 text-xs text-red-600">
                        Podaj prawidłowy adres e-mail.
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="font-medium mb-2">Uwagi (opcjonalnie)</div>
                    <textarea
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Np. krzesełko dla dziecka, konkretne miejsce…"
                      className="w-full rounded-md border border-black/15 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/20"
                    />
                  </div>
                </>
              )}

              {errorMsg && (
                <div className="text-sm text-red-600">{errorMsg}</div>
              )}

              {/* PODSUMOWANIE + CTA */}
              <div className="sticky bottom-0 pt-3 bg-white space-y-3">
                {selectedDate && selectedTime && (
                  <div className="rounded-lg border border-black/10 bg-gray-50 px-3 py-2 text-xs text-black/80">
                    <div>
                      <span className="font-semibold">Termin: </span>
                      {format(selectedDate, "dd.MM.yyyy")} o {selectedTime}
                    </div>
                    <div>
                      <span className="font-semibold">Liczba gości: </span>
                      {guestCount}
                    </div>
                    {restaurantSlug && (
                      <div>
                        <span className="font-semibold">Lokal: </span>
                        {restaurantSlug}
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-black/60">
                      Możesz zarezerwować stolik, a następnie od razu przejść do
                      złożenia zamówienia powiązanego z tą rezerwacją.
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <button
                    type="submit"
                    disabled={!isValid || loading}
                    className="w-full rounded-xl py-3 font-semibold text-white disabled:opacity-50
                               [background:linear-gradient(180deg,#b31217_0%,#7a0b0b_100%)]
                               shadow-[0_10px_22px_rgba(0,0,0,.20),inset_0_1px_0_rgba(255,255,255,.15)]"
                  >
                    {loading ? "Wysyłanie..." : "Zarezerwuj stolik"}
                  </button>

                  <button
                    type="button"
                    disabled={!isValid || loading}
                    onClick={handleSubmitAndGoToOrder}
                    className="w-full rounded-xl py-3 font-semibold border border-black/15 bg-white text-black disabled:opacity-50"
                  >
                    {loading
                      ? "Wysyłanie..."
                      : "Zarezerwuj i przejdź do zamówienia"}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
