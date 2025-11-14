// src/components/admin/CategoryList.tsx
"use client";

import { useState } from "react";
import { type Database } from "@/types/supabase";

interface CategoryListProps {
  categories: Database["public"]["Tables"]["menu_categories"]["Row"][];
}

export default function CategoryList({ categories }: CategoryListProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <nav className="space-y-2">
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => setSelected(cat.id)}
          className={`block w-full text-left px-4 py-2 rounded ${
            selected === cat.id
              ? "bg-gray-800 text-white"
              : "hover:bg-gray-100"
          }`}
        >
          {cat.name}
        </button>
      ))}
      <button
        onClick={() => setSelected(null)}
        className="mt-4 block px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500"
      >
        Wszystkie kategorie
      </button>
    </nav>
  );
}
