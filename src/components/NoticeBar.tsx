"use client";

import React, { useEffect, useMemo, useState } from "react";
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

export default function NoticeBar({ config }: { config: NoticeBarConfig | null }) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [tick, setTick] = useState(0);

  // odśwież logikę co 30s, żeby pasek sam znikał/pojawiał się o czasie
  useEffect(() => {
    const iv = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  const computed = useMemo(() => {
    if (!config?.enabled) return { show: false, summary: "", body: "" };

    const nowTz = toZonedTime(new Date(), TZ);
    const nowMin = nowTz.getHours() * 60 + nowTz.getMinutes();

    const openMin = timeToMinutes(config.open_time);
    const closeMin = timeToMinutes(config.close_time);

    const openLabel = hhmm(config.open_time);
    const closeLabel = hhmm(config.close_time);

    const preOpen =
      openMin != null && nowMin < openMin
        ? config.message_pre_open
        : null;

    const postClose =
      closeMin != null && nowMin >= closeMin
        ? config.message_post_close
        : null;

    const raw = preOpen || postClose;
    if (!raw) return { show: false, summary: "", body: "" };

    const body = raw
      .replaceAll("{open_time}", openLabel || "12:00")
      .replaceAll("{close_time}", closeLabel || "");

    const summary =
      preOpen
        ? `Nieczynne — zamówienia od ${openLabel || "12:00"}`
        : `Nieczynne — zapraszamy jutro`;

    return { show: true, summary, body };
  }, [config, tick]);

  // “X” chowa pasek na dziś, ale jeśli admin zmieni treść (updated_at) — wróci
  useEffect(() => {
    if (!config?.updated_at) return;
    const key = `noticebar:dismiss:${config.key}`;
    const stored = localStorage.getItem(key);
    const today = warsawDayKey();
    setDismissed(stored === `${today}|${config.updated_at}`);
  }, [config?.key, config?.updated_at]);

  const onDismiss = () => {
    if (!config?.updated_at) return;
    const key = `noticebar:dismiss:${config.key}`;
    const today = warsawDayKey();
    localStorage.setItem(key, `${today}|${config.updated_at}`);
    setDismissed(true);
  };

   if (!computed.show || dismissed) return null;

  const panelId = `noticebar-panel-${config?.key ?? "default"}`;

  return (
    <div className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 pt-2 pb-3 sm:px-6">
        {/* Tekst wyrównany i w stylu strony */}
        <div className="text-center text-[12px] font-semibold tracking-wide text-white/90 sm:text-sm">
          {computed.summary}
        </div>

        {/* Strzałka NA ŚRODKU (jedyny kontroler paska) */}
        <div className="mt-1 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={panelId}
            className="
              inline-flex h-8 w-12 items-center justify-center
              rounded-full border border-white/15 bg-white/5
              text-white shadow-sm
              hover:border-white/25 hover:bg-white/10
              focus:outline-none focus:ring-2 focus:ring-white/40
            "
            title={expanded ? "Zwiń" : "Rozwiń"}
          >
            <span className="text-base leading-none">
              {expanded ? "▴" : "▾"}
              {/* jeśli chcesz dosłownie: {expanded ? "/\\" : "\\/"} */}
            </span>
          </button>
        </div>

        {/* Rozwinięta treść */}
        {expanded && (
          <div
            id={panelId}
            className="mt-3 rounded-2xl border border-white/10 bg-black/50 p-4 text-sm leading-relaxed text-white/90"
          >
            <div className="whitespace-pre-line">{computed.body}</div>

            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                onClick={onDismiss}
                className="text-[11px] font-semibold text-white/70 underline underline-offset-4 hover:text-white"
              >
                Ukryj na dziś
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
