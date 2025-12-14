// src/components/NoticeBar.tsx (lub gdzie masz NoticeBar)
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

const warsawDayKey = () => {
  const d = toZonedTime(new Date(), TZ);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function NoticeBar({
  config,
}: {
  config: NoticeBarConfig | null;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [tick, setTick] = useState(0);

  // odśwież co 30s, żeby pasek sam znikał/pojawiał się o czasie
  useEffect(() => {
    const iv = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  const computed = useMemo(() => {
    if (!config?.enabled) return { show: false, summary: "", body: "", openLabel: "", closeLabel: "" };

    const nowTz = toZonedTime(new Date(), TZ);
    const nowMin = nowTz.getHours() * 60 + nowTz.getMinutes();

    const openMin = timeToMinutes(config.open_time);
    const closeMin = timeToMinutes(config.close_time);

    const openLabel = hhmm(config.open_time);
    const closeLabel = hhmm(config.close_time);

    const preOpen =
      openMin != null && nowMin < openMin ? config.message_pre_open : null;

    const postClose =
      closeMin != null && nowMin >= closeMin ? config.message_post_close : null;

    const raw = preOpen || postClose;
    if (!raw) return { show: false, summary: "", body: "", openLabel, closeLabel };

    const body = raw
      .replaceAll("{open_time}", openLabel || "12:00")
      .replaceAll("{close_time}", closeLabel || "");

    const summary = preOpen
      ? `Nieczynne — zamówienia od ${openLabel || "12:00"}`
      : `Nieczynne — zapraszamy jutro`;

    return { show: true, summary, body, openLabel, closeLabel };
  }, [config, tick]);

  // “Ukryj na dziś” — chowa na dziś, ale jeśli admin zmieni treść (updated_at) — wróci
  useEffect(() => {
    if (!config?.updated_at || !config?.key) return;
    try {
      const key = `noticebar:dismiss:${config.key}`;
      const stored = localStorage.getItem(key);
      const today = warsawDayKey();
      setDismissed(stored === `${today}|${config.updated_at}`);
    } catch {}
  }, [config?.key, config?.updated_at]);

  // zapamiętuj zwinięcie/rozwinięcie niezależnie od dnia
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

  const onDismiss = () => {
    if (!config?.updated_at || !config?.key) return;
    try {
      const key = `noticebar:dismiss:${config.key}`;
      const today = warsawDayKey();
      localStorage.setItem(key, `${today}|${config.updated_at}`);
      setDismissed(true);
    } catch {}
  };

  if (!computed.show || dismissed) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 pointer-events-none">
      <div className="pointer-events-auto">
        {!collapsed ? (
          <>
            {/* Pasek */}
            <div className="border-b border-white/10 bg-black/55 backdrop-blur">
              <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Linia 1: nagłówek */}
                    <div className="flex items-center gap-2">
                      <span className="mt-[1px] inline-block h-2 w-2 flex-none rounded-full bg-amber-400" />
                      <div className="min-w-0 truncate text-[12px] font-semibold tracking-wide text-white/95 sm:text-sm">
                        {computed.summary}
                      </div>
                    </div>

                    {/* Linia 2: treść (bez rozwijania; przy długich tekstach ograniczamy wysokość) */}
                    <div
                      className="mt-1 max-h-[40px] overflow-hidden text-[12px] leading-snug text-white/80"
                      title={computed.body}
                    >
                      <span className="whitespace-pre-line break-words">{computed.body}</span>
                    </div>

                    {/* “Tabelka”/kafelki z godzinami */}
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-md">
                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1">
                        <span className="text-[11px] text-white/60">Start</span>
                        <span className="font-mono text-[11px] text-white/90">
                          {computed.openLabel || "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1">
                        <span className="text-[11px] text-white/60">Koniec</span>
                        <span className="font-mono text-[11px] text-white/90">
                          {computed.closeLabel || "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Akcje (minimalistycznie) */}
                  <div className="flex flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={onDismiss}
                      className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/75 hover:bg-white/10 hover:text-white"
                      title="Ukryj na dziś"
                    >
                      Ukryj
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Strzałka (zwijanie) — mała, centralnie */}
            <div className="-mt-2 flex justify-center">
              <button
                type="button"
                onClick={() => persistCollapsed(true)}
                className="inline-flex h-8 w-12 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white/90 shadow-sm hover:border-white/25 hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white/30"
                aria-label="Zwiń pasek"
                title="Zwiń"
              >
                <span className="text-base leading-none">▴</span>
              </button>
            </div>
          </>
        ) : (
          /* Tylko strzałka (rozwijanie) */
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
