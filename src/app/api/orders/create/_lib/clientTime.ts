// src/api/orders/create/_lib/clientTime.ts
import { NextResponse } from "next/server";
import { fromZonedTime } from "date-fns-tz";
import { nowPL, tz, pad2 as pad } from "./schedule";

type ParsedClientTime = {
  clientDeliveryForDb: string; // "asap" albo "HH:MM"
  scheduledDeliveryAt: string | null; // ISO UTC lub null
  requestedDateStr: string; // YYYY-MM-DD w PL
  requestedMinutes: number; // minuty w PL
};

const hasTzInfo = (s: string) => /Z$|[+\-]\d{2}:\d{2}$/.test(s);

export function parseClientDeliveryTime(args: {
  clientDeliveryRaw: any;
  now: Date; // komponenty w PL (z nowPL(nowInstant()))
}): ParsedClientTime {
  const { clientDeliveryRaw, now } = args;

  let clientDeliveryForDb: string | null = null;
  let scheduledDeliveryAt: string | null = null;

  let requestedDateStr: string | null = null; // YYYY-MM-DD w PL
  let requestedMinutes: number | null = null; // minuty w PL

  if (typeof clientDeliveryRaw === "string" && clientDeliveryRaw.trim()) {
    const raw = clientDeliveryRaw.trim();
    const low = raw.toLowerCase();

    if (low === "asap") {
      clientDeliveryForDb = "asap";
    } else if (/^\d{1,2}:\d{2}$/.test(raw)) {
      // "HH:MM" traktujemy jako czas Europe/Warsaw dla DZISIAJ
      const [hhRaw, mmRaw] = raw.split(":");
      const hhNum = Math.max(0, Math.min(23, Number(hhRaw)));
      const mmNum = Math.max(0, Math.min(59, Number(mmRaw)));

      const datePL = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
        now.getDate()
      )}`;
      const hh = pad(hhNum);
      const mm = pad(mmNum);

      const localPL = `${datePL}T${hh}:${mm}:00`;
      const utc = fromZonedTime(localPL, tz);

      scheduledDeliveryAt = utc.toISOString();

      // Wszystkie wyliczenia (blokady/panel) robimy w PL:
      requestedDateStr = datePL;
      requestedMinutes = hhNum * 60 + mmNum;
      clientDeliveryForDb = `${hh}:${mm}`;
    } else {
      // ISO / datetime
      // Jeśli brak informacji o strefie w stringu, traktuj jako PL wall-clock
      let d: Date;
      if (
        !hasTzInfo(raw) &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)
      ) {
        d = fromZonedTime(raw.length === 16 ? `${raw}:00` : raw, tz);
      } else {
        d = new Date(raw);
      }

      if (!Number.isNaN(d.getTime())) {
        scheduledDeliveryAt = d.toISOString();
        const pl = nowPL(d);

        requestedDateStr = `${pl.getFullYear()}-${pad(pl.getMonth() + 1)}-${pad(
          pl.getDate()
        )}`;
        requestedMinutes = pl.getHours() * 60 + pl.getMinutes();
        clientDeliveryForDb = `${pad(pl.getHours())}:${pad(pl.getMinutes())}`;
      }
    }
  }

  // fallback: brak/nieparsowalne = ASAP (czas do blokad bierzemy z `now` PL)
  if (!requestedDateStr || requestedMinutes == null) {
    requestedDateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate()
    )}`;
    requestedMinutes = now.getHours() * 60 + now.getMinutes();
    if (!clientDeliveryForDb) clientDeliveryForDb = "asap";
  }

  // varchar(10) safety
  if (
    typeof clientDeliveryForDb === "string" &&
    clientDeliveryForDb.length > 10
  ) {
    clientDeliveryForDb = clientDeliveryForDb.slice(0, 10);
  }

  return {
    clientDeliveryForDb: clientDeliveryForDb || "asap",
    scheduledDeliveryAt,
    requestedDateStr,
    requestedMinutes,
  };
}

export async function enforceRestaurantBlockedTimes(args: {
  supabaseAdmin: any;
  restaurant_id: string;
  requestedDateStr: string;
  requestedMinutes: number;
}): Promise<NextResponse | null> {
  const { supabaseAdmin, restaurant_id, requestedDateStr, requestedMinutes } =
    args;

  try {
    const { data: blockedSlots, error: blockedErr } = await supabaseAdmin
      .from("restaurant_blocked_times")
      .select("full_day, from_time, to_time, kind")
      .eq("restaurant_id", restaurant_id)
      .eq("block_date", requestedDateStr);

    if (blockedErr) {
      console.error(
        "[orders.create] restaurant_blocked_times error:",
        (blockedErr as any)?.message || blockedErr
      );
      return null; // jak było: logujemy, ale nie blokujemy zamówienia
    }

    if (!blockedSlots || blockedSlots.length === 0) return null;

    const isBlocked = (blockedSlots as any[]).some((slot) => {
      const type = (slot.kind as string) || "both";

      // blokujemy tylko zamówienia (order/both)
      if (type === "reservation") return false;

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

    return null;
  } catch (e) {
    console.error("[orders.create] restaurant_blocked_times check error:", e);
    return null; // jak było: błąd checka nie blokuje zamówienia
  }
}
