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

  // HH:mm lub HH:mm:ss
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

    const token = useMemo(() => {
    // wspieramy oba warianty: ?t=... oraz ?token=...
    return (sp.get("t") || sp.get("token") || "").trim();
  }, [sp]);

  useEffect(() => {
    const orderKey = String(id || "").trim();
    if (!orderKey) return;

    if (!token) {
      setData(null);
      setErr("Brak tokena w linku śledzenia.");
      return;
    }

    const url = `/api/orders/status/${encodeURIComponent(orderKey)}?t=${encodeURIComponent(
      token
    )}`;

    let stop = false;

    const load = async () => {
      try {
        setErr(null);

        const r = await fetch(url, {
          cache: "no-store",
          headers: {
            // dodatkowo w headerze (status route też to czyta)
            "x-order-token": token,
          },
        });

        const j = await r.json();

        if (!r.ok) {
          if (!stop) {
            setData(null);
            setErr(j?.error || "Błąd");
          }
          return;
        }

        if (!stop) setData(j as S);
      } catch {
        if (!stop) {
          setData(null);
          setErr("Błąd sieci");
        }
      }
    };

    load();
    const iv = setInterval(load, 15000);

    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [id, token]);


  const [tick, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const msLeft = useMemo(() => {
    if (!data?.eta) return null;
    const t = Date.parse(data.eta);
    if (Number.isNaN(t)) return null;
    return Math.max(0, t - Date.now());
  }, [data?.eta, tick]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <section className="min-h-[70vh] flex items-center justify-center px-4 py-16 text-white">
        <div className="w-full max-w-md rounded-3xl border border-red-500/40 bg-gradient-to-br from-red-900/80 via-black/90 to-black/95 px-6 py-7 text-center shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
            <AlertCircle className="h-6 w-6 text-red-300" />
          </div>
          <h1 className="mb-1 text-xl font-semibold">Błąd ładowania</h1>
          <p className="text-sm text-red-100/80">
            {err || "Wystąpił błąd podczas pobierania statusu zamówienia."}
          </p>
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="min-h-[70vh] flex items-center justify-center px-4 py-20 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900/80 via-black/90 to-black/95 px-6 py-7 text-center shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
            <Clock className="h-6 w-6" />
          </div>
          <h1 className="mb-1 text-xl font-semibold">Ładujemy zamówienie</h1>
          <p className="text-sm text-white/70">
            Za chwilę pokażemy aktualny status Twojego sushi.
          </p>
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
    { id: "placed", label: "Złożone" },
    {
      id: "accepted",
      label:
        data.option === "delivery"
          ? "Przyjęte / w przygotowaniu"
          : "Przyjęte / przygotowujemy",
    },
    {
      id: data.status === "cancelled" ? "cancelled" : "completed",
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
    <section className="min-h-[72vh] w-full px-4 py-16 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        {/* TOP: karta z gradientem */}
        <div className="relative overflow-hidden rounded-[32px] border border-white/12 bg-gradient-to-br from-zinc-900/95 via-black/95 to-zinc-950/95 shadow-[0_26px_80px_rgba(0,0,0,0.9)]">
          {/* Glow */}
          <div className="pointer-events-none absolute inset-x-[-30%] -top-40 h-56 bg-[radial-gradient(circle_at_top,_rgba(248,113,113,0.45),_transparent_60%)]" />
          <div className="pointer-events-none absolute inset-x-[-20%] bottom-[-40%] h-72 bg-[radial-gradient(circle_at_bottom,_rgba(250,250,250,0.08),_transparent_60%)]" />

          {/* HEADER */}
          <header className="relative flex flex-col gap-4 border-b border-white/10 px-7 py-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-red-200/80">
                ŚLEDZENIE ZAMÓWIENIA
              </p>
              <h1 className="text-2xl font-semibold md:text-[26px]">
                Zamówienie #{data.id}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/18 bg-white/5 px-3 py-1 font-semibold uppercase tracking-wide">
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
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-3 py-1 text-white/80">
                    <Clock className="h-3.5 w-3.5" />
                    Złożone {placedHM}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 text-sm md:items-end">
              <div className="flex items-center gap-2 text-xs text-white/60">
                Kod odbioru:
                <span className="font-mono text-sm font-semibold tracking-[0.18em] text-white">
                  {shortId}
                </span>
              </div>
              <div className="rounded-2xl bg-white/5 px-3 py-2 text-xs text-white/70">
                Suma zamówienia{" "}
                <span className="ml-1 font-semibold text-white">
                  {Number(data.total).toFixed(2)} zł
                </span>
              </div>
            </div>
          </header>

          {/* BODY: status + „mapka” */}
          <div className="relative grid gap-6 px-7 py-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1.15fr)]">
            {/* Status + ETA */}
            <div className="space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/50">
                  Aktualny status
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-lg">
                  <span className="font-semibold">
                    {statusLabel(data.status, data.eta)}
                  </span>
                  {isFinished ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/18 px-2.5 py-0.5 text-[11px] text-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Zakończone
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/14 px-2.5 py-0.5 text-[11px] text-yellow-100">
                      <Clock className="h-3.5 w-3.5" />
                      W trakcie realizacji
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/12 bg-black/60 px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-white/70">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5">
                      <Clock className="h-4 w-4" />
                    </span>
                    <div className="flex flex-col">
                      <span className="text-[11px] uppercase tracking-[0.18em] text-white/50">
                        Szacowany czas
                      </span>
                      <span className="text-base font-medium">
                        {etaHM ?? "W przygotowaniu"}
                      </span>
                    </div>
                  </div>
                  {!isFinished && etaHM && msLeft !== null && (
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                        Odliczanie
                      </p>
                      <p className="mt-0.5 rounded-full bg-white/8 px-3 py-1 text-xs font-medium">
                        {countdown}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-3 grid gap-1.5 text-xs text-white/70">
                  {clientReq && (
                    <div className="flex items-center justify-between gap-2">
                      <span>Czas wybrany przez klienta:</span>
                      <span className="font-medium text-white">
                        {clientReq}
                      </span>
                    </div>
                  )}
                  {placedHM && (
                    <div className="flex items-center justify-between gap-2">
                      <span>Zamówienie złożone:</span>
                      <span>{placedHM}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Prawy panel: „mapka” / info o dostawie/odbiorze */}
            <div className="space-y-3">
              <div className="rounded-3xl border border-white/14 bg-gradient-to-br from-red-500/28 via-red-500/10 to-amber-400/12 p-4 text-xs lg:text-[13px]">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 shadow-md shadow-black/40">
                      {data.option === "delivery" ? (
                        <Bike className="h-4 w-4" />
                      ) : (
                        <Store className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-red-100/80">
                        {data.option === "delivery"
                          ? "Dostawa sushi"
                          : "Odbiór osobisty"}
                      </p>
                      <p className="text-sm font-medium text-white">
                        {data.option === "delivery"
                          ? "Twoje sushi jest w drodze"
                          : "Twoje sushi czeka w lokalu"}
                      </p>
                    </div>
                  </div>
                  <MapPin className="h-5 w-5 text-red-100/90" />
                </div>

                {data.option === "delivery" ? (
                  <p className="mb-3 text-[12px] text-red-50/90">
                    Kurier wyruszy z restauracji niebawem. Jeśli chcesz
                    upewnić się co do adresu lub czasu, zadzwoń do lokalu i
                    podaj kod zamówienia{" "}
                    <span className="font-mono font-semibold">{shortId}</span>.
                  </p>
                ) : (
                  <p className="mb-3 text-[12px] text-red-50/90">
                    Przyjdź do lokalu na wskazaną godzinę i podaj przy barze
                    numer{" "}
                    <span className="font-mono font-semibold">{shortId}</span>,
                    żeby szybko odebrać zestaw.
                  </p>
                )}

                {/* pseudo-mapa / trasa */}
                <div className="mt-3 h-20 rounded-2xl bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.18),_transparent_55%),linear-gradient(120deg,rgba(15,23,42,0.9),rgba(15,23,42,0.95))] p-3">
                  <div className="flex h-full items-center justify-between">
                    <div className="flex flex-col gap-1 text-[11px] text-white/65">
                      <span className="rounded-full bg-black/60 px-2 py-0.5">
                        Restauracja
                      </span>
                      <span className="rounded-full bg-black/40 px-2 py-0.5">
                        {data.option === "delivery"
                          ? "Trasa do klienta"
                          : "Odbiór przy barze"}
                      </span>
                    </div>

                    <div className="relative flex h-full flex-1 items-center justify-center">
                      <div className="absolute inset-x-5 h-[2px] rounded-full bg-white/20" />
                      <div className="relative flex h-full w-full items-center justify-between px-4">
                        <span className="h-2 w-2 rounded-full bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
                        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-black/80 shadow-[0_0_18px_rgba(0,0,0,0.9)]">
                          {data.option === "delivery" ? (
                            <Bike className="h-4 w-4" />
                          ) : (
                            <Store className="h-4 w-4" />
                          )}
                        </span>
                        <span className="h-2 w-2 rounded-full bg-white/30" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-white/45">
                W razie problemów z zamówieniem skontaktuj się bezpośrednio z
                restauracją, podając pełny numer zamówienia{" "}
                <span className="font-mono">{String(data.id)}</span>.
              </p>
            </div>
          </div>

          {/* OŚ POSTĘPU */}
          <div className="relative border-t border-white/10 px-7 py-5">
            <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-white/50">
              Postęp realizacji
            </p>
            <ol className="flex flex-col gap-4 text-xs md:flex-row md:items-center md:justify-between">
              {steps.map((step, index) => {
                const done =
                  index < currentStepIndex ||
                  (index === currentStepIndex && isFinished);
                const isCurrent = index === currentStepIndex;

                return (
                  <li
                    key={step.id}
                    className="flex flex-1 items-center gap-3 md:gap-2"
                  >
                    <div
                      className={[
                        "flex h-8 w-8 items-center justify-center rounded-full border text-[11px] transition-colors",
                        done || isCurrent
                          ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                          : "border-white/25 bg-white/5 text-white/60",
                      ].join(" ")}
                    >
                      {done || isCurrent ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span
                        className={
                          isCurrent
                            ? "text-xs font-medium text-white"
                            : "text-xs text-white/70"
                        }
                      >
                        {step.label}
                      </span>
                    </div>
                    {index < steps.length - 1 && (
                      <div className="hidden flex-1 md:block">
                        <div className="h-px w-full bg-gradient-to-r from-white/30 via-white/10 to-transparent" />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
