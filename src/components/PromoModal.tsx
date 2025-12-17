"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import Image from "next/image";

type PromoData = {
  active?: boolean | null;
  title?: string | null;
  content?: string | null;
  image_url?: string | null;
  btn_type?: string | null;
  btn_label?: string | null;
  btn_url?: string | null;
};

export default function PromoModal({
  data,
  restaurantId,
  restaurantPhone,
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

  const btnType = data.btn_type || "close";
  const btnLabel = data.btn_label || "Zamknij";
  
  let href = "#";
  if (btnType === "link") {
    href = data.btn_url || "#";
  } else if (btnType === "call") {
    const phoneToCall = data.btn_url || restaurantPhone || "";
    href = `tel:${phoneToCall.replace(/\s+/g, "")}`;
  }

  return (
    // Z-Index 9999 zapewnia, że jesteśmy nad wszystkim (navbarem, koszykiem itp.)
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
      
      {/* Tło - backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={handleClose} 
      />

      {/* Kontener Modala */}
      <div className="relative w-full max-w-md bg-white shadow-2xl rounded-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 max-h-[85vh]">
        
        {/* Przycisk Zamknięcia - ZAWSZE WIDOCZNY, na górze, z wyraźnym tłem */}
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-md hover:bg-gray-100 transition active:scale-95"
          aria-label="Zamknij"
        >
          <X size={20} />
        </button>

        {/* Przewijalna zawartość */}
        {/* overscroll-contain zapobiega scrollowaniu strony pod spodem na mobile */}
        <div className="overflow-y-auto overscroll-contain custom-scrollbar flex-1">
          
          {/* Obrazek - zachowuje proporcje, nie jest ucinany */}
          {data.image_url && (
            <div className="w-full bg-gray-50 relative">
              <Image
                src={data.image_url}
                alt={data.title || "Promocja"}
                width={800}
                height={600}
                className="w-full h-auto object-contain block"
                unoptimized={true}
              />
            </div>
          )}

          {/* Treść tekstowa */}
          <div className="p-5 sm:p-6 text-center">
            {data.title && (
              <h3 className="mb-3 text-xl sm:text-2xl font-bold text-gray-900 leading-tight">
                {data.title}
              </h3>
            )}
            
            {data.content && (
              <div className="prose prose-sm mx-auto text-gray-600 whitespace-pre-wrap mb-6 leading-relaxed">
                {data.content}
              </div>
            )}

            {/* Przycisk Akcji */}
            <div className="pt-2">
              {btnType === "close" ? (
                <button
                  onClick={handleClose}
                  className="w-full rounded-xl bg-gray-100 py-3.5 text-sm font-bold text-gray-800 hover:bg-gray-200 active:bg-gray-300 transition"
                >
                  {btnLabel}
                </button>
              ) : (
                <a
                  href={href}
                  onClick={btnType === "link" ? handleClose : undefined}
                  target={btnType === "link" ? "_self" : undefined}
                  className="block w-full rounded-xl bg-[#de1d13] py-3.5 text-sm font-bold text-white hover:opacity-90 active:scale-[0.98] transition shadow-lg shadow-red-100"
                >
                  {btnLabel}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}