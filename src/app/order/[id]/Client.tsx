// src/app/order/[id]/client.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type Status =
  | "new"
  | "placed"
  | "accepted"
  | "completed"
  | "cancelled"
  | string;

type Option = "takeaway" | "delivery" | string;

type S = {
  id: number | string;
  status: Status;
  eta: string | null;
  option: Option;
  total: number;
  placedAt: string;
  clientRequestedTime: string | null;
};

const fmtHM = (value?: string | null) => {
  if (!value) return null;
  const v = value.trim();

  // Format HH:mm (opcjonalnie z sekundami)
  const m = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) {
    const h = String(parseInt(m[1], 10)).padStart(2, "0");
    const mm = String(parseInt(m[2], 10)).padStart(2, "0");
    return `${h}:${mm}`;
  }

  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const optionLabel = (opt?: Option) =>
  opt === "delivery"
    ? "DOSTAWA"
    : opt === "takeaway"
    ? "NA WYNOS"
    : "—";

const statusLabel = (s: Status, eta?: string | null) => {
  if (s === "accepted") {
    const h = fmtHM(eta);
    return h ? `W przygotowaniu • odbiór ok. ${h}` : "W przygotowaniu";
  }
  if (s === "placed") return "Złożone";
  if (s === "completed") return "Zrealizowane";
  if (s === "cancelled") return "Anulowane";
  if (s === "new") return "Nowe";
  return String(s);
};

export default function ClientOrderTrackPage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();

  const [data, setData] = useState<S | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = sp.get("t") || "";
    const url = `/api/orders/status/${id}?t=${encodeURIComponent(t)}`;
    let stop = false;

    const load = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) {
          setErr(j?.error || "Błąd");
          return;
        }
        if (!stop) setData(j as S);
      } catch {
        if (!stop) setErr("Błąd sieci");
      }
    };

    load();
    const iv = setInterval(load, 15000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [id, sp]);

  const [tick, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const msLeft = useMemo(() => {
    if (!data?.eta) return null;
    const t = Date.parse(data.eta);
    if (Number.isNaN(t)) return null;
    return Math.max(0, t - Date.now());
  }, [data?.eta, tick]);

  useEffect(() => {
    if (!data?.eta) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setTick((x) => x + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [data?.eta]);

  const countdown = useMemo(() => {
    if (msLeft == null) return null;
    const sec = Math.floor(msLeft / 1000);
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [msLeft]);

  if (err) {
    return (
      <section className="min-h-[50vh] flex items-center justify-center text-white">
        Błąd: {err}
      </section>
    );
  }

  if (!data) {
    return (
      <section className="min-h-[50vh] flex items-center justify-center text-white">
        Ładowanie…
      </section>
    );
  }

  const etaHM = fmtHM(data.eta);
  const placedHM = fmtHM(data.placedAt);
  const clientReq =
    data.clientRequestedTime === "asap"
      ? "Jak najszybciej"
      : fmtHM(data.clientRequestedTime) || null;

  return (
    <section className="min-h-[60vh] flex items-center justify-center px-6 py-16 text-white">
      <div className="w-full max-w-md text-center border border-white/30 rounded-2xl p-6 bg-black/40">
        <h1 className="text-2xl font-bold mb-2">Zamówienie #{data.id}</h1>
        <p className="text-sm opacity-80 mb-4">
          Opcja: {optionLabel(data.option)}
          {placedHM ? ` • złożone ${placedHM}` : ""}
        </p>
        <div className="text-lg">
          Status:{" "}
          <span className="font-semibold">
            {statusLabel(data.status, data.eta)}
          </span>
        </div>
        <div className="mt-2 text-lg">
          ETA:{" "}
          <span className="font-semibold">
            {etaHM ?? "w przygotowaniu"}
          </span>
          {etaHM && msLeft !== null && (
            <span className="ml-2 inline-block rounded bg-white/10 px-2 py-0.5 text-xs">
              {countdown}
            </span>
          )}
        </div>
        {clientReq && (
          <div className="mt-1 text-sm opacity-80">
            Czas wybrany przez klienta: {clientReq}
          </div>
        )}
        <div className="mt-4 text-sm opacity-80">
          Suma: {Number(data.total).toFixed(2)} zł
        </div>
      </div>
    </section>
  );
}
