// src/app/api/reservations/create/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";
import { sendPushForRestaurant } from "@/lib/push";
import { fromZonedTime } from "date-fns-tz";

const TZ = "Europe/Warsaw";

type NotificationType = "order" | "reservation" | "error" | "system";

async function pushAdminNotification(
  restaurant_id: string,
  type: NotificationType,
  title: string,
  message?: string | null,
  opts?: { url?: string }
) {
  try {
    // 1) zapis do admin_notifications
    await supabaseAdmin.from("admin_notifications").insert({
      restaurant_id,
      type,
      title,
      message: message ?? null,
    });

    // 2) web-push (do tabletu)
    const url = opts?.url || "/admin";
    await sendPushForRestaurant(restaurant_id, {
      type,
      title,
      body: message || title,
      url,
    });
  } catch (e: any) {
    apiLogger.error("admin_notifications.insert/push error", { error: e?.message || e });
  }
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // service role (server only)
  { auth: { persistSession: false } }
);

/** Ustawienia slotów — spójne z ReservationModal */
const SLOT_DURATION_MIN = 90;
const START_HOUR = 12;
const START_MIN = 30;
const END_HOUR = 20; // do 20:00
const MAX_PER_SLOT = 5;

/** Minimalny czas wyprzedzenia rezerwacji (w minutach) */
const MIN_LEAD_MIN = 60;

// Opcjonalna granica przyjmowania zgłoszeń (np. 12:30–21:45)
const LAST_ACCEPT_H = 21;
const LAST_ACCEPT_M = 45;

function isWithinAcceptWindow(now = new Date()) {
  const h = now.getHours();
  const m = now.getMinutes();
  const before = h < START_HOUR || (h === START_HOUR && m < START_MIN);
  const after = h > LAST_ACCEPT_H || (h === LAST_ACCEPT_H && m > LAST_ACCEPT_M);
  return !(before || after);
}

function toHhmmss(t: string) {
  // przyjmujemy "HH:mm" lub "HH:mm:ss" → "HH:mm:ss"
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t.trim());
  if (!m) return null;
  const hh = m[1],
    mm = m[2],
    ss = m[3] ?? "00";
  return `${hh}:${mm}:${ss}`;
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** wszystkie dopuszczalne sloty w danym dniu (bez patrzenia na „teraz”) */
function generateSlots(dateStr: string) {
  const selected = new Date(`${dateStr}T00:00:00`);
  const slots: string[] = [];
  const d = new Date(selected);
  d.setHours(START_HOUR, START_MIN, 0, 0);

  while (
    d.getHours() < END_HOUR ||
    (d.getHours() === END_HOUR && d.getMinutes() === 0)
  ) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
    d.setTime(d.getTime() + SLOT_DURATION_MIN * 60_000);
  }

  return slots;
}

/** sprawdza czy data+godzina jest co najmniej minMinutes minut w przyszłości */
function isAtLeastMinAhead(
  dayStr: string,
  timeHHMMSS: string,
  minMinutes: number
) {
  const targetUtc = fromZonedTime(`${dayStr}T${timeHHMMSS}`, TZ); // PL wall-clock -> UTC instant
  const now = new Date();
  const diffMinutes = (targetUtc.getTime() - now.getTime()) / 60_000;
  return diffMinutes >= minMinutes;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Źródła restauracji: preferuj ID, ewentualnie slug.
    const restaurant_id: string | null = body.restaurant_id || null;
    const restaurant_slug: string | null = body.restaurant_slug || null;

    const day: string = (body.date || "").trim(); // "YYYY-MM-DD"
    const timeRaw: string = (body.time || "").trim(); // "HH:mm" | "HH:mm:ss"
    const guests: number = Math.max(1, Math.min(20, Number(body.guests || 1)));

    const name: string = String(body.name || "").trim();
    const phone: string = String(body.phone || "").trim();
    const email: string = String(body.email || "").trim();
    const note: string = String(body.note || "").trim();

    // opcjonalne – informacja z frontu, że po tym będzie zamówienie
    const with_order: boolean = Boolean(body.with_order);

    // Walidacje danych wejściowych
    if (!day || !timeRaw || !name || !phone || !email) {
      return NextResponse.json(
        { error: "Brak wymaganych danych." },
        { status: 400 }
      );
    }
    if (!isEmail(email)) {
      return NextResponse.json(
        { error: "Podaj prawidłowy adres e-mail." },
        { status: 400 }
      );
    }
    // waliduj format daty
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return NextResponse.json(
        { error: "Nieprawidłowa data." },
        { status: 400 }
      );
    }
    const timeHHMMSS = toHhmmss(timeRaw);
    if (!timeHHMMSS) {
      return NextResponse.json(
        { error: "Nieprawidłowa godzina." },
        { status: 400 }
      );
    }

    // Ustal restaurant_id + slug (żeby zbudować URL do panelu)
let rid = restaurant_id;
let rslug = restaurant_slug; // <-- TU przechowujesz slug w zmiennej

if (!rid && restaurant_slug) {
  const { data: r, error: rErr } = await supabaseAdmin
    .from("restaurants")
    .select("id, slug")
    .eq("slug", restaurant_slug)
    .maybeSingle();

  if (rErr) {
    return NextResponse.json(
      { error: "Błąd sprawdzania restauracji." },
      { status: 500 }
    );
  }

  rid = r?.id ?? null;
  rslug = r?.slug ?? rslug; // <-- TU zapisujesz slug z DB
}

