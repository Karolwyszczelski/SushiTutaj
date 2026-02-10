// src/app/admin/AdminPanel/page.tsx
"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import NextDynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";
import {
  Settings,
  TrendingUp,
  PieChart,
  Clock,
  RefreshCw,
  Download,
} from "lucide-react";
import "react-calendar/dist/Calendar.css";
import { RadialIcon } from "../dashboard/RadialIcon";

const Calendar = NextDynamic(() => import("react-calendar"), { ssr: false });
const Chart = NextDynamic(() => import("../dashboard/Chart"), { ssr: false });

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

const CITIES = [
  { slug: "ciechanow", label: "Ciechanów" },
  { slug: "przasnysz", label: "Przasnysz" },
  { slug: "szczytno", label: "Szczytno" },
] as const;
type CitySlug = (typeof CITIES)[number]["slug"];
type CityPick = CitySlug | "all";

const CITY_OPTIONS: Array<{ slug: CityPick; label: string }> = [
  ...CITIES,
  { slug: "all", label: "Wszystkie" },
];

const PLN = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 0,
});

const toPln = (v?: number | null) => {
  if (v == null || Number.isNaN(v)) return "—";
  const val = v > 100000 ? v / 100 : v;
  return PLN.format(Math.round(val));
};

const getCookie = (k: string): string | null => {
  if (typeof document === "undefined") return null;
  const row =
    document.cookie
      .split("; ")
      .find(
        (r) =>
          r.startsWith(`${k}=`) || r.startsWith(`${encodeURIComponent(k)}=`)
      ) || null;
  if (!row) return null;
  const value = row.substring(row.indexOf("=") + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

// agregacja wielu odpowiedzi stats dla trybu "Wszystkie"
function aggregateStats(list: StatsResponse[]): StatsResponse {
  const out: StatsResponse = {
    ordersPerDay: {},
    avgFulfillmentTime: {},
    popularProducts: {},
    kpis: {
      todayOrders: 0,
      todayRevenue: 0,
      todayReservations: 0,
      monthOrders: 0,
      monthRevenue: 0,
      monthAvgFulfillment: undefined as any,
      newOrders: 0,
      currentOrders: 0,
      reservations: 0,
    },
  };

  for (const s of list) {
    for (const [d, v] of Object.entries(s.ordersPerDay ?? {})) {
      out.ordersPerDay![d] = (out.ordersPerDay![d] ?? 0) + (v || 0);
    }
    for (const [d, v] of Object.entries(s.avgFulfillmentTime ?? {})) {
      if (!(d in out.avgFulfillmentTime!)) out.avgFulfillmentTime![d] = 0;
      out.avgFulfillmentTime![d] =
        (out.avgFulfillmentTime![d] as number) + (v || 0) + 1e-9;
    }
    for (const [n, c] of Object.entries(s.popularProducts ?? {})) {
      out.popularProducts![n] = (out.popularProducts![n] ?? 0) + (c || 0);
    }

    const k = s.kpis ?? {};
    out.kpis!.todayOrders =
      (out.kpis!.todayOrders ?? 0) + (k.todayOrders || 0);
    out.kpis!.todayRevenue =
      (out.kpis!.todayRevenue ?? 0) + (k.todayRevenue || 0);
    out.kpis!.todayReservations =
      (out.kpis!.todayReservations ?? 0) + (k.todayReservations || 0);
    out.kpis!.monthOrders =
      (out.kpis!.monthOrders ?? 0) + (k.monthOrders || 0);
    out.kpis!.monthRevenue =
      (out.kpis!.monthRevenue ?? 0) + (k.monthRevenue || 0);
    out.kpis!.newOrders = (out.kpis!.newOrders ?? 0) + (k.newOrders || 0);
    out.kpis!.currentOrders =
      (out.kpis!.currentOrders ?? 0) + (k.currentOrders || 0);
    out.kpis!.reservations =
      (out.kpis!.reservations ?? 0) + (k.reservations || 0);
  }

  const sources = Math.max(1, list.length);
  for (const [d, sumPlusEps] of Object.entries(out.avgFulfillmentTime!)) {
    out.avgFulfillmentTime![d] = Math.round(
      (Number(sumPlusEps) - 1e-9) / sources
    );
  }
  const monthAvgs = list
    .map((s) => s.kpis?.monthAvgFulfillment)
    .filter((x): x is number => Number.isFinite(x as number));
  out.kpis!.monthAvgFulfillment = monthAvgs.length
    ? Math.round(
        monthAvgs.reduce((a, b) => a + b, 0) / monthAvgs.length
      )
    : undefined;

  return out;
}

// ROUTE USTAWIAMY JAKO DYNAMICZNĄ (zero prób SSG)
export const dynamic = "force-dynamic";

function AdminPanel() {
  const router = useRouter();
  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [city, setCity] = useState<CityPick>("ciechanow");
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [live, setLive] = useState({
    newOrders: 0,
    currentOrders: 0,
    reservations: 0,
  });
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [booted, setBooted] = useState(false);

  // domyślne miasto po zalogowaniu z cookie ustawianym przez /api/restaurants/ensure-cookie
  useEffect(() => {
    const init = async () => {
      try {
        const r = await fetch("/api/restaurants/ensure-cookie", {
          cache: "no-store",
        });
        const j = await r.json().catch(() => ({}));
        const slug = j?.restaurant_slug as string | undefined;
        if (slug && CITIES.some((c) => c.slug === slug))
          setCity(slug as CityPick);
      } catch {
        const slug = getCookie("restaurant_slug");
        if (slug && CITIES.some((c) => c.slug === slug))
          setCity(slug as CityPick);
      } finally {
        setBooted(true);
      }
    };
    void init();
  }, []);

  // pobieranie statystyk i live count
  useEffect(() => {
    if (!booted) return;
    let stop = false;

    const fetchCityStats = async (slug: CitySlug): Promise<StatsResponse> => {
      const res = await fetch(
        `/api/orders/stats?restaurant=${slug}&days=${days}&t=${Date.now()}`,
        {
          cache: "no-store",
        }
      );
      return (await res.json()) as StatsResponse;
    };

    const fetchCurrent = async (slug: CitySlug) => {
      const r = await fetch(
        `/api/orders/current?restaurant=${slug}&limit=200&offset=0&t=${Date.now()}`,
        { cache: "no-store" }
      );
      const j = await r.json();
      const arr: any[] = Array.isArray(j?.orders) ? j.orders : [];
      const newOrders = arr.filter(
        (o) =>
          o.status === "new" ||
          o.status === "placed" ||
          o.status === "pending"
      ).length;
      const currentOrders = arr.filter(
        (o) => o.status === "accepted"
      ).length;
      return { newOrders, currentOrders, reservations: 0 };
    };

    const load = async () => {
      try {
        setLoading(true);
        if (city === "all") {
          const slugs = CITIES.map((c) => c.slug);
          const [statsList, liveList] = await Promise.all([
            Promise.all(slugs.map(fetchCityStats)),
            Promise.all(slugs.map(fetchCurrent)),
          ]);
          if (stop) return;
          setStats(aggregateStats(statsList));
          setLive(
            liveList.reduce(
              (acc, x) => ({
                newOrders: acc.newOrders + x.newOrders,
                currentOrders: acc.currentOrders + x.currentOrders,
                reservations: acc.reservations + x.reservations,
              }),
              { newOrders: 0, currentOrders: 0, reservations: 0 }
            )
          );
        } else {
          const [s, l] = await Promise.all([
            fetchCityStats(city),
            fetchCurrent(city),
          ]);
          if (stop) return;
          setStats(s ?? {});
          setLive(l);
        }
      } catch {
        if (!stop) {
          setStats({});
          setLive({ newOrders: 0, currentOrders: 0, reservations: 0 });
        }
      } finally {
        if (!stop) setLoading(false);
      }
    };

    void load();

    const iv = setInterval(() => {
      if (autoRefresh && document.visibilityState === "visible") void load();
    }, 10000);

    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [city, days, autoRefresh, booted]);

  // realtime kanał dla wybranego miasta
  useEffect(() => {
    if (!booted || city === "all") return;
    
    // Potrzebujemy restaurant_id dla filtra realtime
    let cancelled = false;
    let chan: ReturnType<typeof supabase.channel> | null = null;
    
    (async () => {
      // Pobierz restaurant_id dla tego miasta/slug
      let restaurantId: string | null = null;
      try {
        const res = await fetch(`/api/restaurants/${city}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          restaurantId = data?.id || null;
        }
      } catch {}
      
      if (cancelled) return;
      
      // KRYTYCZNE: Użyj filtra restaurant_id aby nie odbierać eventów z innych restauracji
      const filter = restaurantId ? `restaurant_id=eq.${restaurantId}` : undefined;
      
      chan = supabase
        .channel(`orders-realtime-dashboard-${city}`)
        .on(
          "postgres_changes",
          { 
            event: "*", 
            schema: "public", 
            table: "orders",
            ...(filter ? { filter } : {}),
          },
          (payload: any) => {
            // Dodatkowa weryfikacja - ignoruj eventy z innych restauracji
            if (restaurantId) {
              const payloadRid = payload?.new?.restaurant_id || payload?.old?.restaurant_id;
              if (payloadRid && payloadRid !== restaurantId) return;
            }
            
            if (document.visibilityState === "visible") {
              (async () => {
                try {
                  const r = await fetch(
                    `/api/orders/current?restaurant=${city}&limit=200&offset=0&t=${Date.now()}`,
                    { cache: "no-store" }
                  );
                  const j = await r.json();
                  const arr: any[] = Array.isArray(j?.orders) ? j.orders : [];
                  const newOrders = arr.filter(
                    (o) =>
                      o.status === "new" ||
                      o.status === "placed" ||
                      o.status === "pending"
                  ).length;
                  const currentOrders = arr.filter(
                    (o) => o.status === "accepted"
                  ).length;
                  setLive({
                    newOrders,
                    currentOrders,
                    reservations: live.reservations,
                  });
                } catch {}
              })();
            }
          }
        )
        .subscribe();
    })();
    
    return () => {
      cancelled = true;
      if (chan) void supabase.removeChannel(chan);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, booted]);

  const safeEntries = (o?: Record<string, number>) =>
    Object.entries(o ?? {});
  const dailyOrdersData = useMemo(
    () =>
      safeEntries(stats?.ordersPerDay)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, value]) => ({ name, value })),
    [stats]
  );
  const fulfillmentTimeData = useMemo(
    () =>
      safeEntries(stats?.avgFulfillmentTime)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, value]) => ({ name, value })),
    [stats]
  );
  const topDishesData = useMemo(
    () =>
      safeEntries(stats?.popularProducts)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 20)
        .map(([dish, orders]) => ({ dish, orders: orders as number })),
    [stats]
  );

  const k = stats?.kpis ?? {};
  const todayOrders = k.todayOrders ?? 0;
  const monthOrders = k.monthOrders ?? 0;
  const todayRevenue = k.todayRevenue ?? 0;
  const monthRevenue = k.monthRevenue ?? 0;
  const todayReservations = k.todayReservations ?? 0;
  const newOrders = k.newOrders ?? live.newOrders;
  const currentOrders = k.currentOrders ?? live.currentOrders;
  const reservations = k.reservations ?? live.reservations;
  const monthAvgFulfillment = k.monthAvgFulfillment;

  const aovToday = todayOrders > 0 ? (todayRevenue || 0) / todayOrders : null;
  const aovMonth = monthOrders > 0 ? (monthRevenue || 0) / monthOrders : null;

  const maxTop = Math.max(1, newOrders, currentOrders, reservations);
  const pct = (x: number) => Math.min(100, Math.round((x / maxTop) * 100));

  const goOrders = () => {
    const base = "/admin/pickup-order";
    const q = city !== "all" ? `?restaurant=${city}` : "";
    const href = `${base}${q}` as Route;
    router.push(href);
  };

  const exportTopCSV = () => {
    const rows = [
      ["Pozycja", "Zamówienia"],
      ...topDishesData.map((r) => [r.dish, String(r.orders)]),
    ];
    const csv = rows
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `top_dania_${city}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Panel administracyjny
          </h1>
          <p className="text-sm text-slate-600">
            Podgląd bieżących wyników i trendów.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* City selector */}
          <div className="flex overflow-hidden rounded-xl border bg-white shadow-sm">
            {CITY_OPTIONS.map((c) => (
              <button
                key={c.slug}
                onClick={() => setCity(c.slug)}
                className={`px-3 py-1.5 text-sm ${
                  city === c.slug
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Days selector */}
          <div className="ml-1 flex overflow-hidden rounded-xl border bg-white shadow-sm">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d as 7 | 30 | 90)}
                className={`px-3 py-1.5 text-sm ${
                  days === d
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {d} dni
              </button>
            ))}
          </div>

          {/* Auto refresh */}
          <button
            onClick={() => setAutoRefresh((x) => !x)}
            className={`flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm shadow-sm ${
              autoRefresh ? "bg-emerald-600 text-white" : "bg-white text-slate-700"
            }`}
            title="Auto-odświeżanie co 10s"
          >
            <RefreshCw size={16} />
            {autoRefresh ? "Auto" : "Ręcznie"}
          </button>

          {/* Ustawienia */}
          <button
            onClick={() => router.push("/admin/settings")}
            className="flex items-center gap-1 rounded-xl border bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-100"
          >
            <Settings size={16} />
            Ustawienia
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">Nowe</span>
            <RadialIcon percentage={pct(newOrders)} size={38} />
          </div>
          <div className="mt-1 text-3xl font-bold text-slate-900">
            {newOrders}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Zgłoszone dziś: {todayOrders}
          </div>
          <button
            onClick={goOrders}
            className="mt-3 text-sm font-medium text-sky-700 underline"
          >
            Przejdź do zamówień
          </button>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">
              W realizacji
            </span>
            <RadialIcon percentage={pct(currentOrders)} size={38} />
          </div>
          <div className="mt-1 text-3xl font-bold text-slate-900">
            {currentOrders}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Śr. czas mies.: {monthAvgFulfillment ?? "—"} min
          </div>
          <button
            onClick={goOrders}
            className="mt-3 text-sm font-medium text-sky-700 underline"
          >
            Zarządzaj
          </button>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-sm font-medium text-slate-600">
              <TrendingUp size={16} /> Obrót
            </span>
          </div>
          <div className="mt-1 text-3xl font-bold text-slate-900">
            {toPln(monthRevenue)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Dziś: {toPln(todayRevenue)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-sm font-medium text-slate-600">
              <PieChart size={16} /> AOV
            </span>
          </div>
          <div className="mt-1 text-3xl font-bold text-slate-900">
            {aovMonth != null ? toPln(aovMonth) : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Dziś: {aovToday != null ? toPln(aovToday) : "—"}
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">
              Zamówienia dzienne
            </h2>
            <span className="text-xs text-slate-500">
              {days} dni •{" "}
              {city === "all"
                ? "Wszystkie"
                : CITY_OPTIONS.find((c) => c.slug === city)?.label}
            </span>
          </div>
          <div className="rounded border border-slate-100 p-2">
            {loading ? (
              <p className="py-10 text-center text-sm text-slate-400">
                Ładowanie…
              </p>
            ) : dailyOrdersData.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">
                Brak danych
              </p>
            ) : (
              <Chart type="line" data={dailyOrdersData} />
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <Clock size={18} /> Czas realizacji
            </h2>
            <span className="text-xs text-slate-500">średnia dzienna</span>
          </div>
          <div className="rounded border border-slate-100 p-2">
            {loading ? (
              <p className="py-10 text-center text-sm text-slate-400">
                Ładowanie…
              </p>
            ) : fulfillmentTimeData.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">
                Brak danych
              </p>
            ) : (
              <Chart type="bar" data={fulfillmentTimeData} />
            )}
          </div>
        </div>
      </div>

      {/* Top dishes + panel boczny */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                Najczęściej zamawiane
              </h2>
              <p className="text-xs text-slate-500">Top 20 pozycji</p>
            </div>
            <button
              onClick={exportTopCSV}
              className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-100"
            >
              <Download size={16} />
              CSV
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400">Ładowanie…</p>
          ) : topDishesData.length === 0 ? (
            <p className="text-sm text-slate-400">Brak danych</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {topDishesData.map((d, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between py-2"
                >
                  <span className="truncate pr-4">
                    {i + 1}. {d.dish}
                  </span>
                  <span className="font-medium text-slate-800">
                    {d.orders} zam.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-slate-800">
            Szybkie akcje
          </h2>
          <button
            onClick={goOrders}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Otwórz listę zamówień
          </button>
          <button
            onClick={() => setShowCalendar(true)}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Kalendarz rezerwacji
          </button>
          <button
            onClick={() => router.push("/admin/settings")}
            className="mt-auto inline-flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 ring-1 ring-rose-200 hover:bg-rose-100"
          >
            <Settings size={16} />
            Ustawienia
          </button>
        </div>
      </div>

      {/* Modal kalendarza */}
      {showCalendar && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-3 text-lg font-bold text-slate-900">
              Wybierz datę rezerwacji
            </h3>
            <Calendar
              onChange={(date) => setSelectedDate(date as Date)}
              value={selectedDate}
            />
            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setShowCalendar(false)}
                className="rounded-lg bg-rose-500 px-4 py-2 text-white hover:bg-rose-400"
              >
                Zamknij
              </button>
              <button
                onClick={() => {
                  router.push("/admin/reservations");
                  setShowCalendar(false);
                }}
                className="rounded-lg bg-sky-600 px-4 py-2 text-white hover:bg-sky-500"
              >
                Przejdź do rezerwacji
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loader overlay */}
      {loading && (
        <div className="pointer-events-none fixed bottom-4 right-4 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs text-slate-700 shadow">
          <RefreshCw size={14} className="animate-spin" />
          Aktualizuję…
        </div>
      )}
    </div>
  );
}

// WRAPPER Z SUSPENSE – tu jest to, czego chce Next
export default function AdminPanelPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
          Ładowanie panelu…
        </div>
      }
    >
      <AdminPanel />
    </Suspense>
  );
}
