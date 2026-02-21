// src/components/mobile/MobileCartContent.tsx
"use client";

import React, { useMemo } from "react";
import { ShoppingBag, Trash2, Plus, Minus } from "lucide-react";
import useCartStore from "@/store/cartStore";

interface MobileCartContentProps {
  onClose: () => void;
}

const ACCENT = "[background:linear-gradient(180deg,#b31217_0%,#7a0b0b_100%)]";

export default function MobileCartContent({ onClose }: MobileCartContentProps) {
  const items = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const removeWholeItem = useCartStore((s) => s.removeWholeItem);
  const addItem = useCartStore((s) => s.addItem);
  const openCheckoutModal = useCartStore((s) => (s as any).openCheckoutModal);
  const closeCheckoutModal = useCartStore((s) => (s as any).closeCheckoutModal);

  const total = useMemo(() => {
    return items.reduce((sum, item) => {
      const price = typeof item.price === "number" 
        ? item.price 
        : parseFloat(String(item.price).replace(",", ".")) || 0;
      return sum + price * (item.quantity || 1);
    }, 0);
  }, [items]);

  const itemCount = useMemo(
    () => items.reduce((n, i) => n + (i.quantity || 1), 0),
    [items]
  );

  const handleIncrease = (item: typeof items[0]) => {
    addItem({
      id: item.id,
      product_id: item.product_id,
      name: item.name,
      price: item.price,
      quantity: 1,
    });
  };

  const handleDecrease = (item: typeof items[0]) => {
    removeItem(item.lineId);
  };

  const handleRemove = (item: typeof items[0]) => {
    removeWholeItem(item.lineId);
  };

  const handleCheckout = () => {
    onClose();
    // Otwórz pełny modal checkout
    setTimeout(() => {
      if (typeof openCheckoutModal === "function") {
        openCheckoutModal();
      }
    }, 300);
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 pb-24">
        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <ShoppingBag className="w-10 h-10 text-white/30" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">
          Twój koszyk jest pusty
        </h3>
        <p className="text-sm text-white/60 text-center mb-6">
          Dodaj coś pysznego z naszego menu
        </p>
        <button
          type="button"
          onClick={onClose}
          className={`px-6 py-3 rounded-full text-white text-sm font-medium ${ACCENT}`}
        >
          Przeglądaj menu
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          {items.map((item) => {
            const price = typeof item.price === "number" 
              ? item.price 
              : parseFloat(String(item.price).replace(",", ".")) || 0;
            const itemTotal = price * (item.quantity || 1);

            return (
              <div
                key={item.lineId}
                className="bg-white/5 rounded-xl p-3 flex gap-3"
              >
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-white truncate">
                    {item.name}
                  </h4>
                  {item.addons && item.addons.length > 0 && (
                    <p className="text-xs text-white/50 mt-0.5 truncate">
                      + {item.addons.join(", ")}
                    </p>
                  )}
                  <p className="text-sm font-semibold text-white mt-1">
                    {itemTotal.toFixed(2)} zł
                  </p>
                </div>

                {/* Quantity controls */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDecrease(item)}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                    aria-label="Zmniejsz ilość"
                  >
                    <Minus className="w-4 h-4 text-white" />
                  </button>
                  <span className="w-6 text-center text-sm font-medium text-white">
                    {item.quantity || 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleIncrease(item)}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                    aria-label="Zwiększ ilość"
                  >
                    <Plus className="w-4 h-4 text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(item)}
                    className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center hover:bg-red-500/30 transition-colors ml-1"
                    aria-label="Usuń z koszyka"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer with total and checkout button */}
      <div className="border-t border-white/10 p-4 bg-[#0b0b0b]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-white/60">Razem ({itemCount} {itemCount === 1 ? 'pozycja' : itemCount < 5 ? 'pozycje' : 'pozycji'})</p>
            <p className="text-xl font-bold text-white">{total.toFixed(2)} zł</p>
          </div>
        </div>
        
        <button
          type="button"
          onClick={handleCheckout}
          className={`w-full py-3.5 rounded-full text-white text-sm font-semibold ${ACCENT} shadow-lg`}
        >
          Przejdź do zamówienia
        </button>
      </div>
    </div>
  );
}
