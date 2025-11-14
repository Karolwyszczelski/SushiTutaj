"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Image from "next/image";
import "react-calendar/dist/Calendar.css";
import { RadialIcon } from "./RadialIcon";

const Calendar = dynamic(() => import("react-calendar"), { ssr: false });
const Chart = dynamic(() => import("./Chart"), { ssr: false });

type StatsResponse = {
  ordersPerDay?: Record<string, number>;
  avgFulfillmentTime?: Record<string, number>; // minuty per dzień (YYYY-MM-DD)
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
  const val = v > 100000 ? v / 100 : v; // fallback jeśli backend zwraca grosze
  return PLN.format(Math.round(val));
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // „Live” liczniki jako fallback, gdy /stats nie poda KPIs
  const [live, setLive] = useState({ newOrders: 0, currentOrders: 0, reservations: 0 });

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const router = useRouter();

  useEffect(() => {
    let stop = false;

    const loadStats = async () => {
      try {
        const res = await fetch(`/api/orders/stats?t=${Date.now()}`, { cache: "no-store" });
        const d = (await res.json()) as StatsResponse;
        if (!stop) setStats(d ?? {});
      } catch {
        if (!stop) setStats({});
      } finally {
        if (!stop) setLoading(false);
      }
    };

    // Dociągamy bieżące zamówienia i liczymy statusy lokalnie
    const loadLiveCounts = async () => {
      try {
        const r = await fetch(`/api/orders/current?limit=200&offset=0&t=${Date.now()}`, { cache: "no-store" });
        const j = await r.json();
        const arr: any[] = Array.isArray(j?.orders) ? j.orders : [];
        const newOrders = arr.filter(o => o.status === "new" || o.status === "placed").length;
        const currentOrders = arr.filter(o => o.status === "accepted").length;
        if (!stop) setLive({ newOrders, currentOrders, reservations: 0 });
      } catch {
        /* ignore */
      }
    };

    const tick = async () => {
      await Promise.all([loadStats(), loadLiveCounts()]);
    };

    tick();
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") tick();
    }, 10000);

    return () => { stop = true; clearInterval(iv); };
  }, []);

  const safeEntries = (o?: Record<string, number>) => Object.entries(o ?? {});

  // Dane do wykresów
  const dailyOrdersData = useMemo(
    () => safeEntries(stats?.ordersPerDay).map(([name, value]) => ({ name, value })),
    [stats]
  );

  const fulfillmentTimeData = useMemo(
    () => safeEntries(stats?.avgFulfillmentTime).map(([name, value]) => ({ name, value })),
    [stats]
  );

  const topDishesData = useMemo(
    () =>
      safeEntries(stats?.popularProducts)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([dish, orders]) => ({ dish, orders: orders as number })),
    [stats]
  );

  // Dzisiejsza/miesięczna data
  const todayKey = new Date().toISOString().slice(0, 10);
  const ym = todayKey.slice(0, 7); // YYYY-MM
  const k = stats?.kpis ?? {};

  const todayOrders =
    k.todayOrders ??
    (stats?.ordersPerDay ? stats.ordersPerDay[todayKey] ?? 0 : 0);

  const monthOrders =
    k.monthOrders ??
    (stats?.ordersPerDay
      ? Object.entries(stats.ordersPerDay).reduce((acc, [d, v]) => (d.startsWith(ym) ? acc + (v || 0) : acc), 0)
      : 0);

  const monthAvgFulfillment =
    k.monthAvgFulfillment ??
    (stats?.avgFulfillmentTime
      ? (() => {
          const arr = Object.entries(stats.avgFulfillmentTime).filter(([d]) => d.startsWith(ym));
          if (!arr.length) return undefined;
          const sum = arr.reduce((s, [, v]) => s + (v || 0), 0);
          return Math.round(sum / arr.length);
        })()
      : undefined);

  const todayRevenue = k.todayRevenue;
  const monthRevenue = k.monthRevenue;
  const todayReservations = k.todayReservations;

  // Fallbacki z „live”
  const newOrders = k.newOrders ?? live.newOrders;
  const currentOrders = k.currentOrders ?? live.currentOrders;
  const reservations = k.reservations ?? live.reservations;

  const maxTop = Math.max(1, newOrders, currentOrders, reservations);
  const pct = (x: number) => Math.min(100, Math.round((x / maxTop) * 100));

  const topCards = [
    {
      label: "Nowe Zamówienia",
      value: newOrders,
      radialValue: pct(newOrders),
      color: "bg-lime-100",
      textColor: "text-lime-800",
      description: `Dzisiaj: ${todayOrders}`,
      onClick: () => router.push("/admin/current-orders"),
    },
    {
      label: "Bieżące Zamówienia",
      value: currentOrders,
      radialValue: pct(currentOrders),
      color: "bg-sky-100",
      textColor: "text-sky-800",
      description: `W tym miesiącu: ${monthOrders}`,
      onClick: () => router.push("/admin/current-orders"),
    },
    {
      label: "Historia",
      value: monthOrders,
      radialValue: pct(monthOrders),
      color: "bg-yellow-100",
      textColor: "text-yellow-800",
      description: "Archiwalne zamówienia",
      onClick: () => router.push("/admin/history"),
    },
    {
      label: "Rezerwacje",
      value: reservations,
      radialValue: pct(reservations),
      color: "bg-pink-100",
      textColor: "text-pink-800",
      description: `Dzisiaj: ${todayReservations ?? "—"}`,
      onClick: () => setShowCalendar(true),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-8 text-3xl font-bold text-gray-800">Dashboard</h1>

      {/* GÓRNE KARTY */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {topCards.map((card, idx) => (
          <button
            key={idx}
            onClick={card.onClick}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-white/70 p-4 shadow-sm transition hover:shadow-md ${card.color}`}
          >
            <RadialIcon percentage={card.radialValue} size={40} />
            <div className="text-left">
              <h2 className={`text-lg font-semibold ${card.textColor}`}>{card.label}</h2>
              <p className={`mt-0.5 text-sm ${card.textColor}`}>
                {card.description} • <span className="font-bold">{card.value}</span>
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* WYKRESY */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-white p-5 shadow">
          <h2 className="mb-4 text-xl font-semibold text-gray-700">Statystyki dzienne</h2>

          <div className="mb-4 flex flex-col gap-1.5 text-sm text-gray-600">
            <p>
              Dzisiejsze zamówienia: <span className="font-bold">{todayOrders}</span>
            </p>
            <p>
              Dzisiejszy obrót: <span className="font-bold">{toPln(todayRevenue)}</span>
            </p>
            <p>
              Dzisiejsze rezerwacje:{" "}
              <span className="font-bold">{todayReservations ?? "—"}</span>
            </p>
          </div>

          <div className="rounded border border-gray-100 p-2">
            {loading ? (
              <p className="py-10 text-center text-sm text-gray-400">Ładowanie wykresu…</p>
            ) : dailyOrdersData.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">Brak danych do wyświetlenia</p>
            ) : (
              <Chart type="line" data={dailyOrdersData} />
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-5 shadow">
          <h2 className="mb-4 text-xl font-semibold text-gray-700">Statystyki miesięczne</h2>

          <div className="mb-4 flex flex-col gap-1.5 text-sm text-gray-600">
            <p>
              Zamówienia w tym miesiącu: <span className="font-bold">{monthOrders}</span>
            </p>
            <p>
              Obrót w tym miesiącu: <span className="font-bold">{toPln(monthRevenue)}</span>
            </p>
            <p>
              Średni czas realizacji:{" "}
              <span className="font-bold">
                {monthAvgFulfillment != null ? `${monthAvgFulfillment} min` : "—"}
              </span>
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded border border-gray-100 p-2">
              {loading ? (
                <p className="py-10 text-center text-sm text-gray-400">Ładowanie…</p>
              ) : fulfillmentTimeData.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">Brak danych</p>
              ) : (
                <Chart type="bar" data={fulfillmentTimeData} />
              )}
            </div>

            <div className="flex flex-col items-center justify-center">
              <RadialIcon percentage={Math.min(100, Math.max(0, Math.round((monthOrders / Math.max(1, monthOrders)) * 100)))} size={40} />
              <p className="mt-1 text-center text-xs text-gray-500">
                Wypełnienie miesiąca (relatywne)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* TOP DISHES + USTAWIENIA */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3 rounded-lg border bg-white p-5 shadow">
          <h2 className="text-xl font-semibold text-gray-700">Top Dishes</h2>
          <p className="mb-4 text-sm text-gray-500">Najbardziej zamawiane dania</p>

          {loading ? (
            <p className="text-sm text-gray-400">Ładowanie listy…</p>
          ) : topDishesData.length === 0 ? (
            <p className="text-sm text-gray-400">Brak danych do wyświetlenia</p>
          ) : (
            <ul className="space-y-2 text-sm text-gray-600">
              {topDishesData.map((d, i) => (
                <li key={i} className="flex justify-between border-b border-gray-200 pb-1">
                  <span>{d.dish}</span>
                  <span className="font-medium text-gray-700">{d.orders} zamówień</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative flex flex-col rounded-lg border bg-red-100 p-5 shadow">
          <h2 className="mb-4 text-xl font-semibold text-red-800">Ustawienia</h2>
          <div className="absolute right-3 top-3">
            <Image src="/settings2.png" alt="Settings" width={32} height={32} />
          </div>
          <p className="mb-4 text-sm text-red-700">Panel konfiguracyjny systemu</p>
          <button
            onClick={() => router.push("/admin/settings")}
            className="mt-auto rounded bg-red-200 px-4 py-2 text-sm text-red-800 hover:bg-red-300"
          >
            Przejdź do ustawień
          </button>
        </div>
      </div>

      {/* Kalendarz */}
      {showCalendar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded bg-white p-6 text-black shadow-lg">
            <h3 className="mb-4 text-xl font-bold">Wybierz datę rezerwacji</h3>
            <Calendar onChange={(date) => setSelectedDate(date as Date)} value={selectedDate} />
            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setShowCalendar(false)}
                className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-400"
              >
                Zamknij
              </button>
              <button
                onClick={() => {
                  router.push("/admin/reservations");
                  setShowCalendar(false);
                }}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-500"
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
