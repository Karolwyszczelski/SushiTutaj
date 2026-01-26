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
    <div className="mt-3">
      <h4 className="font-semibold text-black mb-2">
        {promo && !promo.require_code ? "Promocja" : "Kod promocyjny"}
      </h4>
      <div className="flex gap-2">
        <input
          type="text"
          value={localCode}
          onChange={(e) => setLocalCode(e.target.value)}
          placeholder="Wpisz kod"
          className="flex-1 border border-black/15 rounded-xl px-3 py-2 text-sm bg-white"
          disabled={isManual}
        />
        {isManual ? (
          <button
            onClick={onClear}
            className="px-3 py-2 rounded-xl text-sm border border-black/15"
          >
            Usuń
          </button>
        ) : (
          <button
            onClick={handleApply}
            className={`px-3 py-2 rounded-xl text-sm font-semibold ${accentBtn}`}
          >
            Zastosuj
          </button>
        )}
      </div>
      {promoError && <p className="text-xs text-red-600 mt-1">{promoError}</p>}
      {promo && (
        <p className="text-xs text-green-700 mt-1">
          {promo.require_code ? (
            <>
              Zastosowano kod <b>{promo.code}</b> —{" "}
            </>
          ) : (
            <>Zastosowano promocję automatyczną — </>
          )}
          {promo.type === "percent"
            ? `${promo.value}%`
            : `${promo.value.toFixed(2)} zł`}{" "}
          rabatu.
        </p>
      )}
    </div>
  );
}

/* ---------- Main ---------- */
