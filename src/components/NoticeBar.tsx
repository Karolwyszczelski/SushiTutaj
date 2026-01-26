// src/components/NoticeBar.tsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { toZonedTime } from "date-fns-tz";
import type { NoticeBarConfig } from "@/lib/noticeBar";

const TZ = "Europe/Warsaw";

const timeToMinutes = (t?: string | null): number | null => {
  if (!t) return null;
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
};

const hhmm = (t?: string | null) => {
  if (!t) return "";
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${String(parseInt(m[1], 10)).padStart(2, "0")}:${m[2]}`;
};

export default function NoticeBar({ config }: { config: NoticeBarConfig | null }) {
  const [collapsed, setCollapsed] = useState(false);
  const [tick, setTick] = useState(0);

  // odśwież co 30s, żeby pasek sam znikał/pojawiał się o czasie
  useEffect(() => {
    const iv = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  const computed = useMemo(() => {
    if (!config?.enabled) {
      return { show: false, summary: "", body: "", dotClass: "bg-amber-400" };
    }

    const nowTz = toZonedTime(new Date(), TZ);
    const nowMin = nowTz.getHours() * 60 + nowTz.getMinutes();

    const openMin = timeToMinutes(config.open_time);
    const closeMin = timeToMinutes(config.close_time);

    const openLabel = hhmm(config.open_time);
    const closeLabel = hhmm(config.close_time);

    const preOpen = openMin != null && nowMin < openMin ? config.message_pre_open : null;
    const postClose = closeMin != null && nowMin >= closeMin ? config.message_post_close : null;

    const raw = preOpen || postClose;
    if (!raw) return { show: false, summary: "", body: "", dotClass: "bg-amber-400" };

    const body = raw
      .replaceAll("{open_time}", openLabel || "12:00")
      .replaceAll("{close_time}", closeLabel || "");

    const summary = preOpen
      ? `Nieczynne — zamówienia od ${openLabel || "12:00"}`
      : `Nieczynne — zapraszamy jutro`;

    const dotClass = preOpen ? "bg-amber-400" : "bg-rose-400";

    return { show: true, summary, body, dotClass };
  }, [config, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // zapamiętuj zwinięcie/rozwinięcie
  useEffect(() => {
    if (!config?.key) return;
    try {
      const k = `noticebar:collapsed:${config.key}`;
      setCollapsed(localStorage.getItem(k) === "1");
    } catch {}
  }, [config?.key]);

  const persistCollapsed = useCallback(
    (next: boolean) => {
      setCollapsed(next);
      if (!config?.key) return;
      try {
        const k = `noticebar:collapsed:${config.key}`;
        localStorage.setItem(k, next ? "1" : "0");
      } catch {}
    },
    [config?.key]
  );

  if (!computed.show) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 pointer-events-none">
      <div className="pointer-events-auto">
        {!collapsed ? (
          // ROZWINIĘTE: tylko kropka + tytuł + opis, wszystko wyśrodkowane
          <div
            className="border-b border-white/10 bg-black/55 backdrop-blur cursor-pointer"
            onClick={() => persistCollapsed(true)}
            role="button"
            aria-label="Zwiń pasek informacji"
            title="Kliknij, aby zwinąć"
          >
            <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
              <div className="flex flex-col items-center justify-center text-center gap-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${computed.dotClass}`}
                  />
                  <div className="text-[12px] font-semibold tracking-wide text-white/95 sm:text-sm">
                    {computed.summary}
                  </div>
                </div>

                <div className="text-[12px] leading-snug text-white/80 sm:text-sm">
                  <span className="whitespace-pre-line break-words">{computed.body}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // ZWINIĘTE: tylko przycisk rozwinięcia (strzałka)
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => persistCollapsed(false)}
              className="inline-flex h-8 w-12 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white/90 shadow-sm hover:border-white/25 hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white/30"
              aria-label="Pokaż pasek"
              title="Pokaż"
            >
              <span className="text-base leading-none">▾</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
