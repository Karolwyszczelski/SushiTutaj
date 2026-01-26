"use client";

import React, { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type ApplyScope =
  | "all"
  | "include_only"
  | "exclude";

type DiscountType = "percent" | "amount";

type DiscountCodeRow = {
  id: string;
  code: string | null;
  active: boolean | null;
  type: DiscountType | null;
  value: number | null;
  min_order: number | null;
  expires_at: string | null;
  created_at: string | null;
  restaurant_id: string | null;
  description: string | null;
  require_code: boolean | null;
  apply_scope: ApplyScope | null;
  include_categories: string[] | null;
  exclude_categories: string[] | null;
  include_products: string[] | null;
  exclude_products: string[] | null;
};

type FormState = {
  id?: string;
  code: string;
  description: string;
  active: boolean;
  type: DiscountType;
  value: string;
  minOrder: string;
  expiresAt: string; // YYYY-MM-DD
  requireCode: boolean;
  applyScope: ApplyScope;
  includeCategories: string;
  excludeCategories: string;
  includeProducts: string;
  excludeProducts: string;
  isGlobal: boolean; // NOWE: rabat globalny (restaurant_id = NULL)
};

const emptyForm = (): FormState => ({
  id: undefined,
  code: "",
  description: "",
  active: true,
  type: "percent",
  value: "",
  minOrder: "",
  expiresAt: "",
  requireCode: true,
  applyScope: "all",
  includeCategories: "",
  excludeCategories: "",
  includeProducts: "",
  excludeProducts: "",
  isGlobal: true, // nowy rabat domyślnie globalny
});

function joinList(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return "";
  return arr.join(", ");
}

function parseList(s: string): string[] | null {
  if (!s) return null;
  const parts = s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

function toFormState(row: DiscountCodeRow): FormState {
  return {
    id: row.id,
    code: row.code ?? "",
    description: row.description ?? "",
    active: !!row.active,
    type: (row.type as DiscountType) ?? "percent",
    value: row.value != null ? String(row.value) : "",
    minOrder: row.min_order != null ? String(row.min_order) : "",
    expiresAt: row.expires_at ? row.expires_at.slice(0, 10) : "",
    requireCode: row.require_code ?? true,
    applyScope: (row.apply_scope as ApplyScope) ?? "all",
    includeCategories: joinList(row.include_categories),
    excludeCategories: joinList(row.exclude_categories),
    includeProducts: joinList(row.include_products),
    excludeProducts: joinList(row.exclude_products),
    isGlobal: row.restaurant_id === null, // KLUCZOWE
  };
}

function numOrNull(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export default function DiscountCodesForm() {
  const supabase = getSupabaseBrowser();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DiscountCodeRow[]>([]);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1) Wczytanie aktualnej restauracji (ze sluga w URL) + kodów (lokalne + globalne)
  useEffect(() => {
    const loadRestaurantAndCodes = async () => {
      setLoading(true);
      setError(null);
      try {
        // slug lokalu z ?restaurant=...
        const params = new URLSearchParams(window.location.search);
        const slug = params.get("restaurant");

        let restQuery = supabase.from("restaurants").select("id, slug");

        if (slug) {
          restQuery = restQuery.eq("slug", slug);
        } else {
          restQuery = restQuery.limit(1);
        }

        const { data: restaurant, error: restErr } =
          await restQuery.maybeSingle();

        if (restErr || !restaurant?.id) {
          console.error("restaurant load error", restErr);
          setError("Nie udało się odczytać aktualnej restauracji.");
          setRestaurantId(null);
          setLoading(false);
          return;
        }

        const restId = restaurant.id as string;
        setRestaurantId(restId);

        // Pobierz rabaty: globalne (restaurant_id IS NULL) + lokalne dla tego lokalu
        const { data: codes, error: codesErr } = await supabase
          .from("discount_codes")
          .select("*")
          .or(`restaurant_id.is.null,restaurant_id.eq.${restId}`)
          .order("created_at", { ascending: false });

        if (codesErr) {
          console.error("discount_codes load error", codesErr);
          setError("Nie udało się pobrać listy kodów rabatowych.");
        } else {
          setRows((codes || []) as DiscountCodeRow[]);
        }
      } catch (e: any) {
        console.error("discount_codes unexpected error", e);
        setError(e?.message || "Nieoczekiwany błąd.");
      } finally {
        setLoading(false);
      }
    };

    loadRestaurantAndCodes();
  }, [supabase]);

  const startCreate = () => {
    setEditing(emptyForm());
  };

  const startEdit = (row: DiscountCodeRow) => {
    setEditing(toFormState(row));
  };

  const cancelEdit = () => {
    setEditing(null);
  };

  const handleChange = (field: keyof FormState, value: string | boolean) => {
    if (!editing) return;
    setEditing({ ...editing, [field]: value } as FormState);
  };

  const handleSave = async () => {
    if (!editing) return;
    // dla lokalnego rabatu wymagamy ID restauracji
    if (!editing.isGlobal && !restaurantId) return;

    setSaving(true);
    setError(null);

    const valueNum = numOrNull(editing.value);
    const minOrderNum = numOrNull(editing.minOrder);

    const includeCategoriesArr =
      editing.applyScope === "include_only"
        ? parseList(editing.includeCategories) ?? []
        : [];

    const excludeCategoriesArr =
      editing.applyScope === "exclude"
        ? parseList(editing.excludeCategories) ?? []
        : [];

    const includeProductsArr =
      editing.applyScope === "include_only"
        ? parseList(editing.includeProducts) ?? []
        : [];

    const excludeProductsArr =
      editing.applyScope === "exclude"
        ? parseList(editing.excludeProducts) ?? []
        : [];

    const payload = {
      code: editing.requireCode ? editing.code.trim() || null : null,
      description: editing.description.trim() || null,
      active: editing.active ?? undefined,
      type: editing.type ?? undefined,
      value: valueNum ?? 0,
      min_order: minOrderNum,
      expires_at: editing.expiresAt
        ? new Date(editing.expiresAt).toISOString()
        : null,
      require_code: editing.requireCode ?? undefined,
      apply_scope: editing.applyScope ?? undefined,
      include_categories: includeCategoriesArr,
      exclude_categories: excludeCategoriesArr,
      include_products: includeProductsArr,
      exclude_products: excludeProductsArr,
      // KLUCZOWE: globalny = restaurant_id NULL, lokalny = ID aktualnego lokalu
      restaurant_id: editing.isGlobal ? null : restaurantId,
    };

    try {
      if (editing.id) {
        const { error } = await supabase
          .from("discount_codes")
          .update(payload as any)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("discount_codes")
          .insert(payload as any);
        if (error) throw error;
      }

      if (!restaurantId) {
        // teoretycznie nie powinno się zdarzyć, bo lokalne wymagają ID,
        // ale dla porządku odświeżamy bez filtra
        const { data: codes, error: codesErr } = await supabase
          .from("discount_codes")
          .select("*")
          .order("created_at", { ascending: false });

        if (codesErr) {
          setError("Zapisano, ale nie udało się odświeżyć listy.");
        } else {
          setRows((codes || []) as DiscountCodeRow[]);
        }
      } else {
        const { data: codes, error: codesErr } = await supabase
          .from("discount_codes")
          .select("*")
          .or(`restaurant_id.is.null,restaurant_id.eq.${restaurantId}`)
          .order("created_at", { ascending: false });

        if (codesErr) {
          setError("Zapisano, ale nie udało się odświeżyć listy.");
        } else {
          setRows((codes || []) as DiscountCodeRow[]);
        }
      }

      setEditing(null);
    } catch (e: any) {
      setError(e?.message || "Nie udało się zapisać kodu rabatowego.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    if (!window.confirm("Na pewno usunąć ten kod rabatowy?")) return;
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase
        .from("discount_codes")
        .delete()
        .eq("id", id);
      if (error) throw error;

      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      setError(e?.message || "Nie udało się usunąć kodu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Promocje i kody rabatowe</h2>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          disabled={loading}
        >
          + Nowy rabat
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-600">Ładowanie…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">
          Brak zdefiniowanych rabatów (lokalnych ani globalnych).
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Kod</th>
                <th className="px-3 py-2">Opis</th>
                <th className="px-3 py-2">Typ</th>
                <th className="px-3 py-2">Wartość</th>
                <th className="px-3 py-2">Min. zamówienie</th>
                <th className="px-3 py-2">Zakres produktów</th>
                <th className="px-3 py-2">Zakres lokali</th>
                <th className="px-3 py-2">Ważny do</th>
                <th className="px-3 py-2">Aktywny</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="bg-white">
                  <td className="px-3 py-2">
                    {row.require_code === false ? "AUTO" : row.code || "–"}
                  </td>
                  <td className="px-3 py-2 truncate max-w-[220px]">
                    {row.description || "–"}
                  </td>
                  <td className="px-3 py-2">
                    {row.type === "percent" ? "Procent" : "Kwota"}
                  </td>
                  <td className="px-3 py-2">
                    {row.value != null ? row.value.toFixed(2) + " zł" : "–"}
                  </td>
                  <td className="px-3 py-2">
                    {row.min_order != null
                      ? row.min_order.toFixed(2) + " zł"
                      : "–"}
                  </td>
                  <td className="px-3 py-2">
                    {row.apply_scope === "all" && "wszystkie produkty"}
                    {row.apply_scope === "include_only" &&
                      "tylko wybrane (include)"}
                    {row.apply_scope === "exclude" &&
                      "wszystko oprócz (exclude)"}
                  </td>
                  <td className="px-3 py-2">
                    {row.restaurant_id === null
                      ? "Wszystkie lokale"
                      : "Tylko ten lokal"}
                  </td>
                  <td className="px-3 py-2">
                    {row.expires_at
                      ? row.expires_at.slice(0, 10)
                      : "bez terminu"}
                  </td>
                  <td className="px-3 py-2">
                    {row.active ? "TAK" : "NIE"}
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="text-xs font-medium text-slate-700 hover:underline"
                    >
                      Edytuj
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(row.id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Usuń
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="mt-4 rounded-xl border bg-white p-4 space-y-4">
          <h3 className="text-sm font-semibold">
            {editing.id ? "Edytuj rabat" : "Nowy rabat"}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span>Kod promocyjny</span>
              <input
                type="text"
                className="rounded-md border px-2 py-1 bg-white"
                value={editing.code}
                onChange={(e) => handleChange("code", e.target.value)}
                disabled={!editing.requireCode}
              />
              <span className="text-[11px] text-slate-500">
                Jeśli „bez kodu”, pole zostanie zignorowane.
              </span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={editing.requireCode}
                onChange={(e) => handleChange("requireCode", e.target.checked)}
              />
              <span>Wymagany kod (jeśli odznaczysz – rabat AUTO)</span>
            </label>

            <label className="flex flex-col gap-1 md:col-span-2">
              <span>Opis / nazwa</span>
              <input
                type="text"
                className="rounded-md border px-2 py-1 bg-white"
                value={editing.description}
                onChange={(e) =>
                  handleChange("description", e.target.value)
                }
              />
            </label>

            <label className="flex flex-col gap-1">
              <span>Typ rabatu</span>
              <select
                className="rounded-md border px-2 py-1 bg-white"
                value={editing.type}
                onChange={(e) =>
                  handleChange("type", e.target.value as DiscountType)
                }
              >
                <option value="percent">Procent (%)</option>
                <option value="amount">Kwota (zł)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span>Wartość</span>
              <input
                type="number"
                step="0.01"
                className="rounded-md border px-2 py-1 bg-white"
                value={editing.value}
                onChange={(e) => handleChange("value", e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span>Minimalna wartość zamówienia (zł)</span>
              <input
                type="number"
                step="0.01"
                className="rounded-md border px-2 py-1 bg-white"
                value={editing.minOrder}
                onChange={(e) => handleChange("minOrder", e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span>Ważny do (opcjonalnie)</span>
              <input
                type="date"
                className="rounded-md border px-2 py-1 bg-white"
                value={editing.expiresAt}
                onChange={(e) => handleChange("expiresAt", e.target.value)}
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={editing.active}
                onChange={(e) => handleChange("active", e.target.checked)}
              />
              <span>Rabat aktywny</span>
            </label>

            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={editing.isGlobal}
                onChange={(e) => handleChange("isGlobal", e.target.checked)}
              />
              <span>
                Globalny – obowiązuje we wszystkich lokalach (jeśli odznaczysz,
                rabat będzie działał tylko w tym lokalu)
              </span>
            </label>

            <label className="flex flex-col gap-1 md:col-span-2">
              <span>Zastosowanie rabatu</span>
              <select
                className="rounded-md border px-2 py-1 bg-white"
                value={editing.applyScope}
                onChange={(e) =>
                  handleChange("applyScope", e.target.value as ApplyScope)
                }
              >
                <option value="all">Wszystkie produkty</option>
                <option value="include_only">
                  Tylko wybrane kategorie/produkty
                </option>
                <option value="exclude">
                  Wszystko oprócz wybranych
                </option>
              </select>
            </label>

            {editing.applyScope === "include_only" && (
              <>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span>
                    Kategorie do uwzględnienia (slug/nazwa, po przecinku lub w nowych liniach)
                  </span>
                  <textarea
                    className="rounded-md border px-2 py-1 min-h-[60px]"
                    value={editing.includeCategories}
                    onChange={(e) =>
                      handleChange("includeCategories", e.target.value)
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span>
                    Produkty do uwzględnienia (slug/nazwa, po przecinku lub w nowych liniach)
                  </span>
                  <textarea
                    className="rounded-md border px-2 py-1 min-h-[60px]"
                    value={editing.includeProducts}
                    onChange={(e) =>
                      handleChange("includeProducts", e.target.value)
                    }
                  />
                </label>
              </>
            )}

            {editing.applyScope === "exclude" && (
              <>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span>
                    Kategorie do wykluczenia (slug/nazwa, po przecinku lub w nowych liniach)
                  </span>
                  <textarea
                    className="rounded-md border px-2 py-1 min-h-[60px]"
                    value={editing.excludeCategories}
                    onChange={(e) =>
                      handleChange("excludeCategories", e.target.value)
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span>
                    Produkty do wykluczenia (slug/nazwa, po przecinku lub w nowych liniach)
                  </span>
                  <textarea
                    className="rounded-md border px-2 py-1 min-h-[60px]"
                    value={editing.excludeProducts}
                    onChange={(e) =>
                      handleChange("excludeProducts", e.target.value)
                    }
                  />
                </label>
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              disabled={saving}
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "Zapisywanie…" : "Zapisz"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
