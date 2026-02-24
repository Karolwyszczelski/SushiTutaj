// src/components/mobile/MobileBottomNav.tsx
"use client";

import { ShoppingCart, User, CalendarDays, UtensilsCrossed, Sparkles } from "lucide-react";
import clsx from "clsx";

export type MobileTab = "set" | "reservation" | "menu" | "cart" | "account";

interface MobileBottomNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  cartCount: number;
}

const TABS: { id: MobileTab; label: string; icon: typeof ShoppingCart }[] = [
  { id: "set", label: "Zestaw", icon: Sparkles },
  { id: "reservation", label: "Rezerwacja", icon: CalendarDays },
  { id: "menu", label: "Menu", icon: UtensilsCrossed },
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
      className="md:hidden fixed inset-x-0 bottom-0 z-[70]"
    >
      {/* Backdrop blur bar */}
      <div
        className="bg-[#0b0b0b]/80 backdrop-blur-2xl border-t border-white/[0.06]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-end h-[52px]">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const showBadge = tab.id === "cart" && cartCount > 0;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className="flex-1 flex flex-col items-center justify-center gap-[3px] pb-1.5 pt-2 active:opacity-60 transition-opacity"
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
              >
                <div className="relative">
                  <Icon
                    className={clsx(
                      "w-[21px] h-[21px] transition-colors duration-150",
                      isActive ? "text-[#c41e1e]" : "text-white/30"
                    )}
                    strokeWidth={isActive ? 2 : 1.5}
                  />
                  {showBadge && (
                    <span
                      className={clsx(
                        "absolute -top-1 -right-2 min-w-[15px] h-[15px] px-[3px]",
                        "flex items-center justify-center",
                        "text-[8px] font-bold text-white",
                        "bg-[#c41e1e] rounded-full",
                        "nav-badge-pop"
                      )}
                    >
                      {cartCount > 99 ? "99+" : cartCount}
                    </span>
                  )}
                </div>
                <span
                  className={clsx(
                    "text-[10px] transition-colors duration-150",
                    isActive ? "text-[#c41e1e] font-semibold" : "text-white/30"
                  )}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
