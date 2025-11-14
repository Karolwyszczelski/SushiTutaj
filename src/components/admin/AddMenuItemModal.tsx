// src/components/admin/AddMenuItemModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import productsData from "@/data/product.json";
import type { MenuItem } from "@/app/admin/menu/page";

interface FormValues {
  name: string;
  price: number;
  category: string;
  subcategory?: string;
  description?: string;
  ingredients: { value: string }[];
}

interface Props {
  onClose(): void;
  onSave(item: MenuItem): void;
}

export default function AddMenuItemModal({ onClose, onSave }: Props) {
  const { register, handleSubmit, control, watch } = useForm<FormValues>({
    defaultValues: {
      name: "",
      price: 0,
      category: "",
      subcategory: "",
      description: "",
      ingredients: [{ value: "" }],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "ingredients",
  });

  // categories & dynamic subcats
  const allCats = productsData.map((c) => c.category);
  const selCat = watch("category");
  const subcats =
    productsData.find((c) => c.category === selCat)?.subcategories?.map((s) => s.name) ??
    [];

  const onSubmit = async (data: FormValues) => {
    const payload = {
      name: data.name,
      price: data.price,
      category: data.category,
      subcategory: data.subcategory || null,
      description: data.description || null,
      ingredients: data.ingredients.map((i) => i.value),
    };
    const res = await fetch("/api/menu_items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      alert("Błąd zapisu: " + err.error);
      return;
    }
    const created: MenuItem = await res.json();
    onSave(created);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="relative bg-white p-6 rounded-lg shadow-lg w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        {/* HEADER */}
        <div className="md:col-span-2 flex justify-between items-center">
          <h2 className="text-2xl font-semibold">Dodaj pozycję</h2>
          <button type="button" onClick={onClose} className="text-gray-500">
            ✕
          </button>
        </div>

        {/* LEFT: ingredients */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm">Składniki</label>
            <ul className="space-y-2 mt-1">
              {fields.map((f, idx) => (
                <li key={f.id} className="flex items-center gap-2">
                  <input
                    {...register(`ingredients.${idx}.value` as const, {
                      required: true,
                    })}
                    placeholder={`Składnik ${idx + 1}`}
                    className="flex-1 border rounded px-2 py-1"
                  />
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="text-red-600"
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => append({ value: "" })}
              className="mt-2 text-sm text-blue-600 hover:underline"
            >
              + Dodaj składnik
            </button>
          </div>
        </div>

        {/* RIGHT: fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm">Nazwa</label>
            <input
              {...register("name", { required: true })}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm">Cena (zł)</label>
            <input
              type="number"
              step="0.01"
              {...register("price", { required: true, min: 0 })}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm">Kategoria</label>
            <input
              list="cat-list"
              {...register("category", { required: true })}
              className="mt-1 w-full border rounded px-3 py-2"
              placeholder="Wybierz lub wpisz nową"
            />
            <datalist id="cat-list">
              {allCats.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-sm">Podkategoria</label>
            <input
              list="subcat-list"
              {...register("subcategory")}
              className="mt-1 w-full border rounded px-3 py-2"
              placeholder={subcats.length ? "Wybierz lub wpisz nową" : "Brak podkategorii"}
              disabled={!selCat}
            />
            <datalist id="subcat-list">
              {subcats.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-sm">Opis</label>
            <textarea
              {...register("description")}
              rows={3}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>
        </div>

        {/* FOOTER */}
        <div className="md:col-span-2 flex justify-end gap-2 pt-4 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded">
            Anuluj
          </button>
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">
            Zapisz
          </button>
        </div>
      </form>
    </div>
  );
}
