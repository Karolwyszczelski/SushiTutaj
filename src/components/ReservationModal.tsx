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
      className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center"
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
        className="relative z-[61] w-full h-full lg:h-auto lg:max-w-md lg:max-h-[90vh] bg-[#111111] lg:bg-white text-white lg:text-black
                   lg:rounded-3xl overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Hero Header with gradient */}
        <div className="shrink-0 relative overflow-hidden"
             style={{ paddingTop: "max(env(safe-area-inset-top), 0px)" }}>
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#a61b1b]/30 via-[#a61b1b]/10 to-transparent" />
          
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 left-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
            style={{ marginTop: "env(safe-area-inset-top, 0px)" }}
            aria-label="Zamknij"
          >
            <X size={20} />
          </button>
          
          {/* Header content */}
          <div className="relative px-6 pt-16 pb-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-[#c41e1e] to-[#8a1414] shadow-lg mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-1">Zarezerwuj stolik</h2>
            <p className="text-sm text-white/60">Wybierz termin i uzupełnij dane</p>
          </div>
        </div>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <form onSubmit={handleSubmit} className="px-4 pb-[200px] lg:pb-6 space-y-4">
            
            {/* Quick info bar */}
            {(selectedDate || selectedTime || guestCount > 1) && (
              <div className="flex items-center justify-center gap-4 py-3 px-4 rounded-2xl bg-white/5 border border-white/10">
                {selectedDate && (
                  <div className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-[#a61b1b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="font-medium">{format(selectedDate, "d MMM", { locale: pl })}</span>
                  </div>
                )}
                {selectedTime && (
                  <div className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-[#a61b1b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">{selectedTime}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-[#a61b1b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="font-medium">{guestCount}</span>
                </div>
              </div>
            )}

            {/* Guests - always visible */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Liczba gości</h3>
                  <p className="text-xs text-white/50 mt-0.5">max. 10 osób</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                    className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-xl font-medium hover:bg-white/20 transition-colors active:scale-95"
                  >
                    −
                  </button>
                  <span className="text-2xl font-bold w-8 text-center">{guestCount}</span>
                  <button
                    type="button"
                    onClick={() => setGuestCount(Math.min(10, guestCount + 1))}
                    className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-xl font-medium hover:bg-white/20 transition-colors active:scale-95"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            
            {/* Calendar */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#a61b1b] flex items-center justify-center text-xs font-bold">1</span>
                Wybierz datę
              </h3>
              <style>{`
                .rdp-mobile {
                  --rdp-cell-size: 44px !important;
                  --rdp-accent-color: #a61b1b !important;
                  width: 100% !important;
                  margin: 0 auto !important;
                  font-family: inherit !important;
                }
                .rdp-mobile .rdp-months {
                  width: 100% !important;
                  justify-content: center !important;
                }
                .rdp-mobile .rdp-month {
                  width: 100% !important;
                }
                .rdp-mobile .rdp-table {
                  width: 100% !important;
                  border-collapse: separate !important;
                  border-spacing: 2px !important;
                }
                .rdp-mobile .rdp-caption {
                  display: flex !important;
                  justify-content: space-between !important;
                  align-items: center !important;
                  padding: 0 0 12px 0 !important;
                }
                .rdp-mobile .rdp-caption_label {
                  font-size: 16px !important;
                  font-weight: 700 !important;
                  text-transform: capitalize !important;
                }
                .rdp-mobile .rdp-nav {
                  display: flex !important;
                  gap: 8px !important;
                }
                .rdp-mobile .rdp-nav_button {
                  width: 36px !important;
                  height: 36px !important;
                  border-radius: 10px !important;
                  background: rgba(255,255,255,0.1) !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                }
                .rdp-mobile .rdp-nav_button:hover {
                  background: rgba(255,255,255,0.15) !important;
                }
                .rdp-mobile .rdp-head_cell {
                  font-size: 11px !important;
                  font-weight: 600 !important;
                  color: rgba(255,255,255,0.4) !important;
                  text-transform: uppercase !important;
                  padding: 8px 0 !important;
                }
                .rdp-mobile .rdp-cell {
                  padding: 1px !important;
                }
                .rdp-mobile .rdp-day {
                  font-size: 15px !important;
                  font-weight: 500 !important;
                  border-radius: 12px !important;
                  transition: all 0.15s !important;
                }
                .rdp-mobile .rdp-day_selected {
                  background: linear-gradient(135deg, #c41e1e 0%, #8a1414 100%) !important;
                  color: white !important;
                  font-weight: 700 !important;
                  box-shadow: 0 4px 12px rgba(166,27,27,0.4) !important;
                }
                .rdp-mobile .rdp-day_today:not(.rdp-day_selected) {
                  background: rgba(166,27,27,0.2) !important;
                  color: #ff6b6b !important;
                  font-weight: 700 !important;
                }
                .rdp-mobile .rdp-day:hover:not(.rdp-day_selected):not(.rdp-day_disabled) {
                  background: rgba(255,255,255,0.1) !important;
                }
                .rdp-mobile .rdp-day_disabled {
                  color: rgba(255,255,255,0.2) !important;
                }
              `}</style>
              <DayPicker
                mode="single"
                className="rdp rdp-mobile"
                captionLayout="buttons"
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
                <p className="mt-3 text-sm text-red-400 text-center">Nie wykryto lokalu.</p>
              )}
            </div>

            {/* Time slots */}
            {selectedDate && (
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#a61b1b] flex items-center justify-center text-xs font-bold">2</span>
                  Wybierz godzinę
                </h3>
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
                        className={`relative h-12 rounded-xl text-sm font-semibold transition-all ${
                          active
                            ? "bg-gradient-to-r from-[#c41e1e] to-[#8a1414] text-white shadow-lg shadow-red-500/20"
                            : "bg-white/5 text-white border border-white/10 hover:bg-white/10 hover:border-white/20"
                        } ${disabled ? "opacity-30 cursor-not-allowed" : "active:scale-95"}`}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Contact form */}
            {selectedDate && selectedTime && (
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#a61b1b] flex items-center justify-center text-xs font-bold">3</span>
                  Twoje dane
                </h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Imię i nazwisko"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 outline-none focus:border-[#a61b1b]/50 focus:bg-white/[0.08] text-white placeholder:text-white/40 text-base transition-all"
                  />
                  <input
                    type="tel"
                    placeholder="Numer telefonu"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 outline-none focus:border-[#a61b1b]/50 focus:bg-white/[0.08] text-white placeholder:text-white/40 text-base transition-all"
                  />
                  <input
                    type="email"
                    placeholder="Adres e-mail"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className={`w-full rounded-xl border bg-white/5 px-4 py-3.5 outline-none text-white placeholder:text-white/40 text-base transition-all ${
                      customerEmail && !emailValid
                        ? "border-red-500 focus:border-red-500"
                        : "border-white/10 focus:border-[#a61b1b]/50 focus:bg-white/[0.08]"
                    }`}
                  />
                  {!emailValid && customerEmail.length > 0 && (
                    <p className="text-xs text-red-400">Nieprawidłowy adres e-mail</p>
                  )}
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Uwagi do rezerwacji (opcjonalnie)"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-[#a61b1b]/50 focus:bg-white/[0.08] text-white placeholder:text-white/40 text-base resize-none transition-all"
                  />
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {errorMsg}
              </div>
            )}
          </form>
        </div>

        {/* Sticky CTA */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-[#111111] via-[#111111] to-transparent pt-12"
             style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 80px)" }}>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={!isValid || loading}
            className="w-full rounded-2xl py-4 text-base font-bold text-white disabled:opacity-40 transition-all active:scale-[0.98]
                       bg-gradient-to-r from-[#c41e1e] to-[#8a1414] shadow-[0_8px_32px_rgba(166,27,27,0.4)]"
          >
            {loading ? "Rezerwuję..." : isValid ? "Zarezerwuj stolik" : "Uzupełnij dane"}
          </button>
          {isValid && (
            <button
              type="button"
              onClick={handleSubmitAndGoToOrder}
              disabled={loading}
              className="w-full mt-2 py-3 text-sm text-white/60 font-medium"
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
