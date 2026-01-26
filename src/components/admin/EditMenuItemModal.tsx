// src/components/admin/EditMenuItemModal.tsx

"use client";

import React, { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import Image from "next/image";
import productsData from "@/data/product.json";

// Lokalny typ zamiast importu ze strony admin/menu
type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string;
  subcategory?: string | null;
  description?: string | null;
  ingredients: string[];
  imageUrl?: string | null;
};

interface FormValues {
  name: string;
  price: number;
  category: string;
  subcategory?: string;
  description?: string;
  imageFile?: FileList;
  ingredients: { value: string }[];
}

interface Props {
  item: MenuItem;
  onClose(): void;
  onSave(item: MenuItem): void;
}

export default function EditMenuItemModal({ item, onClose, onSave }: Props) {
  const { register, handleSubmit, control, watch, reset } = useForm<FormValues>({
    defaultValues: {
      name: item.name,
      price: item.price,
      category: item.category,
      subcategory: item.subcategory ?? undefined,
      description: item.description ?? undefined,
      imageFile: undefined,
      ingredients: (item.ingredients || []).map((v) => ({ value: v })),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "ingredients",
  });

  const selectedCat = watch("category");

  const [subcats, setSubcats] = useState<string[]>([]);

  useEffect(() => {
    reset({
      name: item.name,
      price: item.price,
      category: item.category,
      subcategory: item.subcategory ?? undefined,
      description: item.description ?? undefined,
      imageFile: undefined,
      ingredients: (item.ingredients || []).map((v) => ({ value: v })),
    });
  }, [item, reset]);

  useEffect(() => {
    const cat = productsData.find((c) => c.category === selectedCat);
    setSubcats(cat?.subcategories?.map((s: any) => s.name) ?? []);
  }, [selectedCat]);

  // podgląd
  const [preview, setPreview] = useState<string | null>(item.imageUrl ?? null);
  const fileList = watch("imageFile");

  useEffect(() => {
    if (!fileList || fileList.length === 0) {
      setPreview(item.imageUrl ?? null);
      return;
    }
    const url = URL.createObjectURL(fileList[0]);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [fileList, item.imageUrl]);

  const onSubmit = (data: FormValues) => {
    onSave({
      ...item,
      name: data.name,
      price: data.price,
      category: data.category,
      subcategory: data.subcategory ?? null,
      description: data.description ?? null,
      imageUrl: preview ?? undefined,
      ingredients: data.ingredients.map((i) => i.value),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-lg w-full max-w-3xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2 flex justify-between items-center">
          <h2 className="text-2xl font-semibold">Edytuj pozycję</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* lewa */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm">Nowe zdjęcie (PNG)</label>
            <input
              type="file"
              accept="image/png"
              {...register("imageFile")}
              className="mt-1"
            />
          </div>
          {preview && (
            <Image
              src={preview}
              alt="Podgląd"
              width={1200}
              height={900}
              className="w-full h-auto rounded border"
              unoptimized
            />
          )}
          <div>
            <label className="block text-sm">Składniki</label>
            <ul className="space-y-2 mt-1">
              {fields.map((f, idx) => (
                <li key={f.id} className="flex items-center gap-2">
                  <input
                    {...register(`ingredients.${idx}.value` as const, {
                      required: true,
                    })}
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
              className="text-blue-600 text-sm hover:underline"
            >
              + Dodaj składnik
            </button>
          </div>
        </div>

        {/* prawa */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
              {...register("price", { required: true })}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm">Kategoria</label>
            <select
              {...register("category", { required: true })}
              className="mt-1 w-full border rounded px-3 py-2"
            >
              <option value="">– wybierz –</option>
              {productsData.map((c: any) => (
                <option key={c.category} value={c.category}>
                  {c.category}
                </option>
              ))}
            </select>
          </div>
          {subcats.length > 0 && (
            <div>
              <label className="block text-sm">Podkategoria</label>
              <select
                {...register("subcategory")}
                className="mt-1 w-full border rounded px-3 py-2"
              >
                <option value="">– brak –</option>
                {subcats.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="md:col-span-2">
            <label className="block text-sm">Opis</label>
            <textarea
              {...register("description")}
              rows={3}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded"
            >
              Anuluj
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              Zapisz zmiany
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
