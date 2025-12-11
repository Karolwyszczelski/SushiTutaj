"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Pencil, Trash, ToggleRight, ChevronDown, Power } from "lucide-react";
import debounce from "lodash.debounce";
import AddonOptionsForm from "@/components/admin/settings/AddonOptionsForm";

/* ========= Typy ========= */
interface Product {
  id: string;
  restaurant_id: string;
  name: string | null;
  description: string | null;
  subcategory: string | null;
  position: number | null;
  image_url: string | null;
  // flagi dostępności
  available: boolean;
  is_active: boolean;
  price_cents: number | null;
}

/* ========= Utils ========= */
const fmtPrice = (cents?: number | null) =>
  ((cents ?? 0) / 100).toFixed(2) + " zł";

/* ========= Modal edycji ========= */
function EditProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [form, setForm] = useState({
    name: product.name ?? "",
    priceZl:
      product.price_cents != null ? (product.price_cents / 100).toFixed(2) : "",
    description: product.description ?? "",
    subcategory: product.subcategory ?? "",
    image_url: product.image_url ?? "",
    position: product.position ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null);
    setSaving(true);
    try {
      const cents = Math.round(
        Number((form.priceZl || "0").replace(",", ".")) * 100
      );
      const payload: Partial<Product> = {
        name: form.name || null,
        description: form.description || null,
        subcategory: form.subcategory || null,
        image_url: form.image_url || null,
        position: Number.isFinite(form.position as number)
          ? Number(form.position)
          : 0,
        price_cents: Number.isFinite(cents) ? cents : 0,
      };

      const { data, error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", product.id)
        .select("*")
        .single();

      if (error) throw error;
      onSaved(data as Product);
      onClose();
    } catch (e: any) {
      setErr(e.message || "Nie udało się zapisać zmian.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onMouseDown={onClose} />
      <div
        className="relative z-[121] w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-xl font-bold">Edytuj produkt</h3>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-sm hover:bg-slate-50"
          >
            Zamknij
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {err && (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {err}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
                Nazwa
              </label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
                Cena (PLN)
              </label>
              <input
                value={form.priceZl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priceZl: e.target.value }))
                }
                inputMode="decimal"
                placeholder="np. 34.00"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
                Opis
              </label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
                Kategoria
              </label>
              <input
                value={form.subcategory}
                onChange={(e) =>
                  setForm((f) => ({ ...f, subcategory: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
                Kolejność
              </label>
              <input
                type="number"
                value={form.position}
                onChange={(e) =>
                  setForm((f) => ({ ...f, position: Number(e.target.value) }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
                URL obrazka
              </label>
              <input
                value={form.image_url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, image_url: e.target.value }))
                }
                placeholder="https://…"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Anuluj
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========= Strona ========= */
export default function AdminMenuPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [filterCat, setFilterCat] = useState<string>("Wszystkie");
  const [sortKey, setSortKey] = useState<
    "nameAsc" | "nameDesc" | "priceAsc" | "priceDesc"
  >("nameAsc");
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);

  const [showDrinkFlavors, setShowDrinkFlavors] = useState(false);

  // Przyjmowanie zamówień globalnie – per restauracja (restaurants.active)
  const [orderingOpen, setOrderingOpen] = useState<boolean | null>(null);
  const [toggleOrderingBusy, setToggleOrderingBusy] = useState(false);

  /* 1) Pobierz lokal z ensure-cookie */
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const r = await fetch("/api/restaurants/ensure-cookie", {
          cache: "no-store",
          credentials: "include",
        });
        const j = await r.json().catch(() => ({}));
        if (stop) return;
        setRestaurantId(j?.restaurant_id ?? null);
        setSlug(j?.restaurant_slug ?? null);
      } catch {
        if (!stop) {
          setRestaurantId(null);
          setSlug(null);
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  /* 2) Załaduj produkty + status przyjmowania */
  const fetchAll = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [{ data, error: err }, ri] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id,restaurant_id,name,description,subcategory,position,image_url,available,is_active,price_cents"
          )
          .eq("restaurant_id", restaurantId)
          .order("subcategory", { ascending: true, nullsFirst: true })
          .order("position", { ascending: true, nullsFirst: true })
          .order("name", { ascending: true }),
        supabase
          .from("restaurants")
          .select("active")
          .eq("id", restaurantId)
          .maybeSingle(),
      ]);

      if (err) throw err;
      setProducts((data as Product[]) ?? []);
      if (!ri.error && ri.data)
        setOrderingOpen(Boolean((ri.data as any).active));
      setError(null);
    } catch (e: any) {
      setError(e.message || "Błąd ładowania danych");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, supabase]);

  useEffect(() => {
    if (!restaurantId) return;
    void fetchAll();

    const chProducts = supabase
      .channel("public:products:" + restaurantId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => void fetchAll()
      )
      .subscribe();

    const chRestaurants = supabase
      .channel("public:restaurants:" + restaurantId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurants",
          filter: `id=eq.${restaurantId}`,
        },
        (p: any) => {
          const row = (p?.new || p?.record) as { active?: boolean } | undefined;
          if (row && typeof row.active === "boolean")
            setOrderingOpen(row.active);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(chProducts);
      void supabase.removeChannel(chRestaurants);
    };
  }, [restaurantId, supabase, fetchAll]);

  /* 3) Helper: nazwa z kategorią przed nazwą */
  const displayNameWithCategory = useCallback((p: Product): string => {
    const cat = (p.subcategory || "").trim();
    const name = (p.name || "").trim();
    if (!cat) return name;

    const lcName = name.toLowerCase();
    const lcCat = cat.toLowerCase();

    if (
      lcName.startsWith(lcCat + " ") ||
      lcName.startsWith(lcCat + "-") ||
      lcName.startsWith(lcCat + ":")
    ) {
      return name;
    }

    return `${cat} ${name}`;
  }, []);

  /* 4) Akcje */
  const toggleAvailability = async (id: string, current: boolean) => {
    setTogglingId(id);

    // optymistycznie zmieniamy oba pola w stanie
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, available: !current, is_active: !current } : p
      )
    );

    try {
      const { error } = await supabase
        .from("products")
        .update({ available: !current, is_active: !current })
        .eq("id", id);

      if (error) throw error;
    } catch (e: any) {
      alert(`Nie udało się zmienić dostępności: ${e.message || e}`);

      // rollback lokalnego stanu jeśli błąd
      setProducts((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, available: current, is_active: current } : p
        )
      );
    } finally {
      setTogglingId(null);
    }
  };

  const flipOrdering = async () => {
    if (orderingOpen == null || !restaurantId) return;
    setToggleOrderingBusy(true);
    try {
      const next = !orderingOpen;
      setOrderingOpen(next);
      const { error } = await supabase
        .from("restaurants")
        .update({ active: next })
        .eq("id", restaurantId);
      if (error) throw error;
    } catch (e: any) {
      setOrderingOpen(!orderingOpen);
      alert("Nie udało się zmienić statusu zamawiania: " + (e.message || e));
    } finally {
      setToggleOrderingBusy(false);
    }
  };

  /* 5) Filtry */
  const categories = useMemo(
    () =>
      Array.from(
        new Set(products.map((p) => p.subcategory || "Bez kategorii"))
      )
        .filter(Boolean)
        .sort(),
    [products]
  );

  const filtered = useMemo(() => {
    return products
      .filter((p) => {
        if (
          filterCat !== "Wszystkie" &&
          (p.subcategory || "Bez kategorii") !== filterCat
        )
          return false;

        if (search.trim()) {
          const term = search.toLowerCase();
          return (
            (p.name || "").toLowerCase().includes(term) ||
            (p.description || "").toLowerCase().includes(term)
          );
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortKey) {
          case "nameAsc":
            return (a.name || "").localeCompare(b.name || "");
          case "nameDesc":
            return (b.name || "").localeCompare(a.name || "");
          case "priceAsc":
            return (a.price_cents ?? 0) - (b.price_cents ?? 0);
          case "priceDesc":
            return (b.price_cents ?? 0) - (a.price_cents ?? 0);
          default:
            return 0;
        }
      });
  }, [products, filterCat, sortKey, search]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const onSearchChange = useCallback(
    debounce((v: string) => setSearch(v), 300),
    []
  );

  const handleSaved = (u: Product) =>
    setProducts((prev) => prev.map((p) => (p.id === u.id ? u : p)));

  /* 6) UI */
  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      {!restaurantId && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Brak przypisanego lokalu. Otwórz stronę wyboru restauracji.
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            Zarządzanie menu {slug ? `— ${slug}` : ""}
          </h1>
          {error && <p className="mt-1 text-sm text-rose-600">{error}</p>}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <button
            onClick={flipOrdering}
            disabled={orderingOpen == null || toggleOrderingBusy || !restaurantId}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm ${
              orderingOpen ? "bg-emerald-600 text-white" : "bg-white text-slate-800"
            }`}
            title="Włącz/wyłącz przyjmowanie zamówień"
          >
            <Power className="h-4 w-4" />
            {orderingOpen ? "Zamawianie: WŁĄCZONE" : "Zamawianie: WYŁĄCZONE"}
          </button>

          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
              Kategoria
            </label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
            >
              <option value="Wszystkie">Wszystkie</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
              Sortuj
            </label>
            <div className="relative">
              <select
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white text-slate-900 px-3 py-2 pr-8 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as any)}
              >
                <option value="nameAsc">Nazwa ↑</option>
                <option value="nameDesc">Nazwa ↓</option>
                <option value="priceAsc">Cena ↑</option>
                <option value="priceDesc">Cena ↓</option>
              </select>
              <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-600">
                <ChevronDown size={16} />
              </div>
            </div>
          </div>

          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
              Szukaj
            </label>
            <input
              type="text"
              placeholder="Nazwa lub opis"
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
          </div>

          <button
            onClick={() => fetchAll()}
            disabled={loading || !restaurantId}
            className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
          >
            Odśwież
          </button>
        </div>
      </div>

      {/* Smaki napojów (przeniesione z Ustawień) */}
<div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div className="text-lg font-semibold text-slate-900">Smaki / warianty napojów</div>
      <div className="mt-0.5 text-xs text-slate-600">
        To steruje listą wyboru w koszyku (Checkout) dla tego lokalu.
      </div>
    </div>

    <button
      type="button"
      onClick={() => setShowDrinkFlavors((v) => !v)}
      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
    >
      {showDrinkFlavors ? "Zwiń" : "Edytuj"}
    </button>
  </div>

  {showDrinkFlavors && (
    <div className="mt-4">
      {/* slug masz już z ensure-cookie: setSlug(j.restaurant_slug) */}
      <AddonOptionsForm restaurantSlug={slug} />
    </div>
  )}
</div>

      {/* Tabela desktop */}
      <div className="hidden md:block">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  #
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Nazwa
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Cena
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Kategoria
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Dostępność
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Akcje
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="h-4 w-4 rounded bg-slate-200" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-40 rounded bg-slate-200" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-16 rounded bg-slate-200" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-32 rounded bg-slate-200" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-block h-6 w-16 rounded-full bg-slate-200" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-block h-4 w-28 rounded bg-slate-200" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Brak produktów do wyświetlenia.
                  </td>
                </tr>
              ) : (
                filtered.map((it, i) => (
                  <tr key={it.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                      {i + 1}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                      {displayNameWithCategory(it)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {fmtPrice(it.price_cents)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">{it.subcategory}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleAvailability(it.id, it.available)}
                        disabled={togglingId === it.id}
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
                          it.available
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        } ${
                          togglingId === it.id
                            ? "cursor-not-allowed opacity-70"
                            : "hover:scale-105"
                        }`}
                      >
                        {it.available ? "Dostępny" : "Wyłączony"}{" "}
                        <ToggleRight className="h-4 w-4" />
                      </button>
                    </td>
                    <td className="flex justify-end gap-2 px-6 py-4 text-right">
                      <button
                        onClick={() => setEditing(it)}
                        className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900"
                      >
                        <Pencil size={16} /> Edytuj
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm("Na pewno usunąć ten produkt?")) return;
                          supabase
                            .from("products")
                            .delete()
                            .eq("id", it.id)
                            .then(({ error }) => {
                              if (error) return alert("Nie udało się usunąć produktu");
                              setProducts((p) => p.filter((x) => x.id !== it.id));
                            });
                        }}
                        className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-800"
                      >
                        <Trash size={16} /> Usuń
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Karty mobilne */}
      <div className="mt-6 space-y-4 md:hidden">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
              <div className="h-4 w-3/4 rounded bg-slate-200" />
              <div className="flex justify-between">
                <div className="h-4 w-1/4 rounded bg-slate-200" />
                <div className="h-4 w-16 rounded bg-slate-200" />
              </div>
              <div className="h-3 w-full rounded bg-slate-200" />
              <div className="flex gap-2">
                <div className="h-8 w-20 rounded bg-slate-200" />
                <div className="h-8 w-20 rounded bg-slate-200" />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
            Brak produktów do wyświetlenia.
          </div>
        ) : (
          filtered.map((it) => (
            <div key={it.id} className="relative flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="text-lg font-semibold text-slate-900">
                  {displayNameWithCategory(it)}
                </div>
                <div className="text-sm font-medium text-slate-700">
                  {fmtPrice(it.price_cents)}
                </div>
              </div>

              <div className="text-xs text-slate-600">{it.subcategory}</div>

              {it.description && (
                <div className="text-sm text-slate-800">{it.description}</div>
              )}

              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  onClick={() => toggleAvailability(it.id, it.available)}
                  disabled={togglingId === it.id}
                  className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                    it.available
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-rose-100 text-rose-800"
                  } ${togglingId === it.id ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  {it.available ? "Dostępny" : "Wyłączony"}{" "}
                  <ToggleRight className="h-4 w-4" />
                </button>

                <div className="flex gap-3">
                  <button onClick={() => setEditing(it)} className="text-sky-700">
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm("Na pewno usunąć ten produkt?")) return;
                      supabase
                        .from("products")
                        .delete()
                        .eq("id", it.id)
                        .then(({ error }) => {
                          if (error) return alert("Nie udało się usunąć produktu");
                          setProducts((p) => p.filter((x) => x.id !== it.id));
                        });
                    }}
                    className="text-rose-600"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {editing && (
        <EditProductModal
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
