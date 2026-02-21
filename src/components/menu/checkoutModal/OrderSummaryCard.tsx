"use client";

import React from "react";
import { ChopsticksControl } from "./ChopsticksControl";
import { PromoSection } from "./PromoSection";
import type { Promo } from "./shared";

interface OrderSummaryCardProps {
  baseTotal: number;
  packagingCost: number;
  deliveryCost: number;
  discount: number;
  totalWithDelivery: number;
  selectedOption: "delivery" | "takeaway" | null;
  deliveryEta?: string;
  chopsticksQty: number;
  onChopsticksChange: (qty: number) => void;
  promo: Promo;
  promoError: string | null;
  onApplyPromo: (code: string) => Promise<void>;
  onClearPromo: () => void;
}

const pln = (v: number) =>
  `${Number(v || 0).toFixed(2).replace(".", ",")} zł`;

export function OrderSummaryCard({
  baseTotal,
  packagingCost,
  deliveryCost,
  discount,
  totalWithDelivery,
  selectedOption,
  deliveryEta,
  chopsticksQty,
  onChopsticksChange,
  promo,
  promoError,
  onApplyPromo,
  onClearPromo,
}: OrderSummaryCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 lg:border-black/10 bg-white/5 lg:bg-white p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">Podsumowanie cen</h4>
        {selectedOption === "delivery" && deliveryEta ? (
          <span className="text-[11px] text-white/60 lg:text-black/60">ETA: {deliveryEta}</span>
        ) : null}
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-white/70 lg:text-black/70">Produkty</span>
          <span className="font-semibold">{pln(baseTotal)}</span>
        </div>

        {selectedOption ? (
          <div className="flex items-center justify-between">
            <span className="text-white/70 lg:text-black/70">Opakowanie</span>
            <span className="font-semibold">{pln(packagingCost)}</span>
          </div>
        ) : null}

        {selectedOption === "delivery" ? (
          <div className="flex items-center justify-between">
            <span className="text-white/70 lg:text-black/70">Dostawa</span>
            <span className="font-semibold">{pln(deliveryCost)}</span>
          </div>
        ) : null}

        {discount > 0 ? (
          <div className="flex items-center justify-between">
            <span className="text-white/70 lg:text-black/70">Rabat</span>
            <span className="font-semibold text-green-700">-{pln(discount)}</span>
          </div>
        ) : null}

        <div className="h-px bg-white/10 lg:bg-black/10 my-2" />

        <div className="flex items-center justify-between text-base">
          <span className="font-semibold">Do zapłaty</span>
          <span className="font-bold">{pln(totalWithDelivery)}</span>
        </div>
      </div>

      <div className="pt-1">
        <ChopsticksControl value={chopsticksQty} onChange={onChopsticksChange} />
      </div>

      <PromoSection
        promo={promo}
        promoError={promoError}
        onApply={onApplyPromo}
        onClear={onClearPromo}
      />

      <div className="text-[11px] text-white/60 lg:text-black/60">
        Ceny zawierają VAT.{" "}
        {selectedOption === "delivery"
          ? "Płatność: gotówka u kierowcy."
          : "Płatność: gotówka przy odbiorze."}
      </div>
    </div>
  );
}
