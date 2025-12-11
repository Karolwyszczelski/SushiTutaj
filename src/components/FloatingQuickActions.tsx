// src/components/FloatingQuickActions.tsx
"use client";

import { useState } from "react";
import {
  Calendar,
  ShoppingCart,
  User,
  MoreHorizontal,
  ChevronUp,
} from "lucide-react";
import clsx from "clsx";
import { usePathname } from "next/navigation";
import useCartStore from "@/store/cartStore";
import ReservationModal from "@/components/ReservationModal";
import AccountModal from "@/components/account/AccountModal";

export default function FloatingQuickActions() {
  const pathname = usePathname();

  // cart store
  const toggleCart = useCartStore((s) => (s as any).toggleCart);
  const openCheckoutModal = useCartStore((s) => (s as any).openCheckoutModal);
  const isCheckoutOpen = useCartStore((s) => (s as any).isCheckoutOpen);
  const items = useCartStore((s) => s.items);
  const itemCount = items.reduce(
    (n: number, i: any) => n + (i.quantity || 1),
    0
  );

  // ui
  const [open, setOpen] = useState(false);
  const [showReservation, setShowReservation] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  // MOBILE drawer state
  const [mobileExpanded, setMobileExpanded] = useState(true);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchDeltaY, setTouchDeltaY] = useState(0);

  const openCart = () => {
    if (typeof openCheckoutModal === "function") openCheckoutModal();
    else if (typeof toggleCart === "function") toggleCart();
  };

  const handleMobileTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (!mobileExpanded) return; // gest drag tylko gdy panel jest otwarty
    const y = e.touches[0]?.clientY;
    if (typeof y === "number") {
      setTouchStartY(y);
      setTouchDeltaY(0);
    }
  };

  const handleMobileTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (!mobileExpanded || touchStartY === null) return;
    const y = e.touches[0]?.clientY;
    if (typeof y !== "number") return;
    const delta = y - touchStartY;
    if (delta > 0) {
      setTouchDeltaY(delta);
    }
  };

  const handleMobileTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
    if (!mobileExpanded) {
      setTouchStartY(null);
      setTouchDeltaY(0);
      return;
    }
    if (touchDeltaY > 60) {
      setMobileExpanded(false);
    }
    setTouchStartY(null);
    setTouchDeltaY(0);
  };

  const mobilePanelTransform = mobileExpanded
    ? `translateY(${touchDeltaY}px)`
    : "translateY(120%)";

  const mobilePanelTransition =
    touchStartY !== null ? "none" : "transform 0.25s ease-out";

  /** 
   * WARUNKI UKRYCIA:
   * - strona główna ("/") – nie pokazujemy przycisku,
   * - otwarty CheckoutModal – chowamy quick actions pod modale z zamówieniem.
   */
  if (pathname === "/" || isCheckoutOpen) {
    return null;
  }

  return (
    <>
      {/* DESKTOP */}
      <div className="hidden md:flex fixed right-6 bottom-6 z-[60] flex-row-reverse items-center pointer-events-none">
        {/* FAB */}
        <button
          aria-label="Szybkie akcje"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={clsx(
            "pointer-events-auto w-14 h-14 rounded-full grid place-items-center shadow-xl relative",
            "bg-gradient-to-br from-[var(--accent-red-dark,#7a0d0d)] via-[var(--accent-red,#a61b1b)] to-[var(--accent-red-dark-2,#b11212)]",
            "text-white transition-transform duration-300",
            open ? "rotate-90" : "rotate-0"
          )}
        >
          <MoreHorizontal className="w-6 h-6" />
          {itemCount > 0 && (
            <span
              className="absolute -top-1 -right-1 z-[61] text-[11px] leading-none font-bold text-white
                             bg-[var(--accent-red,#a61b1b)] rounded-full w-5 h-5 grid place-items-center pointer-events-none"
            >
              {itemCount}
            </span>
          )}
        </button>

        {/* Panel ikon */}
        <div
          className={clsx(
            "mr-7 pointer-events-auto transition-all duration-200 overflow-visible",
            open ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 pointer-events-none"
          )}
        >
          <div className="rounded-full bg-white/95 backdrop-blur px-2 py-2 shadow-2xl flex items-center gap-2">
            <button
              onClick={() => setShowAccount(true)}
              className="group w-11 h-11 rounded-full bg-white flex items-center justify-center hover:bg-black/5"
              aria-label="Panel klienta"
              title="Panel klienta"
            >
              <User className="w-5 h-5 text-black group-hover:scale-110 transition-transform" />
            </button>

            <button
              onClick={() => setShowReservation(true)}
              className="group w-11 h-11 rounded-full bg-white flex items-center justify-center hover:bg-black/5"
              aria-label="Rezerwacja"
              title="Rezerwacja"
            >
              <Calendar className="w-5 h-5 text-black group-hover:scale-110 transition-transform" />
            </button>

            {/* Koszyk */}
            <button
              onClick={openCart}
              className="group relative w-11 h-11 rounded-full bg-white flex items-center justify-center hover:bg-black/5"
              aria-label="Koszyk"
              title="Koszyk"
              data-testid="quick-cart-btn"
            >
              <ShoppingCart className="w-5 h-5 text-black group-hover:scale-110 transition-transform" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 z-[61] text-[10px] leading-none font-bold text-white bg-[var(--accent-red,#a61b1b)] rounded-full w-4 h-4 grid place-items-center">
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE — dolny panel jako „drawer” */}
      <div
        className="md:hidden fixed inset-x-0 z-[60] flex justify-center"
        style={{
          bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          transform: mobilePanelTransform,
          transition: mobilePanelTransition,
        }}
        onTouchStart={handleMobileTouchStart}
        onTouchMove={handleMobileTouchMove}
        onTouchEnd={handleMobileTouchEnd}
      >
        <div className="relative rounded-full bg-white/95 backdrop-blur px-2.5 py-2 shadow-2xl flex items-center gap-3">
          {/* Uchwyt / strzałka do schowania (gdy jest wysunięty) */}
          <button
            type="button"
            aria-label="Schowaj szybkie akcje"
            onClick={() => setMobileExpanded(false)}
            className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-4 rounded-full bg-white/80 shadow flex items-center justify-center"
          >
            <span className="block w-6 h-[2px] rounded-full bg-black/40" />
          </button>

          <button
            onClick={() => setShowAccount(true)}
            className="group w-11 h-11 rounded-full bg-white flex items-center justify-center hover:bg-black/5"
            aria-label="Panel klienta"
          >
            <User className="w-5 h-5 text-black group-hover:scale-110 transition-transform" />
          </button>
          <button
            onClick={() => setShowReservation(true)}
            className="group w-11 h-11 rounded-full bg-white flex items-center justify-center hover:bg-black/5"
            aria-label="Rezerwacja"
          >
            <Calendar className="w-5 h-5 text-black group-hover:scale-110 transition-transform" />
          </button>
          <button
            onClick={openCart}
            className="group relative w-11 h-11 rounded-full bg-white flex items-center justify-center hover:bg-black/5"
            aria-label="Koszyk"
            data-testid="quick-cart-btn-mobile"
          >
            <ShoppingCart className="w-5 h-5 text-black group-hover:scale-110 transition-transform" />
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 z-[61] text-[10px] leading-none font-bold text-white bg-[var(--accent-red,#a61b1b)] rounded-full w-4 h-4 grid place-items-center">
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* MOBILE — gdy drawer jest zamknięty, pokazujemy strzałkę + koszyk w prawym dolnym rogu */}
      {!mobileExpanded && (
        <div
          className="md:hidden fixed z-[61] flex flex-col items-center gap-1"
          style={{
            right: "16px",
            bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <button
            type="button"
            aria-label="Wysuń panel szybkich akcji"
            onClick={() => setMobileExpanded(true)}
            className="w-8 h-6 rounded-full bg-white/90 shadow flex items-center justify-center"
          >
            <ChevronUp className="w-4 h-4 text-black/60" />
          </button>

          <button
            className="rounded-full w-14 h-14 grid place-items-center shadow-2xl
                       bg-gradient-to-br from-[var(--accent-red-dark,#7a0d0d)] via-[var(--accent-red,#a61b1b)] to-[var(--accent-red-dark-2,#b11212)]
                       text-white"
            aria-label="Koszyk"
            onClick={openCart}
          >
            <div className="relative">
              <ShoppingCart className="w-6 h-6" />
              {itemCount > 0 && (
                <span className="absolute -top-2 -right-2 z-[62] text-[11px] leading-none font-bold text-white bg-black/80 rounded-full w-5 h-5 grid place-items-center">
                  {itemCount}
                </span>
              )}
            </div>
          </button>
        </div>
      )}

      {/* Modale */}
      {showReservation && (
        <ReservationModal
          isOpen={showReservation}
          onClose={() => setShowReservation(false)}
        />
      )}
      <AccountModal open={showAccount} onClose={() => setShowAccount(false)} />
    </>
  );
}
