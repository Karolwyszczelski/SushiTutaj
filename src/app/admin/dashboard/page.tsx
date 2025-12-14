"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Image from "next/image";
import "react-calendar/dist/Calendar.css";
import { RadialIcon } from "./RadialIcon";

const Calendar = dynamic(() => import("react-calendar"), { ssr: false });
const Chart = dynamic(() => import("./Chart"), { ssr: false });

type StatsResponse = {
  ordersPerDay?: Record<string, number>;
  avgFulfillmentTime?: Record<string, number>;
  popularProducts?: Record<string, number>;
  kpis?: {
    todayOrders?: number;
    todayRevenue?: number;
    todayReservations?: number;
    monthOrders?: number;
    monthRevenue?: number;
    monthAvgFulfillment?: number;
    newOrders?: number;
    currentOrders?: number;
    reservations?: number;
  };
};

const PLN = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 0,
});

function toPln(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return "—";
  const val = v > 100000 ? v / 100 : v;
  return PLN.format(Math.round(val));
}

function digestStats(d: StatsResponse | null | undefined) {
  const ordersPerDay = Object.entries(d?.ordersPerDay ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const avgFulfillmentTime = Object.entries(d?.avgFulfillmentTime ?? {}).sort(
    ([a], [b]) => a.localeCompare(b)
  );
  const popularProducts = Object.entries(d?.popularProducts ?? {}).sort(
    ([a], [b]) => a.localeCompare(b)
  );
  const kpis = d?.kpis ?? {};
  return JSON.stringify({ ordersPerDay, avgFulfillmentTime, popularProducts, kpis });
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [live, setLive] = useState({
    newOrders: 0,
    currentOrders: 0,
    reservations: 0,
  });

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const router = useRouter();

  const STATS_POLL_MS = 60_000;
  const LIVE_POLL_MS = 10_000;

  const statsDigestRef = useRef<string>("");
  const liveDigestRef = useRef<string>("");
  const statsBusyRef = useRef(false);
  const liveBusyRef = useRef(false);

  // STATS: rzadziej + update tylko gdy realna zmiana
  useEffect(() => {
    let stop = false;

    const loadStats = async () => {
      if (stop || document.visibilityState !== "visible") return;
      if (statsBusyRef.current) return;
      statsBusyRef.current = true;

      try {
        const res = await fetch(`/api/orders/stats`, { cache: "no-store" });
        const d = (await res.json()) as StatsResponse;

        const dg = digestStats(d ?? {});
        if (!stop && dg !== statsDigestRef.current) {
          statsDigestRef.current = dg;
          setStats(d ?? {});
          setLastUpdatedAt(new Date());
        }
      } catch (e) {
        console.error("Dashboard: błąd /api/orders/stats", e);
      } finally {
        if (!stop) setLoading(false);
        statsBusyRef.current = false;
      }
    };

    loadStats();
    const iv = setInterval(loadStats, STATS_POLL_MS);

    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, []);

  // LIVE: częściej + update tylko gdy liczby się zmienią
  useEffect(() => {
    let stop = false;

    const loadLiveCounts = async () => {
      if (stop || document.visibilityState !== "visible") return;
      if (liveBusyRef.current) return;
      liveBusyRef.current = true;

      try {
        const r = await fetch(`/api/orders/current?limit=200&offset=0`, {
          cache: "no-store",
        });
        const j = await r.json();
        const arr: any[] = Array.isArray(j?.orders) ? j.orders : [];

        const newOrders = arr.filter(
          (o) => o.status === "new" || o.status === "placed"
        ).length;

        const currentOrders = arr.filter((o) => o.status === "accepted").length;

        const next = { newOrders, currentOrders, reservations: 0 };
        const dg = JSON.stringify(next);

        if (!stop && dg !== liveDigestRef.current) {
          liveDigestRef.current = dg;
          setLive(next);
        }
      } catch (e) {
        console.error("Dashboard: błąd /api/orders/current", e);
      } finally {
        liveBusyRef.current = false;
      }
    };

    loadLiveCounts();
    const iv = setInterval(loadLiveCounts, LIVE_POLL_MS);

    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, []);

  const safeEntries = (o?: Record<string, number>) =>
    Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b));

  const dailyOrdersData = useMemo(
    () =>
      safeEntries(stats?.ordersPerDay).map(([name, value]) => ({
        name,
        value,
      })),
    [stats]
  );

  const fulfillmentTimeData = useMemo(
    () =>
      safeEntries(stats?.avgFulfillmentTime).map(([name, value]) => ({
        name,
        value,
      })),
    [stats]
  );

  const topDishesData = useMemo(
    () =>
      safeEntries(stats?.popularProducts)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([dish, orders]) => ({ dish, orders: orders as number })),
    [stats]
  );

  const todayKey = new Date().toISOString().slice(0, 10);
  const ym = todayKey.slice(0, 7);
  const k = stats?.kpis ?? {};

  const todayOrders =
    k.todayOrders ??
    (stats?.ordersPerDay ? stats.ordersPerDay[todayKey] ?? 0 : 0);

  const monthOrders =
    k.monthOrders ??
    (stats?.ordersPerDay
      ? Object.entries(stats.ordersPerDay).reduce(
          (acc, [d, v]) => (d.startsWith(ym) ? acc + (v || 0) : acc),
          0
        )
      : 0);

  const monthAvgFulfillment =
    k.monthAvgFulfillment ??
    (stats?.avgFulfillmentTime
      ? (() => {
          const arr = Object.entries(stats.avgFulfillmentTime).filter(([d]) =>
            d.startsWith(ym)
          );
          if (!arr.length) return undefined;
          const sum = arr.reduce((s, [, v]) => s + (v || 0), 0);
          return Math.round(sum / arr.length);
        })()
      : undefined);

  const todayAvgFulfillment =
    (stats?.avgFulfillmentTime ? stats.avgFulfillmentTime[todayKey] : undefined) ??
    undefined;

  const last7AvgFulfillment = useMemo(() => {
    const entries = Object.entries(stats?.avgFulfillmentTime ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7);
    if (!entries.length) return undefined;
    const sum = entries.reduce((s, [, v]) => s + (Number(v) || 0), 0);
    return Math.round(sum / entries.length);
  }, [stats]);

  const todayRevenue = k.todayRevenue;
  const monthRevenue = k.monthRevenue;
  const todayReservations = k.todayReservations;

  const newOrders = k.newOrders ?? live.newOrders;
  const currentOrders = k.currentOrders ?? live.currentOrders;
  const reservations = k.reservations ?? live.reservations;

  const maxTop = Math.max(1, newOrders, currentOrders, reservations);
  const pct = (x: number) => Math.min(100, Math.round((x / maxTop) * 100));

  const topCards = [
    {
      label: "Nowe zamówienia",
      value: newOrders,
      radialValue: pct(newOrders),
      badge: "Na ekranie „Odbierz zamówienie”",
      accent: "from-emerald-500/40 via-emerald-500/10 to-slate-900",
      onClick: () => router.push("/admin/pickup-order"),
    },
    {
      label: "W realizacji",
      value: currentOrders,
      radialValue: pct(currentOrders),
      badge: "Zamówienia zaakceptowane",
      accent: "from-sky-500/40 via-sky-500/10 to-slate-900",
      onClick: () => router.push("/admin/pickup-order"),
    },
    {
      label: "Zamówienia w miesiącu",
      value: monthOrders,
      radialValue: pct(monthOrders),
      badge: "Suma od początku miesiąca",
      accent: "from-yellow-500/40 via-yellow-500/10 to-slate-900",
      onClick: () => router.push("/admin/history"),
    },
    {
      label: "Rezerwacje",
      value: reservations,
      radialValue: pct(reservations),
      badge: `Dziś: ${todayReservations ?? "—"}`,
      accent: "from-rose-500/40 via-rose-500/10 to-slate-900",
      onClick: () => setShowCalendar(true),
    },
  ];

  const maxDishOrders = Math.max(1, ...topDishesData.map((x) => x.orders || 0));

  const monthProgressPct = useMemo(() => {
    const now = new Date();
    const day = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Math.round((day / daysInMonth) * 100);
  }, []);

  return (
    <div className="min-h-screen bg-[#050509] px-4 py-6 text-slate-100 sm:px-6 lg:px-10">
      {/* Nagłówek */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50 md:text-3xl">
            Panel statystyk
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Podsumowanie zamówień i czasu realizacji dla Twojej restauracji.
          </p>
          {lastUpdatedAt && (
            <p className="mt-1 text-xs text-slate-500">
              Ostatnia aktualizacja:{" "}
              <span className="text-slate-300">
                {lastUpdatedAt.toLocaleTimeString("pl-PL")}
              </span>
            </p>
          )}
        </div>
        <div className="rounded-full border border-red-500/40 bg-red-500/10 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-red-300">
          Sushi Tutaj · Dashboard
        </div>
      </header>

      {/* Górne karty KPI */}
      <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {topCards.map((card, idx) => (
          <button
            key={idx}
            type="button"
            onClick={card.onClick}
            className={`group flex items-center gap-4 rounded-2xl border border-slate-700/70 bg-gradient-to-br ${card.accent} p-4 text-left shadow-xl shadow-black/40 transition hover:-translate-y-0.5 hover:border-red-500/70 hover:shadow-2xl`}
          >
            <div className="shrink-0 rounded-full bg-slate-950/80 p-1.5">
              <RadialIcon percentage={card.radialValue} size={46} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                {card.badge}
              </p>
              <p className="mt-1 truncate text-sm font-medium text-slate-100">
                {card.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-50">
                {card.value}
              </p>
            </div>
            <span className="hidden text-xs text-red-300/80 group-hover:inline">
              Pokaż →
            </span>
          </button>
        ))}
      </section>

      {/* Wykresy: zamówienia dzienne + czas realizacji */}
      <section className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Zamówienia dzienne */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 shadow-xl shadow-black/40">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                Zamówienia dzienne
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Ostatnie 30 dni · dzienny wolumen zamówień
              </p>
            </div>
            <div className="rounded-full bg-slate-900 px-3 py-1 text-xs text-slate-300">
              Dziś:{" "}
              <span className="font-semibold text-slate-50">{todayOrders}</span>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-3 text-xs text-slate-300">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                Dzisiejsze zamówienia
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-50">
                {todayOrders}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                Dzisiejszy obrót
              </p>
              <p className="mt-1 text-sm font-semibold text-emerald-300">
                {toPln(todayRevenue)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                Rezerwacje
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-50">
                {todayReservations ?? "—"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
            {loading ? (
              <p className="py-10 text-center text-xs text-slate-500">
                Ładowanie wykresu…
              </p>
            ) : dailyOrdersData.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500">
                Brak danych do wyświetlenia
              </p>
            ) : (
              <Chart type="line" data={dailyOrdersData} />
            )}
          </div>
        </div>

        {/* Czas realizacji */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 shadow-xl shadow-black/40">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                Czas realizacji
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Średni czas realizacji zamówień (minuty / dzień)
              </p>
            </div>
            <div className="rounded-full bg-slate-900 px-3 py-1 text-xs text-slate-300">
              Śr. w miesiącu:{" "}
              <span className="font-semibold text-emerald-300">
                {monthAvgFulfillment != null ? `${monthAvgFulfillment} min` : "—"}
              </span>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-3 text-xs text-slate-300">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                Śr. czas dziś
              </p>
              <p className="mt-1 text-xl font-semibold text-emerald-300">
                {todayAvgFulfillment != null
                  ? `${Math.round(todayAvgFulfillment)} min`
                  : "—"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                Śr. czas 7 dni
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-50">
                {last7AvgFulfillment != null ? `${last7AvgFulfillment} min` : "—"}
              </p>
            </div>

            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <RadialIcon percentage={monthProgressPct} size={40} />
              <p className="mt-1 text-[10px] text-slate-500">Postęp miesiąca</p>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-3 text-xs text-slate-300">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                Zamówienia w miesiącu
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-50">
                {monthOrders}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                Obrót w miesiącu
              </p>
              <p className="mt-1 text-sm font-semibold text-emerald-300">
                {toPln(monthRevenue)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                Śr. czas (miesiąc)
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-50">
                {monthAvgFulfillment != null ? `${monthAvgFulfillment} min` : "—"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
            {loading ? (
              <p className="py-10 text-center text-xs text-slate-500">
                Ładowanie wykresu…
              </p>
            ) : fulfillmentTimeData.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500">
                Brak danych do wyświetlenia
              </p>
            ) : (
              <Chart type="bar" data={fulfillmentTimeData} />
            )}
          </div>
        </div>
      </section>

      {/* Top dania + Ustawienia */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Top dishes */}
        <div className="lg:col-span-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-xl shadow-black/40">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                Najczęściej zamawiane dania
              </h2>
              <p className="mt-1 text-xs text-slate-400">TOP pozycje</p>
            </div>
          </div>

          {loading ? (
            <p className="text-xs text-slate-500">Ładowanie listy…</p>
          ) : topDishesData.length === 0 ? (
            <p className="text-xs text-slate-500">Brak danych do wyświetlenia.</p>
          ) : (
            <ul className="divide-y divide-slate-800 text-sm text-slate-200">
              {topDishesData.map((d, i) => {
                const share = Math.round(((d.orders || 0) / maxDishOrders) * 100);
                return (
                  <li key={i} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] text-slate-300">
                          {i + 1}
                        </span>
                        <span className="truncate">{d.dish}</span>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-slate-50">
                        {d.orders} zam.
                      </span>
                    </div>

                    <div className="mt-2 h-2 w-full rounded-full bg-slate-900 overflow-hidden">
                      <div
                        className="h-full bg-red-500/70"
                        style={{ width: `${share}%` }}
                        aria-label={`${share}%`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Ustawienia */}
        <div className="relative flex flex-col overflow-hidden rounded-2xl border border-red-600/60 bg-gradient-to-br from-red-600 via-red-500 to-rose-600 p-5 shadow-2xl shadow-red-900/40">
          <div className="absolute -right-6 -top-10 opacity-30">
            <Image src="/settings2.png" alt="Ustawienia" width={120} height={120} />
          </div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-rose-50">
            Ustawienia systemu
          </h2>
          <p className="mb-4 text-sm text-rose-50/90">
            Skonfiguruj godziny otwarcia, strefy dostaw, program lojalnościowy oraz
            powiadomienia.
          </p>
          <button
            type="button"
            onClick={() => router.push("/admin/settings")}
            className="mt-auto inline-flex items-center justify-center rounded-full bg-slate-950/90 px-4 py-2 text-sm font-semibold text-rose-50 shadow-lg shadow-black/50 transition hover:bg-slate-900"
          >
            Przejdź do ustawień
          </button>
        </div>
      </section>

      {/* Kalendarz rezerwacji */}
      {showCalendar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 p-6 text-slate-100 shadow-2xl shadow-black/60">
            <h3 className="mb-4 text-lg font-semibold text-slate-50">
              Wybierz datę rezerwacji
            </h3>
            <Calendar
              onChange={(date) => setSelectedDate(date as Date)}
              value={selectedDate}
            />
            <div className="mt-4 flex justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowCalendar(false)}
                className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Zamknij
              </button>
              <button
                type="button"
                onClick={() => {
                  router.push("/admin/reservations");
                  setShowCalendar(false);
                }}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-red-900/40 hover:bg-red-500"
              >
                Przejdź do rezerwacji
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
