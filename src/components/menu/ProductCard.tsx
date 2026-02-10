"use client";

import { Plus } from "lucide-react";
import useCartStore from "@/store/cartStore";

interface Product {
  name: string;
  price: number;
  description?: string;
  // skład może przyjść jako tablica lub string
  ingredients?: string[] | string | null;
}

interface ProductCardProps {
  product: Product;
  index: number;
}

function parseIngredients(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

/** Rozdziela tekst na główny opis i informacje dodatkowe (zaczynające się od + lub "Wersja") */
function splitDescription(text: string): { main: string; extras: string[] } {
  const extras: string[] = [];
  let main = text;
  
  // 1. Szukamy wzorca "Wersja pieczona +X zł" (może być z kropką lub bez, na końcu lub w środku)
  const versionPattern = /\.?\s*Wersja\s+pieczona\s*\+?\s*\d*\s*z[łl]?\.?/gi;
  const versionMatches = main.match(versionPattern);
  if (versionMatches) {
    versionMatches.forEach(match => {
      main = main.replace(match, '');
      // Czyścimy i normalizujemy
      const cleaned = match.replace(/^\.?\s*/, '').replace(/\.?\s*$/, '').trim();
      if (cleaned) extras.push(cleaned);
    });
  }
  
  // 2. Szukamy wzorców: "+6x ... za X zł" lub "+6x ... za X zł!"
  const plusPattern = /(\+\d+x?\s+[^.+]+(?:za\s+\d+\s*z[łl]!?)?)/gi;
  const plusMatches = main.match(plusPattern);
  if (plusMatches) {
    plusMatches.forEach(match => {
      main = main.replace(match, '');
      extras.unshift(match.trim()); // Na początek, przed "Wersja pieczona"
    });
  }
  
  // Usuń podwójne spacje, kropki i przecinki na końcu
  main = main.replace(/[,.\s]+$/, '').replace(/\s+/g, ' ').trim();
  
  return { main, extras };
}

export default function ProductCard({ product, index }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const isFirst = index === 0;

  const handleAddToCart = () => {
    addItem({ name: product.name, price: product.price });
  };

  const ing = parseIngredients(product.ingredients);
  const rawText = ing.length ? ing.join(", ") : (product.description ?? "");
  const { main: mainText, extras } = splitDescription(rawText);

  if (isFirst) {
    // --- PIERWSZA KARTA ---
    return (
      <div
        onClick={handleAddToCart}
        className="
          relative p-4 min-h-[220px] rounded-2xl bg-yellow-400 text-black
          transition-all duration-300 group hover:scale-105 hover:shadow-lg
          cursor-pointer h-full flex flex-col
        "
      >
        <div
          className="
            absolute top-3 left-3 w-10 h-10 rounded-full flex items-center justify-center
            text-xs font-bold bg-black text-white transition-colors duration-300
            group-hover:bg-white group-hover:text-black
          "
        >
          {product.price} zł
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); handleAddToCart(); }}
          className="
            absolute bottom-3 right-3 w-8 h-8 rounded-full flex items-center justify-center
            bg-black text-white transition-colors duration-300 hover:bg-white hover:text-black
          "
          aria-label="Dodaj do koszyka"
        >
          <Plus size={16} />
        </button>

        <h3 className="mt-14 text-sm font-extrabold uppercase leading-tight">
          {product.name}
        </h3>

        {mainText && (
          <p className="mt-1 text-xs leading-tight">
            {mainText}
          </p>
        )}
        {extras.length > 0 && (
          <div className="mt-2 pt-2 border-t border-black/20 space-y-1">
            {extras.map((extra, i) => (
              <p key={i} className="text-xs leading-tight font-medium">
                {extra}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- POZOSTAŁE KARTY ---
  return (
    <div
      onClick={handleAddToCart}
      className="
        relative p-4 min-h-[220px] rounded-2xl bg-transparent border border-white
        transition-all duration-300 group hover:scale-105 hover:shadow-lg hover:bg-yellow-400
        text-white cursor-pointer h-full flex flex-col
      "
    >
      <div
        className="
          absolute top-3 left-3 w-10 h-10 rounded-full flex items-center justify-center
          text-xs font-bold bg-black text-white transition-colors duration-300
          group-hover:bg-white group-hover:text-black
        "
      >
        {product.price} zł
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); handleAddToCart(); }}
        className="
          absolute bottom-3 right-3 w-8 h-8 rounded-full flex items-center justify-center
          bg-white text-black transition-colors duration-300 group-hover:bg-black group-hover:text-white
        "
        aria-label="Dodaj do koszyka"
      >
        <Plus size={16} />
      </button>

      <h3
        className="
          mt-14 text-sm font-extrabold uppercase leading-tight
          text-yellow-400 group-hover:text-black
        "
      >
        {product.name}
      </h3>

      {mainText && (
        <p className="mt-1 text-xs leading-tight group-hover:text-black">
          {mainText}
        </p>
      )}
      {extras.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/20 group-hover:border-black/20 space-y-1">
          {extras.map((extra, i) => (
            <p key={i} className="text-xs leading-tight font-medium text-yellow-400 group-hover:text-black">
              {extra}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
