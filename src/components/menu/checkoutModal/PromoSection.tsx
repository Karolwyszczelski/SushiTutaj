"use client";

import React, { useDeferredValue, useState, useCallback, useEffect } from "react";

import type { Promo } from "./shared";
import { accentBtn } from "./shared";

export function PromoSection({
  promo,
  promoError,
  onApply,
  onClear,
}: {
  promo: Promo;
  promoError: string | null;
  onApply: (code: string) => void;
  onClear: () => void;
}) {
  const [localCode, setLocalCode] = useState("");
  const deferred = useDeferredValue(localCode);
  const handleApply = useCallback(() => onApply(deferred), [deferred, onApply]);
  const isManual = promo?.require_code ?? false;

  useEffect(() => {
    if (promo && promo.require_code && promo.code) {
      setLocalCode(promo.code);
    } else if (!promo) {
      setLocalCode("");
    }
  }, [promo]);

  return (
    <div className="mt-4 rounded-2xl border border-white/5 lg:border-black/10 bg-white/[0.02] lg:bg-gray-50 p-4">
      <h4 className="font-semibold text-sm text-white lg:text-black mb-3 flex items-center gap-2">
        <svg className="w-5 h-5 text-[#a61b1b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
        </svg>
        {promo && !promo.require_code ? "Promocja aktywna" : "Kod promocyjny"}
      </h4>
      <div className="flex gap-2">
        <input
          type="text"
          value={localCode}
          onChange={(e) => setLocalCode(e.target.value)}
          placeholder="Wpisz kod rabatowy"
          className="flex-1 border border-white/10 lg:border-black/10 rounded-xl px-4 py-3 text-sm bg-white/5 lg:bg-white text-white lg:text-black placeholder:text-white/40 lg:placeholder:text-black/40 focus:outline-none focus:border-[#a61b1b]/50"
          disabled={isManual}
        />
        {isManual ? (
          <button
            onClick={onClear}
            className="px-4 py-3 rounded-xl text-sm font-medium border border-white/10 lg:border-black/10 text-white/70 lg:text-black/70 hover:bg-white/10 lg:hover:bg-black/5 transition-colors"
          >
            Usuń
          </button>
        ) : (
          <button
            onClick={handleApply}
            className="px-5 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#c41e1e] to-[#8a1414] hover:shadow-lg hover:shadow-red-500/20 transition-all active:scale-[0.98]"
          >
            Zastosuj
          </button>
        )}
      </div>
      {promoError && (
        <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {promoError}
        </p>
      )}
      {promo && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-sm text-emerald-400 flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            {promo.require_code ? (
              <span>Kod <b>{promo.code}</b> — </span>
            ) : (
              <span>Promocja automatyczna — </span>
            )}
            <span className="font-bold">
              {promo.type === "percent"
                ? `${promo.value}%`
                : `${promo.value.toFixed(2)} zł`}{" "}
              rabatu
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------- Main ---------- */
