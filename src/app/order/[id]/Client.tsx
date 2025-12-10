// src/app/order/[id]/client.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  Clock,
  MapPin,
  Bike,
  Store,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

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
  if (s === "placed" || s === "new") return "Złożone";
  if (s === "completed") return "Zrealizowane";
  if (s === "cancelled") return "Anulowane";
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
      <section className="min-h-[60vh] flex items-center justify-center px-4 py-16 text-white">
        <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-red-950/40 px-6 py-5 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-500/20">
            <AlertCircle className="h-6 w-6 text-red-400" />
          </div>
          <h1 className="mb-1 text-lg font-semibold">Błąd ładowania</h1>
          <p className="text-sm text-red-100/80">
            {err || "Wystąpił błąd podczas pobierania statusu zamówienia."}
          </p>
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="min-h-[60vh] flex items-center justify-center px-4 py-16 text-white">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/40 px-6 py-5 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
            <Clock className="h-6 w-6" />
          </div>
          <p className="text-sm opacity-80">Ładowanie statusu zamówienia…</p>
        </div>
      </section>
    );
  }

  const etaHM = fmtHM(data.eta);
  const placedHM = fmtHM(data.placedAt);
  const clientReq =
    data.clientRequestedTime === "asap"
      ? "Jak najszybciej"
      : fmtHM(data.clientRequestedTime) || null;

  const isFinished =
    data.status === "completed" || data.status === "cancelled";

  const shortId = String(data.id).slice(-6).toUpperCase();

  const steps = [
    { id: "new", label: "Złożone" },
    {
      id: "accepted",
      label:
        data.option === "delivery"
          ? "Przyjęte / w przygotowaniu"
          : "Przyjęte / przygotowujemy",
    },
    {
      id: "completed",
      label: data.status === "cancelled" ? "Anulowane" : "Zrealizowane",
    },
  ] as const;

  const currentStepIndex =
    data.status === "completed" || data.status === "cancelled"
      ? 2
      : data.status === "accepted"
      ? 1
      : 0;

  return (
    <section className="min-h-[70vh] w-full px-4 py-16 text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 lg:flex-row">
        {/* Główna karta zamówienia */}
        <div className="flex-1">
          <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-zinc-900/90 via-black/90 to-zinc-950/90 px-8 py-7 shadow-[0_20px_50px_rgba(0,0,0,0.7)]">
            <div className="pointer-events-none absolute inset-x-[-40%] -top-40 h-56 bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.35),_transparent_60%)]" />
            <header className="relative mb-5 flex flex-col gap-2 text-left">
              <p className="text-xs uppercase tracking-[0.2em] text-red-300/80">
                Śledzenie zamówienia
              </p>
              <h1 className="text-2xl font-semibold">
                Zamówienie #{data.id}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 uppercase tracking-wide">
                  {data.option === "delivery" ? (
                    <>
                      <Bike className="h-3.5 w-3.5" />
                      DOSTAWA
                    </>
                  ) : (
                    <>
                      <Store className="h-3.5 w-3.5" />
                      NA WYNOS
                    </>
                  )}
                </span>
                {placedHM && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-[11px]">
                    <Clock className="h-3 w-3" />
                    Złożone {placedHM}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-white/0 px-3 py-1 text-[11px] text-white/60">
                  Kod odbioru:{" "}
                  <span className="font-mono text-xs font-semibold text-white">
                    {shortId}
                  </span>
                </span>
              </div>
            </header>

            {/* Status + ETA */}
            <div className="relative mt-2 grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="text-left">
                <p className="text-xs uppercase tracking-[0.16em] text-white/50">
                  Aktualny status
                </p>
                <div className="mt-1 flex items-center gap-2 text-lg">
                  <span className="font-semibold">
                    {statusLabel(data.status, data.eta)}
                  </span>
                  {isFinished ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Zakończone
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/10 px-2.5 py-0.5 text-[11px] text-yellow-200">
                      <Clock className="h-3.5 w-3.5" />
                      W trakcie realizacji
                    </span>
                  )}
                </div>

                <div className="mt-3 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-white/70">
                      <Clock className="h-4 w-4" />
                      ETA:
                    </span>
                    <span className="font-medium">
                      {etaHM ?? "w przygotowaniu"}
                    </span>
                    {!isFinished && etaHM && msLeft !== null && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px]">
                        Odliczanie: {countdown}
                      </span>
                    )}
                  </div>

                  {clientReq && (
                    <div className="flex items-center justify-between text-xs text-white/70">
                      <span>Czas wybrany przez klienta:</span>
                      <span className="font-medium text-white">
                        {clientReq}
                      </span>
                    </div>
                  )}

                  <div className="pt-1 text-xs text-white/60">
                    Suma zamówienia:{" "}
                    <span className="font-semibold text-white">
                      {Number(data.total).toFixed(2)} zł
                    </span>
                  </div>
                </div>
              </div>

              {/* „Mapa” / blok informacyjny */}
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-red-500/20 via-red-500/5 to-amber-400/10 p-3.5 text-xs lg:text-[13px]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40">
                      {data.option === "delivery" ? (
                        <Bike className="h-4 w-4" />
                      ) : (
                        <Store className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-red-100/80">
                        {data.option === "delivery"
                          ? "Dostawa Sushi Tutaj"
                          : "Odbiór osobisty"}
                      </p>
                      <p className="text-sm font-medium">
                        {data.option === "delivery"
                          ? "Twoje sushi jest w drodze"
                          : "Twoje sushi czeka w lokalu"}
                      </p>
                    </div>
                  </div>
                  <MapPin className="h-5 w-5 text-red-200/90" />
                </div>

                {data.option === "delivery" ? (
                  <p className="mb-2 text-[12px] text-red-50/90">
                    Kurier ruszy z restauracji niebawem. Jeśli masz dodatkowe
                    pytania, zadzwoń bezpośrednio do lokalu i podaj numer
                    zamówienia{" "}
                    <span className="font-mono font-semibold">{shortId}</span>.
                  </p>
                ) : (
                  <p className="mb-2 text-[12px] text-red-50/90">
                    Przygotujemy Twoje sushi na wskazaną godzinę. W lokalu
                    podaj numer zamówienia{" "}
                    <span className="font-mono font-semibold">{shortId}</span>,
                    aby szybko odebrać zestaw.
                  </p>
                )}

                {/* Pasek „trasy” jako pseudo-mapa */}
                <div className="mt-3 h-16 rounded-xl bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.12),_transparent_55%),linear-gradient(120deg,rgba(248,250,252,0.08),transparent)] p-2">
                  <div className="flex h-full items-center justify-between">
                    <div className="flex flex-col items-start gap-1 text-[11px] text-white/65">
                      <span className="rounded-full bg-black/40 px-2 py-0.5">
                        Restauracja
                      </span>
                      <span className="rounded-full bg-black/20 px-2 py-0.5">
                        {data.option === "delivery"
                          ? "Dostawa pod wskazany adres"
                          : "Odbiór przy barze"}
                      </span>
                    </div>
                    <div className="relative flex h-full flex-1 items-center justify-center">
                      <div className="absolute inset-x-4 h-[2px] rounded-full bg-white/20" />
                      <div className="relative flex h-full w-full items-center justify-between px-3">
                        <span className="h-2 w-2 rounded-full bg-white/80" />
                        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-black/70 shadow-lg shadow-black/60">
                          {data.option === "delivery" ? (
                            <Bike className="h-4 w-4" />
                          ) : (
                            <Store className="h-4 w-4" />
                          )}
                        </span>
                        <span className="h-2 w-2 rounded-full bg-white/40" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Oś postępu statusu */}
            <div className="relative mt-6 border-t border-white/10 pt-5">
              <p className="mb-3 text-xs uppercase tracking-[0.16em] text-white/50">
                Postęp realizacji
              </p>
              <ol className="flex items-center justify-between gap-3 text-xs">
                {steps.map((step, index) => {
                  const done = index <= currentStepIndex;
                  const isCurrent = index === currentStepIndex;

                  return (
                    <li key={step.id} className="flex flex-1 items-center gap-2">
                      <div
                        className={[
                          "flex h-7 w-7 items-center justify-center rounded-full border text-[11px]",
                          done
                            ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                            : "border-white/25 bg-white/5 text-white/60",
                        ].join(" ")}
                      >
                        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                      </div>
                      <div className="flex flex-col">
                        <span
                          className={
                            isCurrent
                              ? "font-medium text-white"
                              : "text-white/70"
                          }
                        >
                          {step.label}
                        </span>
                      </div>
                      {index < steps.length - 1 && (
                        <div className="mx-2 h-px flex-1 bg-gradient-to-r from-white/30 via-white/10 to-transparent" />
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
