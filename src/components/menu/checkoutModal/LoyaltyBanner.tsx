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
  selectedFreeRoll?: string | null;
  onOpenFutomakiPicker?: () => void;
}

export function LoyaltyBanner({
  isLoggedIn,
  loyaltyLoading,
  loyaltyStickers,
  canUseLoyalty4,
  loyalty4AlreadyClaimed,
  hasAutoLoyaltyDiscount,
  compact = false,
  selectedFreeRoll,
  onOpenFutomakiPicker,
}: LoyaltyBannerProps) {
  if (!isLoggedIn) return null;

  if (loyaltyLoading) {
    return (
      <p className="text-[11px] text-white/60 lg:text-black/60">Sprawdzamy Twoje naklejki...</p>
    );
  }

  if (typeof loyaltyStickers !== "number") return null;

  return (
    <div className="rounded-xl bg-emerald-50/10 lg:bg-emerald-50 border border-emerald-500/30 lg:border-emerald-200 p-3 text-xs space-y-2">
      <div className={compact ? "text-center" : ""}>
        Masz <b>{loyaltyStickers}</b> naklejek w programie lojalnościowym.
      </div>

      {canUseLoyalty4 && (
        <div className="rounded-lg bg-emerald-100/20 lg:bg-emerald-100 border border-emerald-500/40 lg:border-emerald-300 p-2 text-emerald-400 lg:text-emerald-800 space-y-2">
          <div
            className={`font-semibold text-sm flex items-center gap-2 ${
              compact ? "justify-center" : ""
            }`}
          >
            <span>🎁</span>
            <span>Wybierz darmowe Futomaki!</span>
          </div>
          <p
            className={`text-[11px] text-emerald-400 lg:text-emerald-700 ${
              compact ? "text-center" : ""
            }`}
          >
            Masz 4+ naklejek – wybierz jedną rolkę gratis z programu lojalnościowego.
          </p>
          {onOpenFutomakiPicker && (
            <button
              type="button"
              onClick={onOpenFutomakiPicker}
              className="w-full mt-1 py-2 px-3 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition-colors"
            >
              {selectedFreeRoll ? `Wybrano: ${selectedFreeRoll}` : "Wybierz rolkę →"}
            </button>
          )}
          {!selectedFreeRoll && (
            <p className={`text-[10px] text-red-600 font-medium ${compact ? "text-center" : ""}`}>
              ⚠ Musisz wybrać rolkę, aby kontynuować
            </p>
          )}
        </div>
      )}

      {loyalty4AlreadyClaimed && (
        <div className="rounded-xl bg-amber-50/10 lg:bg-amber-50 border border-amber-500/30 lg:border-amber-200 p-3 text-xs">
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
