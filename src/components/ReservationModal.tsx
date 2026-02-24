// src/components/ReservationModal.tsx
"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { format, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import { pl } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

const TZ = "Europe/Warsaw";
const nowPL = () => toZonedTime(new Date(), TZ);

type Props = { isOpen: boolean; onClose: () => void; id?: string };

/** Typ blokady z restaurant_blocked_times */
type BlockedSlot = {
  block_date: string; // YYYY-MM-DD
  full_day: boolean;
  from_time: string | null; // HH:mm:ss
  to_time: string | null;
  kind: "reservation" | "order" | "both";
};

/** Sloty 11:30–22:00 co 90 min, max 5 rezerwacji na slot */
const SLOT_DURATION_MIN = 90;
const START_HOUR = 12;
const START_MIN = 30;
const END_HOUR = 20;
const SLOT_COUNT =
  Math.floor(((END_HOUR * 60) - (START_HOUR * 60 + START_MIN)) / SLOT_DURATION_MIN) + 1;
const MAX_PER_SLOT = 5;

/** Minimalny czas wyprzedzenia rezerwacji (w minutach) – żeby nie było „za 15 minut" */
const MIN_LEAD_MIN = 60;

/** Sprawdza czy dany slot (HH:mm) jest zablokowany dla danego dnia */
function isSlotBlocked(
  dayKey: string,
  slotHHMM: string,
  blocks: BlockedSlot[]
): boolean {
  const [sh, sm] = slotHHMM.split(":").map(Number);
  const slotMinutes = sh * 60 + sm;

  return blocks.some((b) => {
    if (b.block_date !== dayKey) return false;
    // tylko blokady dla rezerwacji lub obu
    if (b.kind !== "reservation" && b.kind !== "both") return false;

    if (b.full_day) return true;

    if (!b.from_time || !b.to_time) return false;
    const [fh, fm] = b.from_time.split(":").map(Number);
    const [th, tm] = b.to_time.split(":").map(Number);
    const fromM = fh * 60 + fm;
    const toM = th * 60 + tm;

    return slotMinutes >= fromM && slotMinutes <= toM;
  });
}

