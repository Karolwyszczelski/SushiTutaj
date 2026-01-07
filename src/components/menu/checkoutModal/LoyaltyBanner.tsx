"use client";

import React from "react";

interface LoyaltyBannerProps {
  isLoggedIn: boolean;
  loyaltyLoading: boolean;
  loyaltyStickers: number | null;
  canUseLoyalty4: boolean;
  loyalty4AlreadyClaimed: boolean;
  hasAutoLoyaltyDiscount: boolean;
  compact?: boolean;
}

export function LoyaltyBanner({
  isLoggedIn,
  loyaltyLoading,
  loyaltyStickers,
  canUseLoyalty4,
  loyalty4AlreadyClaimed,
  hasAutoLoyaltyDiscount,
  compact = false,
}: LoyaltyBannerProps) {
  if (!isLoggedIn) return null;

  if (loyaltyLoading) {
    return (
      <p className="text-[11px] text-black/60">Sprawdzamy Twoje naklejki...</p>
    );
  }

  if (typeof loyaltyStickers !== "number") return null;

  return (
    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs space-y-2">
      <div className={compact ? "text-center" : ""}>
        Masz <b>{loyaltyStickers}</b> naklejek w programie lojalnościowym.
      </div>

      {canUseLoyalty4 && (
        <div className="rounded-lg bg-emerald-100 border border-emerald-300 p-2 text-emerald-800">
          <div
            className={`font-semibold text-sm flex items-center gap-2 ${
              compact ? "justify-center" : ""
            }`}
          >
            <span>🎁</span>
            <span>
              {compact
                ? "Darmowa rolka zostanie dodana!"
                : "Darmowa rolka zostanie dodana do zamówienia!"}
            </span>
          </div>
          <p
            className={`text-[11px] mt-1 text-emerald-700 ${
              compact ? "text-center" : ""
            }`}
          >
            Wykorzystasz 4 naklejki z programu lojalnościowego.
          </p>
        </div>
      )}

      {loyalty4AlreadyClaimed && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs">
          Masz 4–7 naklejek, ale darmowa rolka została już wykorzystana. Zbieraj
          dalej do 8 naklejek.
        </div>
      )}

      {!canUseLoyalty4 && hasAutoLoyaltyDiscount && (
        <div className={`font-semibold text-sm ${compact ? "text-center" : ""}`}>
          Masz już co najmniej 8 naklejek – rabat lojalnościowy doliczymy przy
          realizacji zamówienia.
        </div>
      )}
    </div>
  );
}
