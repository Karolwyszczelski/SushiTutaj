"use client";

import React, { forwardRef } from "react";

interface TurnstileWidgetProps {
  turnstileEnabled: boolean;
  turnstileError: boolean;
}

export const TurnstileWidget = forwardRef<HTMLDivElement, TurnstileWidgetProps>(
  function TurnstileWidget({ turnstileEnabled, turnstileError }, ref) {
    if (!turnstileEnabled) {
      return (
        <p className="text-[11px] text-black/60">
          Weryfikacja Turnstile wyłączona (brak klucza).
        </p>
      );
    }

    return (
      <div className="mt-1">
        <h4 className="font-semibold mb-1">Weryfikacja</h4>
        {turnstileError ? (
          <p className="text-sm text-red-600">
            Nie udało się załadować weryfikacji.
          </p>
        ) : (
          <>
            <div ref={ref} />
            <p className="text-[11px] text-black/60 mt-1">
              Chronimy formularz przed botami.
            </p>
          </>
        )}
      </div>
    );
  }
);
