"use client";

import React, { useEffect, useMemo, useState } from "react";

type Row = {
  key: string;
  scope: "global" | "restaurant";
  restaurant_slug: string;
  enabled: boolean;
  open_time: string;     // "12:00:00"
  close_time: string | null;
  message_pre_open: string;
  message_post_close: string;
  updated_at: string;
};

const toHHMM = (t?: string | null) => {
  if (!t) return "";
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  return m ? `${String(parseInt(m[1], 10)).padStart(2, "0")}:${m[2]}` : "";
};

export default function NoticeBarForm({ restaurantSlug }: { restaurantSlug: string | null }) {
  const [scope, setScope] = useState<"restaurant" | "global">("restaurant");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [globalRow, setGlobalRow] = useState<Row | null>(null);
  const [restRow, setRestRow] = useState<Row | null>(null);

  const activeRow = useMemo(() => (scope === "global" ? globalRow : restRow), [scope, globalRow, restRow]);

  const [enabled, setEnabled] = useState(true);
  const [openTime, setOpenTime] = useState("12:00");
  const [closeTime, setCloseTime] = useState("");
  const [preMsg, setPreMsg] = useState("Restauracja jest nieczynna. Zamówienia przyjmujemy od {open_time}.");
  const [postMsg, setPostMsg] = useState("Restauracja jest nieczynna. Zapraszamy jutro.");

  const hydrateFromRow = (r: Row | null) => {
    setEnabled(r?.enabled ?? true);
    setOpenTime(toHHMM(r?.open_time) || "12:00");
    setCloseTime(toHHMM(r?.close_time) || "");
    setPreMsg(r?.message_pre_open || "Restauracja jest nieczynna. Zamówienia przyjmujemy od {open_time}.");
    setPostMsg(r?.message_post_close || "Restauracja jest nieczynna. Zapraszamy jutro.");
  };

  useEffect(() => {
    // jeśli nie ma restauracji (brak paramu) — wymuś global
    if (!restaurantSlug) setScope("global");
  }, [restaurantSlug]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErr(null);
      setOk(null);

      const qs = new URLSearchParams();
      if (restaurantSlug) qs.set("restaurant", restaurantSlug);

      const res = await fetch(`/api/admin/notice-bar?${qs.toString()}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setErr(j?.error || "Nie udało się pobrać ustawień paska.");
        setLoading(false);
        return;
      }

      setGlobalRow(j.global ?? null);
      setRestRow(j.restaurant ?? null);

      // po pierwszym załadowaniu ustaw formularz z aktywnego scope
      const row = scope === "global" ? (j.global ?? null) : (j.restaurant ?? null);
      hydrateFromRow(row);

      setLoading(false);
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantSlug]);

  useEffect(() => {
    hydrateFromRow(activeRow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    setOk(null);

    const res = await fetch("/api/admin/notice-bar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope,
        restaurantSlug: restaurantSlug,
        enabled,
        open_time: openTime,
        close_time: closeTime ? closeTime : null,
        message_pre_open: preMsg,
        message_post_close: postMsg,
      }),
    });

    const j = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      setErr(j?.error || "Nie udało się zapisać.");
      setSaving(false);
      return;
    }

    const row = j.row as Row | null;
    if (row) {
      if (row.scope === "global") setGlobalRow(row);
      else setRestRow(row);
    }

    setOk("Zapisano.");
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="text-sm text-slate-600">Ładowanie…</div>
      ) : (
        <>
          {err && <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{err}</div>}
          {ok && <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{ok}</div>}

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-semibold text-slate-800">Zakres:</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as any)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              disabled={!restaurantSlug} // jak nie ma slug, tylko global
            >
              <option value="restaurant">Tylko ta restauracja</option>
              <option value="global">Globalnie</option>
            </select>

            <label className="ml-auto inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Włączone
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="text-sm font-semibold">Godzina otwarcia (od kiedy przyjmujecie)</div>
              <input
                type="time"
                step={60}
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              />
              <div className="mt-1 text-[12px] text-slate-500">Przed tą godziną pokaże komunikat “nieczynne”.</div>
            </div>

            <div>
              <div className="text-sm font-semibold">Godzina zamknięcia (opcjonalnie)</div>
              <input
                type="time"
                step={60}
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              />
              <div className="mt-1 text-[12px] text-slate-500">Po tej godzinie pokaże “zapraszamy jutro”.</div>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold">Tekst przed otwarciem</div>
            <textarea
              value={preMsg}
              onChange={(e) => setPreMsg(e.target.value)}
              className="mt-1 min-h-[90px] w-full rounded-md border border-slate-300 bg-white p-3 text-sm"
            />
            <div className="mt-1 text-[12px] text-slate-500">Możesz użyć: <code>{"{open_time}"}</code></div>
          </div>

          <div>
            <div className="text-sm font-semibold">Tekst po zamknięciu</div>
            <textarea
              value={postMsg}
              onChange={(e) => setPostMsg(e.target.value)}
              className="mt-1 min-h-[90px] w-full rounded-md border border-slate-300 bg-white p-3 text-sm"
            />
            <div className="mt-1 text-[12px] text-slate-500">Opcjonalnie: <code>{"{close_time}"}</code></div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "Zapisywanie…" : "Zapisz"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
