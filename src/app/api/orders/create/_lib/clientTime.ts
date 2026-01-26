// src/api/orders/create/_lib/clientTime.ts
import { NextResponse } from "next/server";
import { orderLogger } from "@/lib/logger";
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
      orderLogger.error("restaurant_blocked_times error", {
        error: (blockedErr as any)?.message || blockedErr,
      });
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
    orderLogger.error("restaurant_blocked_times check error", { error: e });
    return null; // jak było: błąd checka nie blokuje zamówienia
  }
}

/**
 * Sprawdza czy restauracja jest zamknięta według closure_windows (dynamiczne zamknięcia).
 * Zwraca NextResponse z błędem jeśli zamknięte, null jeśli otwarte.
 */
export async function enforceClosureWindows(args: {
  supabaseAdmin: any;
  restaurant_id: string;
  now: Date; // Data w PL (z nowPL())
}): Promise<NextResponse | null> {
  const { supabaseAdmin, restaurant_id, now } = args;

  try {
    const { data: closures, error: closureErr } = await supabaseAdmin
      .from("closure_windows")
      .select("start_time, end_time, weekday, is_active, reason")
      .eq("restaurant_id", restaurant_id)
      .eq("is_active", true);

    if (closureErr) {
      orderLogger.error("closure_windows error", {
        error: (closureErr as any)?.message || closureErr,
      });
      return null; // błąd checka nie blokuje zamówienia
    }

    if (!closures || closures.length === 0) return null;

    const ts = now.getTime();
    const weekday = now.getDay();

    const inClosure = (closures as any[]).find((c) => {
      const st = c.start_time ? new Date(c.start_time).getTime() : null;
      const en = c.end_time ? new Date(c.end_time).getTime() : null;
      
      // weekday match: null = każdy dzień, number = konkretny dzień
      const match = c.weekday !== null ? (c.weekday === weekday) : true;
      if (!match) return false;
      
      // przedział czasowy
      if (st && en) return ts >= st && ts <= en;
      return false;
    });

    if (inClosure) {
      const reason = inClosure.reason || "Restauracja jest chwilowo zamknięta.";
      return NextResponse.json(
        { error: reason },
        { status: 400 }
      );
    }

    return null;
  } catch (e) {
    orderLogger.error("closure_windows check error", { error: e });
    return null;
  }
}