/** Sprawdza czy cały dzień jest zablokowany */
function isDayFullyBlocked(dayKey: string, blocks: BlockedSlot[]): boolean {
  return blocks.some((b) => {
    if (b.block_date !== dayKey) return false;
    if (b.kind !== "reservation" && b.kind !== "both") return false;
    return b.full_day === true;
  });
}

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

  /** Blokady z restaurant_blocked_times */
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);

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

        const { data, error } = await getSupabaseBrowser()
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
        const { data, error } = await getSupabaseBrowser()
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

  /* ===== pobierz blokady z publicznego API ===== */
  useEffect(() => {
    if (!restaurantSlug) {
      setBlockedSlots([]);
      return;
    }
    let stop = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/public/blocked-times?restaurant=${encodeURIComponent(restaurantSlug)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("Błąd pobierania blokad");
        const json = await res.json();
        if (stop) return;
        setBlockedSlots(json?.slots ?? []);
      } catch (e: any) {
        console.error("Błąd pobierania blokad:", e?.message || e);
        if (!stop) setBlockedSlots([]);
      }
    })();
    return () => {
      stop = true;
    };
  }, [restaurantSlug]);

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
        const { data, error } = await getSupabaseBrowser()
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

  /** Koloryzacja dni (pełny dzień = wszystkie sloty zajęte LUB zablokowany) */
  const modifiers = {
    past: (day: Date) =>
      format(day, "yyyy-MM-dd") <
      format(nowPL(), "yyyy-MM-dd"),
    full: (day: Date) => {
      const key = format(day, "yyyy-MM-dd");
      return (countsPerDay[key] || 0) >= MAX_PER_SLOT * SLOT_COUNT;
    },
    blocked: (day: Date) => {
      const key = format(day, "yyyy-MM-dd");
      return isDayFullyBlocked(key, blockedSlots);
    },
  } as const;

  const modifiersClassNames = {
    past: "opacity-40",
    full: "bg-red-200 text-red-700",
    blocked: "bg-gray-300 text-gray-500 line-through cursor-not-allowed",
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

  const modalContent = (
    <div
      className="fixed inset-0 z-[90] flex items-end lg:items-center justify-center"
      role="dialog"
      aria-modal="true"
      id={id || "reservation-modal"}
    >
      {/* Backdrop */}
      <button
        aria-hidden
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onMouseDown={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-[91] w-full h-full lg:h-auto lg:max-w-md lg:max-h-[90vh] bg-[#0e0e0e] lg:bg-white text-white lg:text-black
                   lg:rounded-3xl overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0" style={{ paddingTop: "max(env(safe-area-inset-top), 0px)" }}>
          <div className="flex justify-center pt-3 pb-1 lg:hidden">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.08] active:bg-white/15 transition-colors"
              aria-label="Zamknij"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
            <h2 className="text-[17px] font-bold tracking-tight">Rezerwacja</h2>
            <div className="w-9" />
          </div>
        </div>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <form onSubmit={handleSubmit} className="px-5 pb-[180px] lg:pb-6 space-y-5">
            
            {/* Summary strip */}
            {(selectedDate || selectedTime || guestCount > 1) && (
              <div className="flex items-center gap-3 py-2.5 px-4 rounded-xl bg-[#c41e1e]/[0.06] border border-[#c41e1e]/[0.12]">
                {selectedDate && (
                  <span className="text-sm font-semibold text-[#e85d5d]">
                    {format(selectedDate, "d MMM", { locale: pl })}
                  </span>
                )}
                {selectedDate && selectedTime && <span className="text-white/20">·</span>}
                {selectedTime && (
                  <span className="text-sm font-semibold text-[#e85d5d]">{selectedTime}</span>
                )}
                {(selectedDate || selectedTime) && <span className="text-white/20">·</span>}
                <span className="text-sm text-white/50">{guestCount} {guestCount === 1 ? "osoba" : guestCount < 5 ? "osoby" : "osób"}</span>
              </div>
            )}

            {/* Guests */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35 mb-3">Goście</label>
              <div className="flex items-center justify-between">
                <p className="text-sm text-white/50">Liczba osób <span className="text-white/25">(max 10)</span></p>
                <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-full p-1 border border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-medium hover:bg-white/10 transition-colors active:scale-90"
                  >
                    −
                  </button>
                  <span className="text-lg font-bold w-8 text-center tabular-nums">{guestCount}</span>
                  <button
                    type="button"
                    onClick={() => setGuestCount(Math.min(10, guestCount + 1))}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-medium hover:bg-white/10 transition-colors active:scale-90"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <div className="h-px bg-white/[0.06]" />
            
            {/* Calendar */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35 mb-3">Data</label>
              <style>{`
                .rdp-res {
                  --rdp-cell-size: 42px !important;
                  --rdp-accent-color: #c41e1e !important;
                  width: 100% !important;
                  margin: 0 auto !important;
                  font-family: inherit !important;
                }
                .rdp-res .rdp-months {
                  width: 100% !important;
                  justify-content: center !important;
                }
                .rdp-res .rdp-month {
                  width: 100% !important;
                }
                .rdp-res .rdp-table {
                  width: 100% !important;
                  border-collapse: separate !important;
                  border-spacing: 2px 3px !important;
                }
                .rdp-res .rdp-caption {
                  display: flex !important;
                  justify-content: space-between !important;
                  align-items: center !important;
                  padding: 0 0 8px 0 !important;
                }
                .rdp-res .rdp-caption_label {
                  font-size: 15px !important;
                  font-weight: 700 !important;
                  text-transform: capitalize !important;
                  letter-spacing: 0.01em !important;
                }
                .rdp-res .rdp-nav {
                  display: flex !important;
                  gap: 4px !important;
                }
                .rdp-res .rdp-nav_button {
                  width: 32px !important;
                  height: 32px !important;
                  border-radius: 8px !important;
                  background: rgba(255,255,255,0.06) !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                  transition: background 0.15s !important;
                }
                .rdp-res .rdp-nav_button:hover {
                  background: rgba(255,255,255,0.12) !important;
                }
                .rdp-res .rdp-nav_button svg {
                  width: 14px !important;
                  height: 14px !important;
                }
                .rdp-res .rdp-head_cell {
                  font-size: 10px !important;
                  font-weight: 700 !important;
                  color: rgba(255,255,255,0.3) !important;
                  text-transform: uppercase !important;
                  letter-spacing: 0.08em !important;
                  padding: 6px 0 !important;
                }
                .rdp-res .rdp-cell {
                  padding: 0 !important;
                }
                .rdp-res .rdp-day {
                  font-size: 14px !important;
                  font-weight: 500 !important;
                  border-radius: 10px !important;
                  transition: all 0.15s ease !important;
                  color: rgba(255,255,255,0.85) !important;
                }
                .rdp-res .rdp-day_selected {
                  background: #c41e1e !important;
                  color: white !important;
                  font-weight: 700 !important;
                  box-shadow: 0 2px 12px rgba(196,30,30,0.35) !important;
                }
                .rdp-res .rdp-day_today:not(.rdp-day_selected) {
                  color: #c41e1e !important;
                  font-weight: 700 !important;
                }
                .rdp-res .rdp-day:hover:not(.rdp-day_selected):not(.rdp-day_disabled) {
                  background: rgba(255,255,255,0.08) !important;
                }
                .rdp-res .rdp-day_disabled {
                  color: rgba(255,255,255,0.15) !important;
                }
              `}</style>
              <DayPicker
                mode="single"
                className="rdp rdp-res"
                captionLayout="dropdown"
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                selected={selectedDate}
                onSelect={(day) => {
                  if (day && isDayFullyBlocked(format(day, "yyyy-MM-dd"), blockedSlots)) return;
                  setSelectedDate(day);
                }}
                locale={pl}
                fromDate={nowPL()}
                disabled={(day) => isDayFullyBlocked(format(day, "yyyy-MM-dd"), blockedSlots)}
                modifiers={modifiers as any}
                modifiersClassNames={modifiersClassNames as any}
              />
              {!restaurantId && (
                <p className="mt-3 text-xs text-red-400 text-center">Nie wykryto lokalu — wybierz miasto.</p>
              )}
            </div>

            {/* Time slots */}
            {selectedDate && (
              <>
                <div className="h-px bg-white/[0.06]" />
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35 mb-3">Godzina</label>
                  <div className="grid grid-cols-3 gap-2">
                    {generateSlots().map((slot) => {
                      const dayKey = format(selectedDate, "yyyy-MM-dd");
                      const full = (countsPerSlot[slot] || 0) >= MAX_PER_SLOT;
                      const blocked = isSlotBlocked(dayKey, slot, blockedSlots);
                      const disabled = full || blocked;
                      const active = selectedTime === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={disabled}
                          onClick={() => setSelectedTime(slot)}
                          className={`h-11 rounded-xl text-sm font-semibold transition-all duration-150 ${
                            active
                              ? "bg-[#c41e1e] text-white shadow-[0_2px_12px_rgba(196,30,30,0.3)]"
                              : "bg-white/[0.04] text-white/70 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white"
                          } ${disabled ? "opacity-20 cursor-not-allowed !border-transparent" : "active:scale-95"}`}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                  {generateSlots().length === 0 && (
                    <p className="text-sm text-white/40 text-center py-4">Brak dostępnych godzin</p>
                  )}
                </div>
              </>
            )}

            {/* Contact form */}
            {selectedDate && selectedTime && (
              <>
                <div className="h-px bg-white/[0.06]" />
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35 mb-3">Dane kontaktowe</label>
                  <div className="space-y-2.5">
                    <div className="relative">
                      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      <input
                        type="text"
                        placeholder="Imię i nazwisko"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-10 pr-4 py-3 outline-none focus:border-[#c41e1e]/40 focus:bg-white/[0.06] text-white placeholder:text-white/30 text-[15px] transition-all"
                      />
                    </div>
                    <div className="relative">
                      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                      <input
                        type="tel"
                        placeholder="Numer telefonu"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-10 pr-4 py-3 outline-none focus:border-[#c41e1e]/40 focus:bg-white/[0.06] text-white placeholder:text-white/30 text-[15px] transition-all"
                      />
                    </div>
                    <div className="relative">
                      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      <input
                        type="email"
                        placeholder="Adres e-mail"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        className={`w-full rounded-xl border bg-white/[0.03] pl-10 pr-4 py-3 outline-none text-white placeholder:text-white/30 text-[15px] transition-all ${
                          customerEmail && !emailValid
                            ? "border-red-500/60 focus:border-red-500"
                            : "border-white/[0.08] focus:border-[#c41e1e]/40 focus:bg-white/[0.06]"
                        }`}
                      />
                    </div>
                    {!emailValid && customerEmail.length > 0 && (
                      <p className="text-xs text-red-400 pl-1">Nieprawidłowy adres e-mail</p>
                    )}
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Uwagi (opcjonalnie)"
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 outline-none focus:border-[#c41e1e]/40 focus:bg-white/[0.06] text-white placeholder:text-white/30 text-[15px] resize-none transition-all"
                    />
                  </div>
                </div>
              </>
            )}

            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-red-500/[0.08] border border-red-500/[0.15] text-red-400 text-sm">
                {errorMsg}
              </div>
            )}
          </form>
        </div>

        {/* Sticky CTA */}
        <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-[#0e0e0e] from-60% to-transparent pt-10"
             style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={!isValid || loading}
            className="w-full rounded-xl py-3.5 text-[15px] font-bold text-white disabled:opacity-30 transition-all active:scale-[0.98]
                       bg-[#c41e1e] shadow-[0_4px_20px_rgba(196,30,30,0.3)]"
          >
            {loading ? "Rezerwuję..." : isValid ? "Zarezerwuj stolik" : "Uzupełnij dane"}
          </button>
          {isValid && (
            <button
              type="button"
              onClick={handleSubmitAndGoToOrder}
              disabled={loading}
              className="w-full mt-2.5 py-2.5 text-[13px] text-white/40 font-medium tracking-wide hover:text-white/60 transition-colors"
            >
              lub zarezerwuj i zamów jedzenie →
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Render modal at document.body level using Portal
  if (typeof document === "undefined") return null;
  return createPortal(modalContent, document.body);
}
