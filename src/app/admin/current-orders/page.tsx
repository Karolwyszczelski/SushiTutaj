// src/app/admin/current-orders/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { RefreshCw, ChevronDown } from "lucide-react";

type Order = {
  id: string;
  restaurant_id: string;
  created_at: string;
  status: string; // new | placed | accepted | cancelled | completed
  total_price: number | string | null;
  customer_name?: string | null;
  phone?: string | null;
  selected_option?: "takeaway" | "delivery" | null;
  deliveryTime?: string | null;          // legacy
  client_delivery_time?: string | null;  // alternative
};

type EnsureCookieResponse = {
  restaurant_id?: string;
  restaurant_slug?: string;
  error?: string;
};

const PLN = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

const statusLabel = (s: string) => {
  switch ((s || "").toLowerCase()) {
    case "new":
    case "placed":
      return "Nowe";
    case "accepted":
      return "W trakcie";
    case "cancelled":
      return "Anulowane";
    case "completed":
      return "Zrealizowane";
    default:
      return s || "—";
  }
};

const statusColor = (s: string) => {
  switch ((s || "").toLowerCase()) {
    case "new":
    case "placed":
      return "bg-amber-100 text-amber-800";
    case "accepted":
      return "bg-sky-100 text-sky-800";
    case "cancelled":
      return "bg-rose-100 text-rose-800";
    case "completed":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-slate-100 text-slate-800";
  }
};

const optLabel = (o?: string | null) =>
  o === "takeaway" ? "Na wynos" : o === "delivery" ? "Dostawa" : "—";