if (rid && !rslug) {
  // przypadek: przyszło restaurant_id, ale slug nie przyszedł
  const { data: r2, error: r2Err } = await supabaseAdmin
    .from("restaurants")
    .select("slug")
    .eq("id", rid)
    .maybeSingle();

  if (!r2Err) rslug = r2?.slug ?? null;
}

if (!rid) {
  return NextResponse.json(
    { error: "Nie wykryto restauracji." },
    { status: 400 }
  );
}

const restaurantId = String(rid);

    /* ===== BLOKADY CZASOWE z restaurant_blocked_times (rezerwacje) ===== */
    try {
      // zamieniamy godzinę rezerwacji na minuty od północy
      const [rh, rm = "0"] = timeHHMMSS.slice(0, 5).split(":");
      const requestedMinutes = Number(rh) * 60 + Number(rm);

      if (Number.isFinite(requestedMinutes)) {
        const { data: blockedSlots, error: blockedErr } = await supabaseAdmin
          .from("restaurant_blocked_times")
          .select("full_day, from_time, to_time, kind")
          .eq("restaurant_id", rid)
          .eq("block_date", day);

        if (blockedErr) {
          apiLogger.error("reservations.create restaurant_blocked_times error", {
            error: (blockedErr as any)?.message || blockedErr,
          });
        } else if (blockedSlots && blockedSlots.length > 0) {
          const isBlocked = (blockedSlots as any[]).some((slot) => {
            const type = (slot.kind as string) || "both";

            // Interesują nas blokady dla rezerwacji lub wspólne
            if (type !== "reservation" && type !== "both") return false;

            // blokada całego dnia
            if (slot.full_day) return true;

            // blokada zakresu godzin
            if (!slot.from_time || !slot.to_time) return false;

            const [fh, fm = "0"] = String(slot.from_time).split(":");
            const [th, tm = "0"] = String(slot.to_time).split(":");
            const fromM = Number(fh) * 60 + Number(fm);
            const toM = Number(th) * 60 + Number(tm);

            if (!Number.isFinite(fromM) || !Number.isFinite(toM)) return false;

            return requestedMinutes >= fromM && requestedMinutes <= toM;
          });

          if (isBlocked) {
            return NextResponse.json(
              { error: "Wybrany czas jest niedostępny." },
              { status: 400 }
            );
          }
        }
      }
    } catch (e) {
      apiLogger.error("reservations.create restaurant_blocked_times check error", {
        error: e,
      });
    }

    // Lista dozwolonych slotów dla dnia
    const allowed = generateSlots(day);
    const timeHHMM = timeHHMMSS.slice(0, 5);
    if (!allowed.includes(timeHHMM)) {
      return NextResponse.json(
        { error: "Wybrany termin jest niedostępny." },
        { status: 409 }
      );
    }

    // Minimalne wyprzedzenie – 60 minut
    if (!isAtLeastMinAhead(day, timeHHMMSS, MIN_LEAD_MIN)) {
      return NextResponse.json(
        {
          error:
            "Rezerwację można złożyć najpóźniej 60 minut przed wybraną godziną.",
        },
        { status: 400 }
      );
    }

    // Limit miejsc w slocie — per restauracja
    const { count, error: cntErr } = await supabaseAdmin
      .from("reservations")
      .select("*", { head: true, count: "exact" })
      .eq("restaurant_id", rid)
      .eq("reservation_date", day)
      .eq("reservation_time", timeHHMMSS);

    if (cntErr) {
      return NextResponse.json(
        { error: "Błąd sprawdzania dostępności." },
        { status: 500 }
      );
    }
    if ((count ?? 0) >= MAX_PER_SLOT) {
      return NextResponse.json(
        { error: "Wybrana godzina jest już pełna." },
        { status: 409 }
      );
    }

    // Zapis rezerwacji
    const insertPayload = {
      restaurant_id: rid,
      reservation_date: day,
      reservation_time: timeHHMMSS,
      restaurant_slug: rslug,
      guests,
      name,
      phone,
      email,
      note,
      status: "new" as const,
      confirmed_at: null as null | string,
      // opcjonalnie: można dodać pole typu "has_preorder" jeżeli masz taką kolumnę
      // has_preorder: with_order ? true : false,
    };

    const { data: ins, error: insErr } = await supabaseAdmin
      .from("reservations")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insErr) {
      return NextResponse.json(
        { error: "Nie udało się zapisać rezerwacji." },
        { status: 500 }
      );
    }

    const adminUrl = rslug
  ? `/admin/reservations?restaurant=${encodeURIComponent(rslug)}`
  : "/admin/reservations";

// Uwaga: na zablokowanym ekranie nie pokazuj PII (tel/email) – minimalny komunikat.
await pushAdminNotification(
  rid,
  "reservation",
  `Nowa rezerwacja #${ins.id}`,
  `${day} ${timeHHMM} • ${guests} os.`,
  { url: adminUrl }
);

    return NextResponse.json({ ok: true, id: ins?.id }, { status: 201 });
  } catch {
    // bez PII
    return NextResponse.json({ error: "Błąd serwera." }, { status: 500 });
  }
}
