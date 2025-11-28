"use client";

import React, { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type ApplyScope =
  | "all"
  | "include_categories"
  | "exclude_categories"
  | "include_products"
  | "exclude_products";

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
};

const supabase = createClientComponentClient();

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
  };
}

function numOrNull(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export default function DiscountCodesForm() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DiscountCodeRow[]>([]);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1) Wczytanie aktualnej restauracji + kodów
  useEffect(() => {
    const loadRestaurantAndCodes = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("restaurants")
          .select("id")
          .limit(1)
          .maybeSingle();

        if (error || !data?.id) {
          setError("Nie udało się odczytać aktualnej restauracji.");
          setRestaurantId(null);
          setLoading(false);
          return;
        }

        const restId = data.id as string;
        setRestaurantId(restId);

        const { data: codes, error: codesErr } = await supabase
          .from("discount_codes")
          .select("*")
          .eq("restaurant_id", restId)
          .order("created_at", { ascending: false });

        if (codesErr) {
          setError("Nie udało się pobrać listy kodów rabatowych.");
        } else {
          setRows((codes || []) as DiscountCodeRow[]);
        }
      } catch (e: any) {
        setError(e?.message || "Nieoczekiwany błąd.");
      } finally {
        setLoading(false);
      }
    };

    loadRestaurantAndCodes();
  }, []);

  const startCreate = () => {
    setEditing(emptyForm());
  };

  const startEdit = (row: DiscountCodeRow) => {
    setEditing(toFormState(row));
  };

  const cancelEdit = () => {
    setEditing(null);
  };

  const handleChange = (
    field: keyof FormState,
    value: string | boolean
  ) => {
    if (!editing) return;
    setEditing({ ...editing, [field]: value } as FormState);
  };

  const handleSave = async () => {
    if (!editing || !restaurantId) return;
    setSaving(true);
    setError(null);

    const valueNum = numOrNull(editing.value);
    const minOrderNum = numOrNull(editing.minOrder);

    const payload: Partial<DiscountCodeRow> = {
      code: editing.requireCode ? editing.code.trim() || null : null,
      description: editing.description.trim() || null,
      active: editing.active,
      type: editing.type,
      value: valueNum,
      min_order: minOrderNum,
      expires_at: editing.expiresAt
        ? new Date(editing.expiresAt).toISOString()
        : null,
      require_code: editing.requireCode,
      apply_scope: editing.applyScope,
      include_categories:
        editing.applyScope === "include_categories"
          ? parseList(editing.includeCategories)
          : null,
      exclude_categories:
        editing.applyScope === "exclude_categories"
          ? parseList(editing.excludeCategories)
          : null,
      include_products:
        editing.applyScope === "include_products"
          ? parseList(editing.includeProducts)
          : null,
      exclude_products:
        editing.applyScope === "exclude_products"
          ? parseList(editing.excludeProducts)
          : null,
      restaurant_id: restaurantId,
    };

    try {
      if (editing.id) {
        const { error } = await supabase
          .from("discount_codes")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("discount_codes")
          .insert(payload);
        if (error) throw error;
      }

      // odśwież listę
      const { data: codes, error: codesErr } = await supabase
        .from("discount_codes")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false });

      if (codesErr) {
        setError("Zapisano, ale nie udało się odświeżyć listy.");
      } else {
        setRows((codes || []) as DiscountCodeRow[]);
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
        <h2 className="text-lg font-semibold">
          Promocje i kody rabatowe
        </h2>
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
          Brak zdefiniowanych rabatów dla tego lokalu.
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
                <th className="px-3 py-2">Zakres</th>
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
                    {row.apply_scope === "include_categories" &&
                      "tylko kategorie (include)"}
                    {row.apply_scope === "exclude_categories" &&
                      "wszystko oprócz kategorii (exclude)"}
                    {row.apply_scope === "include_products" &&
                      "tylko produkty (include)"}
                    {row.apply_scope === "exclude_products" &&
                      "wszystko oprócz produktów (exclude)"}
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
                <option value="include_categories">
                  Tylko wybrane kategorie
                </option>
                <option value="exclude_categories">
                  Wszystko oprócz kategorii
                </option>
                <option value="include_products">
                  Tylko wybrane produkty
                </option>
                <option value="exclude_products">
                  Wszystko oprócz produktów
                </option>
              </select>
            </label>

            {(editing.applyScope === "include_categories" ||
              editing.applyScope === "exclude_categories") && (
              <label className="flex flex-col gap-1 md:col-span-2">
                <span>
                  Kategorie (slug/nazwa, po przecinku lub w nowych liniach)
                </span>
                <textarea
                  className="rounded-md border px-2 py-1 min-h-[60px]"
                  value={
                    editing.applyScope === "include_categories"
                      ? editing.includeCategories
                      : editing.excludeCategories
                  }
                  onChange={(e) =>
                    handleChange(
                      editing.applyScope === "include_categories"
                        ? "includeCategories"
                        : "excludeCategories",
                      e.target.value
                    )
                  }
                />
              </label>
            )}

            {(editing.applyScope === "include_products" ||
              editing.applyScope === "exclude_products") && (
              <label className="flex flex-col gap-1 md:col-span-2">
                <span>
                  Produkty (slug/nazwa, po przecinku lub w nowych liniach)
                </span>
                <textarea
                  className="rounded-md border px-2 py-1 min-h-[60px]"
                  value={
                    editing.applyScope === "include_products"
                      ? editing.includeProducts
                      : editing.excludeProducts
                  }
                  onChange={(e) =>
                    handleChange(
                      editing.applyScope === "include_products"
                        ? "includeProducts"
                        : "excludeProducts",
                      e.target.value
                    )
                  }
                />
              </label>
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
