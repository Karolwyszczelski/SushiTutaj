// src/components/admin/MenuTable.tsx
"use client";

import { useState } from "react";
import { Dialog } from "@headlessui/react";
import { type Database } from "@/types/supabase";
import EditMenuItemModal from "./EditMenuItemModal";
import { Switch } from "@headlessui/react";

type Item = Database["public"]["Tables"]["menu_items"]["Row"] & {
  category: { id: string; name: string };
};

interface MenuTableProps {
  categories: Database["public"]["Tables"]["menu_categories"]["Row"][];
  items: Item[];
}

export default function MenuTable({ categories, items }: MenuTableProps) {
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<Item | null>(null);

  const filtered = filterCat
    ? items.filter((i) => i.category.id === filterCat)
    : items;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <label>Kategoria:&nbsp;</label>
          <select
            value={filterCat || ""}
            onChange={(e) =>
              setFilterCat(e.target.value || null)
            }
            className="border px-2 py-1 rounded"
          >
            <option value="">Wszystkie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setEditItem({} as any /* pusty nowy item */)}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-500"
        >
          + Dodaj pozycję
        </button>
      </div>

      <table className="min-w-full text-left border">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-2">#</th>
            <th className="px-4 py-2">Zdjęcie</th>
            <th className="px-4 py-2">Nazwa</th>
            <th className="px-4 py-2">Cena</th>
            <th className="px-4 py-2">Czas</th>
            <th className="px-4 py-2">Dostępność</th>
            <th className="px-4 py-2">Kolejność</th>
            <th className="px-4 py-2">Akcje</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((it, i) => (
            <tr key={it.id} className="border-t">
              <td className="px-4 py-2">{i + 1}</td>
              <td className="px-4 py-2">
                {it.image_url ? (
                  <img src={it.image_url} className="w-16 h-12 object-cover" />
                ) : (
                  <span className="text-gray-400">brak</span>
                )}
              </td>
              <td className="px-4 py-2">{it.name}</td>
              <td className="px-4 py-2">{it.price.toFixed(2)} zł</td>
              <td className="px-4 py-2">{it.prep_time} min</td>
              <td className="px-4 py-2">
                <Switch
                  checked={it.active}
                  onChange={async (v) => {
                    await fetch(`/api/menu_items/${it.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ active: v }),
                    });
                    // odśwież stronę lub local state
                  }}
                  className={`${
                    it.active ? "bg-green-500" : "bg-gray-300"
                  } relative inline-flex items-center h-6 rounded-full w-11`}
                >
                  <span
                    className={`${
                      it.active ? "translate-x-6" : "translate-x-1"
                    } inline-block w-4 h-4 transform bg-white rounded-full`}
                  />
                </Switch>
              </td>
              <td className="px-4 py-2">{it.order}</td>
              <td className="px-4 py-2">
                <button
                  onClick={() => setEditItem(it)}
                  className="text-blue-600 hover:underline"
                >
                  Edytuj
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Modal edycji */}
      <Dialog
        open={!!editItem}
        onClose={() => setEditItem(null)}
        className="fixed inset-0 z-50 flex items-center justify-center"
      >
        <div className="fixed inset-0 bg-black opacity-30" />
        {editItem && (
          <EditMenuItemModal
            item={editItem!}
            categories={categories}
            onSaved={() => {
              setEditItem(null);
              // opcjonalnie: odśwież dane serwera
            }}
          />
        )}
      </Dialog>
    </>
  );
}
