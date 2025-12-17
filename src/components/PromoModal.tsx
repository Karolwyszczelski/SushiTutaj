"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import Image from "next/image";

type PromoData = {
  active?: boolean | null;
  title?: string | null;
  content?: string | null;
  image_url?: string | null;
};

export default function PromoModal({
  data,
  restaurantId,
}: {
  data: PromoData;
  restaurantId?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Jeśli popup nie jest aktywny w bazie, nic nie rób
    if (!data?.active) return;

    // Sprawdź, czy użytkownik już go zamknął w tej sesji
    const storageKey = `promo_seen_${restaurantId || "global"}`;
    const seen = sessionStorage.getItem(storageKey);

    if (!seen) {
      // Małe opóźnienie dla lepszego efektu wejścia
      const timer = setTimeout(() => setIsOpen(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [data, restaurantId]);

  const handleClose = () => {
    setIsOpen(false);
    // Zapisz w sesji, że zamknięto (zniknie po zamknięciu karty)
    if (restaurantId) {
      sessionStorage.setItem(`promo_seen_${restaurantId}`, "true");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Tło (backdrop) */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={handleClose} 
      />

      {/* Kontent modala */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-300">
        
        {/* Przycisk zamknięcia */}
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/10 text-black hover:bg-black/20 transition"
        >
          <X size={20} />
        </button>

        {/* Opcjonalny obrazek */}
        {data.image_url && (
          <div className="relative h-64 w-full bg-gray-100">
            <Image
              src={data.image_url}
              alt={data.title || "Promocja"}
              fill
              className="object-cover"
            />
          </div>
        )}

        {/* Tekst */}
        <div className="p-6 text-center">
          {data.title && (
            <h3 className="mb-2 text-2xl font-bold text-gray-900">
              {data.title}
            </h3>
          )}
          
          {data.content && (
            <div className="prose prose-sm mx-auto text-gray-600 whitespace-pre-wrap">
              {data.content}
            </div>
          )}

          <button
            onClick={handleClose}
            className="mt-6 w-full rounded-xl bg-[#de1d13] py-3 text-sm font-bold text-white hover:opacity-90 transition"
          >
            Super, sprawdzam!
          </button>
        </div>
      </div>
    </div>
  );
}