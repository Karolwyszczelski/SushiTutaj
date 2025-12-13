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

  return (
    <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 text-amber-950">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:px-6">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-white/70 px-3 text-sm font-semibold hover:bg-white"
          aria-expanded={expanded}
        >
          <span
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            ▾
          </span>
          <span>{computed.summary}</span>
        </button>

        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto inline-flex h-9 items-center rounded-md bg-white/70 px-3 text-sm font-semibold hover:bg-white"
          aria-label="Zamknij"
          title="Zamknij"
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div className="mx-auto max-w-6xl px-3 pb-3 sm:px-6">
          <div className="rounded-xl border border-amber-200 bg-white p-3 text-sm leading-relaxed">
            {computed.body}
          </div>
        </div>
      )}
    </div>
  );
}
