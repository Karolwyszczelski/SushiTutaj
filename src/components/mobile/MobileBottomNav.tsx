// src/components/mobile/MobileBottomNav.tsx
"use client";

import { UtensilsCrossed, Gift, ShoppingCart, User, CalendarDays } from "lucide-react";
import clsx from "clsx";

export type MobileTab = "set" | "reservation" | "menu" | "cart" | "account";

interface MobileBottomNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  cartCount: number;
}

// Kolejność: Zestaw, Rezerwacja, MENU (środek), Koszyk, Konto
const TABS: { id: MobileTab; label: string; icon: typeof UtensilsCrossed; isCenter?: boolean }[] = [
  { id: "set", label: "Zestaw", icon: Gift },
  { id: "reservation", label: "Rezerwacja", icon: CalendarDays },
  { id: "menu", label: "Menu", icon: UtensilsCrossed, isCenter: true },
  { id: "cart", label: "Koszyk", icon: ShoppingCart },
  { id: "account", label: "Konto", icon: User },
];

export default function MobileBottomNav({
  activeTab,
  onTabChange,
  cartCount,
}: MobileBottomNavProps) {
  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-[70] bg-[#0b0b0b]/95 backdrop-blur-md border-t border-white/10"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-center justify-around h-16">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const showBadge = tab.id === "cart" && cartCount > 0;
          const isCenter = tab.isCenter;

          // Środkowy przycisk (Menu) - wyróżniony
          if (isCenter) {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className="flex flex-col items-center justify-center flex-1 h-full -mt-4"
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
              >
                <div className={clsx(
                  "w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all",
                  isActive 
                    ? "bg-gradient-to-br from-[#c41e1e] to-[#8a1414] scale-105" 
                    : "bg-gradient-to-br from-[#a61b1b] to-[#7a0d0d]"
                )}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <span className={clsx(
                  "text-[10px] font-bold mt-1",
                  isActive ? "text-white" : "text-white/70"
                )}>
                  {tab.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={clsx(
                "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors relative",
                isActive ? "text-white" : "text-white/50"
              )}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="relative">
                <Icon
                  className={clsx(
                    "w-5 h-5 transition-transform",
                    isActive && "scale-110"
                  )}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-[var(--accent-red,#a61b1b)] rounded-full">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </div>
              <span
                className={clsx(
                  "text-[10px] font-medium transition-colors",
                  isActive ? "text-white" : "text-white/50"
                )}
              >
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-[var(--accent-red-dark,#7a0d0d)] via-[var(--accent-red,#a61b1b)] to-[var(--accent-red-dark-2,#b11212)] rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