export default function CurrentOrdersPage() {
  const supabase = getSupabaseBrowser();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retried401 = useRef(false);
  const [filter, setFilter] = useState<"all" | "new" | "accepted">("all");
  const [search, setSearch] = useState("");

  // 1) Upewnij cookie i pobierz slug/id
  useEffect(() => {
    let stop = false;
    const init = async () => {
      try {
        const r = await fetch("/api/restaurants/ensure-cookie", {
          cache: "no-store",
          credentials: "include",
        });
        const j: EnsureCookieResponse = await r.json().catch(() => ({}));
        if (!stop) {
          if (!r.ok) throw new Error(j?.error || `ensure-cookie ${r.status}`);
          setRestaurantId(j.restaurant_id || null);
          setRestaurantSlug(j.restaurant_slug || null);
        }
      } catch (e: any) {
        if (!stop) {
          setRestaurantId(null);
          setRestaurantSlug(null);
          setError(e?.message || "Błąd inicjalizacji");
        }
      }
    };
    init();
    return () => {
      stop = true;
    };
  }, []);

  // 2) Ładowanie bieżących zamówień dla lokalu
  useEffect(() => {
    if (!restaurantSlug) return;
    let stop = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // API filtruje po slugu z query oraz po cookie
        const url = `/api/orders/current?restaurant=${restaurantSlug}&scope=open&limit=200&offset=0&t=${Date.now()}`;
        let res = await fetch(url, { cache: "no-store", credentials: "include" });

        // próba ponowna po odświeżeniu sesji przy 401
        if (res.status === 401 && !retried401.current) {
          retried401.current = true;
          await supabase.auth.refreshSession();
          res = await fetch(url, { cache: "no-store", credentials: "include" });
        }

        if (!res.ok) throw new Error(`orders ${res.status}`);

        const j = await res.json();
        if (stop) return;

        const arr: Order[] = Array.isArray(j?.orders) ? j.orders : [];
        // sort – najnowsze na górze
        arr.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        setOrders(arr);
      } catch (e: any) {
        if (!stop) {
          setOrders([]);
          setError(e?.message || "Błąd pobierania");
        }
      } finally {
        if (!stop) setLoading(false);
      }
    }

    void load();

    // auto-refresh co 10s
    const iv = setInterval(() => {
      if (autoRefresh && document.visibilityState === "visible") void load();
    }, 10000);

    // realtime po restaurant_id
    let chan: ReturnType<typeof supabase.channel> | null = null;
    if (restaurantId) {
      chan = supabase
        .channel(`orders-current-${restaurantId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
          () => {
            if (document.visibilityState === "visible") void load();
          }
        )
        .subscribe();
    }

    return () => {
      stop = true;
      clearInterval(iv);
      if (chan) void supabase.removeChannel(chan);
    };
  }, [restaurantSlug, restaurantId, autoRefresh, supabase]);

  // 3) Filtrowanie i wyszukiwanie
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((o) => {
      const st = (o.status || "").toLowerCase();
      if (filter === "new" && !(st === "new" || st === "placed")) return false;
      if (filter === "accepted" && st !== "accepted") return false;
      if (!term) return true;
      return (
        String(o.id).toLowerCase().includes(term) ||
        String(o.customer_name || "").toLowerCase().includes(term) ||
        String(o.phone || "").toLowerCase().includes(term)
      );
    });
  }, [orders, filter, search]);

  // 4) KPI do nagłówka
  const kpi = useMemo(() => {
    const newCnt = orders.filter((o) => ["new", "placed"].includes((o.status || "").toLowerCase())).length;
    const curCnt = orders.filter((o) => (o.status || "").toLowerCase() === "accepted").length;
    return { newCnt, curCnt };
  }, [orders]);

  const safeTime = (o: Order) => {
    const t = o.deliveryTime || o.client_delivery_time || null;
    return t ? new Date(t).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : "—";
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header jak w AdminPanel */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Bieżące zamówienia</h1>
          <p className="text-sm text-slate-600">
            {restaurantSlug ? `Lokal: ${restaurantSlug}` : "Brak przypisanego lokalu."}
          </p>
          {error && <p className="mt-1 text-sm font-medium text-rose-700">Błąd: {error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border bg-white shadow-sm">
            {[
              { key: "all", label: "Wszystkie" },
              { key: "new", label: "Nowe" },
              { key: "accepted", label: "W trakcie" },
            ].map((b) => (
              <button
                key={b.key}
                onClick={() => setFilter(b.key as any)}
                className={`px-3 py-1.5 text-sm ${
                  filter === b.key ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Szukaj: #id, klient, telefon"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[230px] rounded-xl border bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-200"
            />
            <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-0" />
          </div>

          <button
            onClick={() => setAutoRefresh((x) => !x)}
            className={`flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm shadow-sm ${
              autoRefresh ? "bg-emerald-600 text-white" : "bg-white text-slate-700"
            }`}
            title="Auto-odświeżanie co 10s"
          >
            <RefreshCw size={16} className={autoRefresh ? "animate-spin-slow" : ""} />
            {autoRefresh ? "Auto" : "Ręcznie"}
          </button>
          <button
            onClick={() => setOrders((o) => [...o])}
            className="rounded-xl border bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-100"
            title="Miękkie odświeżenie"
          >
            Odśwież
          </button>
        </div>
      </div>

      {/* KPI cards jak w AdminPanel */}
      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Nowe</div>
          <div className="mt-1 text-3xl font-bold text-slate-900">{kpi.newCnt}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">W trakcie</div>
          <div className="mt-1 text-3xl font-bold text-slate-900">{kpi.curCnt}</div>
        </div>
      </div>

      {/* Zawartość: tabela desktop + karty mobile */}
      {loading ? (
        <p className="py-10 text-center text-sm text-slate-400">Ładowanie…</p>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">Brak zamówień w wybranym filtrze.</p>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden overflow-auto rounded-2xl border bg-white shadow-sm md:block">
            <table className="min-w-full table-auto">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">#</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Data</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Klient</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Kwota</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Opcja</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Czas odbioru</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o, i) => (
                  <tr key={o.id} className="border-t">
                    <td className="px-4 py-3 text-sm text-slate-800">{i + 1}</td>
                    <td className="px-4 py-3 text-sm text-slate-800">
                      {new Date(o.created_at).toLocaleString("pl-PL")}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-800">{o.customer_name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-800">
                      {o.total_price != null ? PLN.format(Number(o.total_price)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-800">{optLabel(o.selected_option)}</td>
                    <td className="px-4 py-3 text-sm text-slate-800">{safeTime(o)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusColor(o.status)}`}>
                        {statusLabel(o.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-3 md:hidden">
            {filtered.map((o, i) => (
              <div key={o.id} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500">#{i + 1}</div>
                    <div className="text-lg font-semibold text-slate-900">{o.customer_name || "—"}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(o.created_at).toLocaleString("pl-PL")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-900">
                      {o.total_price != null ? PLN.format(Number(o.total_price)) : "—"}
                    </div>
                    <div className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor(o.status)}`}>
                      {statusLabel(o.status)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-500">Opcja</div>
                    <div className="font-medium text-slate-800">{optLabel(o.selected_option)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-500">Odbiór</div>
                    <div className="font-medium text-slate-800">{safeTime(o)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Loader overlay jak w AdminPanel */}
      {loading && (
        <div className="pointer-events-none fixed bottom-4 right-4 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs text-slate-700 shadow">
          <RefreshCw size={14} className="animate-spin" />
          Aktualizuję…
        </div>
      )}
    </div>
  );
}
