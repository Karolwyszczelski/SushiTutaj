// src/app/admin/history/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

/* ====== Miasta jak w AdminPanel ====== */
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

/* ====== Pomocnicze ====== */
const PLN = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 2,
});

const getCookie = (k: string): string | null => {
  if (typeof document === "undefined") return null;
  const row =
    document.cookie
      .split("; ")
      .find((r) => r.startsWith(`${k}=`) || r.startsWith(`${encodeURIComponent(k)}=`)) || null;
  if (!row) return null;
  const value = row.substring(row.indexOf("=") + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Minimalny typ rekordu zamówienia używany w historii */
type OrderRow = {
  id: string | number;
  created_at: string | null;
  status?: string | null;
  total_price?: number | null;
  [key: string]: any;
};

const statusLabel = (status?: string | null) => {
  switch ((status || "").toLowerCase()) {
    case "new":
      return "Nowe";
    case "placed":
      return "Złożone";
    case "accepted":
      return "W trakcie";
    case "cancelled":
      return "Anulowane";
    case "completed":
      return "Zrealizowane";
    default:
      return status ? String(status).toUpperCase() : "—";
  }
};

const statusBadge = (status?: string | null) => {
  switch ((status || "").toLowerCase()) {
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

const optionLabel = (opt?: string | null) => {
  const v = (opt || "").toLowerCase();
  if (v === "local") return "Na miejscu";
  if (v === "takeaway") return "Na wynos";
  if (v === "delivery") return "Dostawa";
  return "—";
};

export default function HistoryPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();

  /* ====== Sterowanie ====== */
  const [booted, setBooted] = useState(false);
  const [city, setCity] = useState<CityPick>("ciechanow");
  const [days, setDays] = useState<7 | 30 | 90 | 365>(30);
  const [statusFilter, setStatusFilter] =
    useState<"all" | "in_progress" | "completed" | "cancelled">("all");
  const [search, setSearch] = useState("");

  /* ====== Dane ====== */
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* ====== Inicjalizacja jak w AdminPanel (ensure-cookie) ====== */
  useEffect(() => {
    const init = async () => {
      try {
        const r = await fetch("/api/restaurants/ensure-cookie", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const slug =
          (j?.restaurant_slug as string | undefined) ||
          getCookie("restaurant_slug") ||
          undefined;
        if (slug && CITY_OPTIONS.some((c) => c.slug === slug)) {
          setCity(slug as CityPick);
        }
      } finally {
        setBooted(true);
      }
    };
    void init();
  }, []);

  /* ====== Pobieranie zamówień ====== */
  useEffect(() => {
    if (!booted) return;

    let stop = false;
    const sinceISO = new Date(Date.now() - Number(days) * 864e5).toISOString();

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        if (city === "all") {
          const slugs = CITIES.map((c) => c.slug);
          const { data: rest, error: er } = await supabase
            .from("restaurants")
            .select("id, slug")
            .in("slug", slugs as string[]);
          if (er) throw er;

          const ids = (rest || []).map((r: any) => r.id);
          if (ids.length === 0) {
            setOrders([]);
            return;
          }

          const { data, error } = await supabase
            .from("orders")
            .select("*")
            .in("restaurant_id", ids)
            .gte("created_at", sinceISO)
            .order("created_at", { ascending: false })
            .limit(10);

          if (error) throw error;
          if (!stop) setOrders((data || []) as OrderRow[]);
        } else {
          const { data: r, error: er } = await supabase
            .from("restaurants")
            .select("id")
            .eq("slug", city)
            .maybeSingle();
          if (er) throw er;

          const { data, error } = await supabase
            .from("orders")
            .select("*")
            .eq("restaurant_id", (r as any)?.id || "")
            .gte("created_at", sinceISO)
            .order("created_at", { ascending: false })
            .limit(10);

          if (error) throw error;
          if (!stop) setOrders((data || []) as OrderRow[]);
        }
      } catch (e: any) {
        if (!stop) {
          setLoadError(e?.message || "Błąd ładowania");
          setOrders([]);
        }
      } finally {
        if (!stop) setLoading(false);
      }
    };

    void load();
    return () => {
      stop = true;
    };
  }, [booted, city, days, supabase]);

  /* ====== Filtrowanie i podsumowanie ====== */
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders
      .filter((o) => {
        const s = (o.status || "").toString().toLowerCase();
        if (statusFilter === "in_progress" && s !== "accepted") return false;
        if (statusFilter === "completed" && s !== "completed") return false;
        if (statusFilter === "cancelled" && s !== "cancelled") return false;
        return true;
      })
      .filter((o) => {
        if (!term) return true;
        const idHit = String(o.id || "").toLowerCase().includes(term);
        const name =
          (o as any).customer_name ||
          (o as any).customer ||
          (o as any).client_name ||
          (o as any).name ||
          (o as any).user_name ||
          "";
        const nameHit = String(name).toLowerCase().includes(term);
        const optHit = String((o as any).selected_option || "")
          .toLowerCase()
          .includes(term);
        return idHit || nameHit || optHit;
      });
  }, [orders, statusFilter, search]);

  const counts = useMemo(() => {
    const s = (k: string) =>
      orders.filter(
        (o) => (o.status || "").toString().toLowerCase() === k
      ).length;
    return {
      all: orders.length,
      in_progress: s("accepted"),
      completed: s("completed"),
      cancelled: s("cancelled"),
    };
  }, [orders]);

  /* ====== UI ====== */
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Historia zamówień
          </h1>
          <p className="text-sm text-slate-600">
            Przegląd, filtry i eksport.
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
            {[7, 30, 90, 365].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d as 7 | 30 | 90 | 365)}
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
        </div>
      </div>

      {/* Pasek filtrów */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Statusy jak pigułki */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "Wszystkie", count: counts.all },
            { key: "in_progress", label: "W trakcie", count: counts.in_progress },
            { key: "completed", label: "Zrealizowane", count: counts.completed },
            { key: "cancelled", label: "Anulowane", count: counts.cancelled },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key as any)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium shadow-sm ${
                statusFilter === s.key
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-100 border"
              }`}
            >
              {s.label}{" "}
              <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs">
                {s.count}
              </span>
            </button>
          ))}
        </div>

        {/* Szukaj */}
        <div className="sm:w-80">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj: klient, ID, opcja…"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Wyczyść"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Treść */}
      {loading ? (
        <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          Ładowanie…
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800 shadow-sm">
          <div className="font-semibold">Nie udało się załadować historii.</div>
          <div className="text-sm">{loadError}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Brak zamówień dla wybranych filtrów.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full table-auto">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">
                  #
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">
                  Data
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">
                  Klient
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">
                  Kwota
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">
                  Opcja
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((o, i) => {
                const idx = i + 1;
                const s = (o.status || "").toString().toLowerCase();
                const name =
                  (o as any).customer_name ||
                  (o as any).customer ||
                  (o as any).client_name ||
                  (o as any).name ||
                  (o as any).user_name ||
                  "—";
                return (
                  <tr key={o.id || i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-700">{idx}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {o.created_at
                        ? new Date(o.created_at).toLocaleString("pl-PL")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900">{name}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {o.total_price != null
                        ? PLN.format(Number(o.total_price))
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {optionLabel((o as any).selected_option)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(
                          s
                        )}`}
                      >
                        {statusLabel(s)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stopka z licznością wyników */}
      <div className="mt-4 text-right text-xs text-slate-500">
        Wyniki: {filtered.length}
      </div>

      {/* Informacja o limicie zamówień */}
      {filtered.length >= 10 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-sm text-amber-800">
            Wyświetlamy tylko <strong>10 ostatnich zamówień</strong>.
          </p>
          <p className="text-sm text-amber-700 mt-1">
            Potrzebujesz pełnej historii? Skontaktuj się z administratorem systemu lub skorzystaj z eksportu CSV.
          </p>
        </div>
      )}

      {/* Przyciski szybkie jak w AdminPanel */}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={() =>
            router.push(
              city === "all"
                ? "/admin/pickup-order"
                : `/admin/pickup-order?restaurant=${city}`
            )
          }
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Otwórz listę zamówień
        </button>
        <button
          onClick={() => {
            const rows = [
              ["ID", "Data", "Klient", "Kwota", "Opcja", "Status"],
              ...filtered.map((o) => [
                String(o.id ?? ""),
                o.created_at
                  ? new Date(o.created_at).toLocaleString("pl-PL")
                  : "",
                String(
                  (o as any).customer_name ||
                    (o as any).customer ||
                    (o as any).client_name ||
                    (o as any).name ||
                    (o as any).user_name ||
                    ""
                ),
                o.total_price != null ? String(o.total_price) : "",
                optionLabel((o as any).selected_option),
                statusLabel(o.status as any),
              ]),
            ];
            const csv = rows
              .map((r) =>
                r
                  .map((c) => `"${String(c).replace(/"/g, '""')}"`)
                  .join(",")
              )
              .join("\n");
            const blob = new Blob([csv], {
              type: "text/csv;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `historia_${city}_${days}dni_${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          Eksport CSV
        </button>
      </div>
    </div>
  );
}
