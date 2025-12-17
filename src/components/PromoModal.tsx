"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import Image from "next/image";

type PromoData = {
  active?: boolean | null;
  title?: string | null;
  content?: string | null;
  image_url?: string | null;
  // Nowe pola
  btn_type?: string | null; // 'close' | 'link' | 'call'
  btn_label?: string | null;
  btn_url?: string | null;
};

export default function PromoModal({
  data,
  restaurantId,
  restaurantPhone, // Przekażemy numer telefonu restauracji jako fallback
}: {
  data: PromoData;
  restaurantId?: string;
  restaurantPhone?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!data?.active) return;

    const storageKey = `promo_seen_${restaurantId || "global"}`;
    const seen = sessionStorage.getItem(storageKey);

    if (!seen) {
      const timer = setTimeout(() => setIsOpen(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [data, restaurantId]);

  const handleClose = () => {
    setIsOpen(false);
    if (restaurantId) {
      sessionStorage.setItem(`promo_seen_${restaurantId}`, "true");
    }
  };

  if (!isOpen) return null;

  // Logika przycisku
  const btnType = data.btn_type || "close";
  const btnLabel = data.btn_label || "Zamknij";
  // Jeśli typ to 'call', używamy wpisanego numeru LUB domyślnego numeru lokalu
  let href = "#";
  if (btnType === "link") {
    href = data.btn_url || "#";
  } else if (btnType === "call") {
    const phoneToCall = data.btn_url || restaurantPhone || "";
    href = `tel:${phoneToCall.replace(/\s+/g, "")}`;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={handleClose} 
      />

      {/* Kontent */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-300 max-h-[90vh] flex flex-col">
        
        {/* Przycisk X (zawsze widoczny) */}
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 transition backdrop-blur-md"
        >
          <X size={20} />
        </button>

        {/* Sekcja przewijalna (gdyby zdjęcie + tekst były wyższe niż ekran) */}
        <div className="overflow-y-auto custom-scrollbar">
          
          {/* ZDJĘCIE - POPRAWIONE SKALOWANIE */}
          {/* Używamy w-full h-auto, aby zdjęcie zachowało proporcje i nie było ucięte */}
          {data.image_url && (
            <div className="w-full relative bg-gray-100">
              <Image
                src={data.image_url}
                alt={data.title || "Promocja"}
                width={800} // Dajemy dużą szerokość bazową
                height={600} // I wysokość bazową
                className="w-full h-auto object-contain" // Kluczowe dla RWD bez ucinania
                unoptimized={true}
              />
            </div>
          )}

          {/* Tekst */}
          <div className="p-6 text-center">
            {data.title && (
              <h3 className="mb-2 text-2xl font-bold text-gray-900 leading-tight">
                {data.title}
              </h3>
            )}
            
            {data.content && (
              <div className="prose prose-sm mx-auto text-gray-600 whitespace-pre-wrap mb-6">
                {data.content}
              </div>
            )}

            {/* PRZYCISK AKCJI */}
            {btnType === "close" ? (
              <button
                onClick={handleClose}
                className="w-full rounded-xl bg-gray-200 py-3 text-sm font-bold text-gray-800 hover:bg-gray-300 transition"
              >
                {btnLabel}
              </button>
            ) : (
              <a
                href={href}
                onClick={btnType === "link" ? handleClose : undefined} // Zamykamy modal przy przejściu do linku
                target={btnType === "link" ? "_self" : undefined} // Linki wewnętrzne w tym samym oknie
                className="block w-full rounded-xl bg-[#de1d13] py-3 text-sm font-bold text-white hover:opacity-90 transition shadow-lg shadow-red-200"
              >
                {btnLabel}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}