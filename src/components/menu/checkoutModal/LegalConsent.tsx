"use client";

import React from "react";
import { TERMS_VERSION } from "./shared";

interface LegalConsentProps {
  legalAccepted: boolean;
  onLegalChange: (checked: boolean) => void;
  confirmCityOk: boolean;
  onConfirmCityChange: (checked: boolean) => void;
  restaurantCityLabel: string;
  openHoursLabel: string;
}

export function LegalConsent({
  legalAccepted,
  onLegalChange,
  confirmCityOk,
  onConfirmCityChange,
  restaurantCityLabel,
  openHoursLabel,
}: LegalConsentProps) {
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-xs leading-5 text-white lg:text-black">
        <input
          type="checkbox"
          checked={legalAccepted}
          onChange={(e) => onLegalChange(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Akceptuję{" "}
          <a
            href="/legal/regulamin"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[#de1d13] visited:text-[#de1d13] hover:opacity-80"
          >
            Regulamin
          </a>{" "}
          oraz{" "}
          <a
            href="/legal/polityka-prywatnosci"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[#de1d13] visited:text-[#de1d13] hover:opacity-80"
          >
            Politykę prywatności
          </a>{" "}
          (v{TERMS_VERSION}).
        </span>
      </label>

      <label className="flex items-start gap-2 text-xs leading-5 text-white lg:text-black">
        <input
          type="checkbox"
          checked={confirmCityOk}
          onChange={(e) => onConfirmCityChange(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Uwaga: składasz zamówienie do restauracji w{" "}
          <b>{restaurantCityLabel}</b>. Potwierdzam, że to prawidłowe miasto.
        </span>
      </label>

      <p className="text-[11px] text-white/60 lg:text-black/60">
        Dzisiejsze godziny w {restaurantCityLabel}: {openHoursLabel}
      </p>
    </div>
  );
}
