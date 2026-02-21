// src/components/mobile/MobileAppShell.tsx
"use client";

import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import useCartStore from "@/store/cartStore";
import { useMobileNavStore } from "@/store/mobileNavStore";
import MobileBottomNav, { type MobileTab } from "./MobileBottomNav";
import MobileBottomSheet from "./MobileBottomSheet";

// Dynamiczny import widoków zakładek
const MobileHeroView = dynamic(
  () => import("./MobileHeroView"),
  {
    ssr: false,
    loading: () => <MobileViewSkeleton />,
  }
);

const MobileMenuView = dynamic(
  () => import("./MobileMenuView"),
  {
    ssr: false,
    loading: () => <MobileViewSkeleton />,
  }
);

const MobileSetView = dynamic(
  () => import("./MobileSetView"),
  {
    ssr: false,
    loading: () => <MobileViewSkeleton />,
  }
);

// Dynamiczny import zawartości koszyka
const MobileCartContent = dynamic(
  () => import("./MobileCartContent"),
  { ssr: false }
);

// Dynamiczny import zawartości konta
const MobileAccountContent = dynamic(
  () => import("./MobileAccountContent"),
  { ssr: false }
);

// Dynamiczny import modalu rezerwacji
const ReservationModal = dynamic(
  () => import("@/components/ReservationModal"),
  { ssr: false }
);

function MobileViewSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
    </div>
  );
}

interface MobileAppShellProps {
  children?: React.ReactNode;
}

export default function MobileAppShell({ children }: MobileAppShellProps) {
  // Globalny store dla nawigacji mobile
  const activeTab = useMobileNavStore((s) => s.activeTab);
  const setActiveTab = useMobileNavStore((s) => s.setActiveTab);
  const cartOpen = useMobileNavStore((s) => s.cartOpen);
  const setCartOpen = useMobileNavStore((s) => s.setCartOpen);
  const accountOpen = useMobileNavStore((s) => s.accountOpen);
  const setAccountOpen = useMobileNavStore((s) => s.setAccountOpen);
  const reservationOpen = useMobileNavStore((s) => s.reservationOpen);
  const setReservationOpen = useMobileNavStore((s) => s.setReservationOpen);

  // Cart store
  const items = useCartStore((s) => s.items);
  const cartCount = useMemo(
    () => items.reduce((n, i) => n + (i.quantity || 1), 0),
    [items]
  );

  const handleTabChange = useCallback((tab: MobileTab) => {
    // Zamknij wszystkie otwarte modale/sheety przed zmianą
    setCartOpen(false);
    setAccountOpen(false);
    setReservationOpen(false);
    
    if (tab === "cart") {
      setCartOpen(true);
    } else if (tab === "account") {
      setAccountOpen(true);
    } else if (tab === "reservation") {
      setReservationOpen(true);
    } else {
      setActiveTab(tab);
    }
  }, [setActiveTab, setCartOpen, setAccountOpen, setReservationOpen]);

  const goToMenu = useCallback(() => {
    setActiveTab("menu");
  }, [setActiveTab]);

  const closeCart = useCallback(() => {
    setCartOpen(false);
  }, [setCartOpen]);

  const closeAccount = useCallback(() => {
    setAccountOpen(false);
  }, [setAccountOpen]);

  // Swipe gesture handling
  const tabs: MobileTab[] = ["home", "menu", "set"];
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Nie obsługuj swipe gdy otwarte są modale
    if (cartOpen || accountOpen || reservationOpen) return;
    
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  }, [cartOpen, accountOpen, reservationOpen]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (cartOpen || accountOpen || reservationOpen) return;
    
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    
    // Tylko gdy ruch jest bardziej poziomy niż pionowy
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      isSwiping.current = true;
    }
  }, [cartOpen, accountOpen, reservationOpen]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (cartOpen || accountOpen || reservationOpen) return;
    if (!isSwiping.current) return;
    
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const threshold = 80; // Minimalna odległość swipe
    
    if (Math.abs(deltaX) < threshold) return;
    
    const currentIndex = tabs.indexOf(activeTab as MobileTab);
    if (currentIndex === -1) return;
    
    if (deltaX > 0 && currentIndex > 0) {
      // Swipe w prawo - poprzednia zakładka
      setActiveTab(tabs[currentIndex - 1]);
    } else if (deltaX < 0 && currentIndex < tabs.length - 1) {
      // Swipe w lewo - następna zakładka
      setActiveTab(tabs[currentIndex + 1]);
    }
    
    isSwiping.current = false;
  }, [activeTab, setActiveTab, cartOpen, accountOpen, reservationOpen]);

  // Determine which MobileTab to show in bottom nav (hero maps to none being active)
  const displayActiveTab = activeTab === "home" ? undefined : activeTab;

  return (
    <div className="md:hidden flex flex-col h-[100dvh] overflow-hidden bg-[#0b0b0b]">
      {/* Main content area - scrollable within bounds */}
      <main 
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {activeTab === "home" && <MobileHeroView onGoToMenu={goToMenu} />}
        {activeTab === "menu" && <MobileMenuView />}
        {activeTab === "set" && <MobileSetView />}
      </main>

      {/* Bottom Navigation - zawsze widoczna */}
      <MobileBottomNav
        activeTab={displayActiveTab as MobileTab}
        onTabChange={handleTabChange}
        cartCount={cartCount}
      />

      {/* Cart Bottom Sheet */}
      <MobileBottomSheet
        isOpen={cartOpen}
        onClose={closeCart}
        title="Twój koszyk"
        height="full"
      >
        {cartOpen && <MobileCartContent onClose={closeCart} />}
      </MobileBottomSheet>

      {/* Account Bottom Sheet */}
      <MobileBottomSheet
        isOpen={accountOpen}
        onClose={closeAccount}
        showHeader={false}
        height="full"
      >
        {accountOpen && <MobileAccountContent onClose={closeAccount} />}
      </MobileBottomSheet>

      {/* Reservation Modal */}
      {reservationOpen && (
        <ReservationModal
          isOpen={reservationOpen}
          onClose={() => setReservationOpen(false)}
        />
      )}
    </div>
  );
}