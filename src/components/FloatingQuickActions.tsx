// src/components/FloatingQuickActions.tsx
"use client";

import { useState } from "react";
import { Calendar, ShoppingCart, User, MoreHorizontal } from "lucide-react";
import clsx from "clsx";
import useCartStore from "@/store/cartStore";
import ReservationModal from "@/components/ReservationModal";
import AccountModal from "@/components/account/AccountModal";

export default function FloatingQuickActions() {
  // cart store
  const toggleCart = useCartStore((s) => (s as any).toggleCart);
  const openCheckoutModal = useCartStore((s) => (s as any).openCheckoutModal);
  const items = useCartStore((s) => s.items);
  const itemCount = items.reduce((n: number, i: any) => n + (i.quantity || 1), 0);

  // ui
  const [open, setOpen] = useState(false);
  const [showReservation, setShowReservation] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  const openCart = () => {
    if (typeof openCheckoutModal === "function") openCheckoutModal();
    else if (typeof toggleCart === "function") toggleCart();
  };

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
            <span className="absolute -top-1 -right-1 z-[61] text-[11px] leading-none font-bold text-white
                             bg-[var(--accent-red,#a61b1b)] rounded-full w-5 h-5 grid place-items-center pointer-events-none">
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

      {/* MOBILE — kompakt */}
      <div
        className="md:hidden fixed inset-x-0 z-[60] flex justify-center"
        style={{ bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="rounded-full bg-white/95 backdrop-blur px-2.5 py-2 shadow-2xl flex items-center gap-3">
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

      {/* Modale */}
      {showReservation && (
        <ReservationModal isOpen={showReservation} onClose={() => setShowReservation(false)} />
      )}
      <AccountModal open={showAccount} onClose={() => setShowAccount(false)} />
    </>
  );
}
