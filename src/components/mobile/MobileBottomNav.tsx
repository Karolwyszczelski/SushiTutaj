// src/components/mobile/MobileBottomNav.tsx
"use client";

import { Gift, ShoppingCart, User, CalendarDays } from "lucide-react";
import clsx from "clsx";

export type MobileTab = "set" | "reservation" | "menu" | "cart" | "account";

interface MobileBottomNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  cartCount: number;
}

/* ── Chopsticks icon for center button ── */
function ChopsticksIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="8" y1="3" x2="14" y2="21" />
      <line x1="16" y1="3" x2="10" y2="21" />
      <circle cx="12" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

const SIDE_TABS: { id: MobileTab; label: string; icon: typeof Gift }[] = [
  { id: "set", label: "Zestaw", icon: Gift },
  { id: "reservation", label: "Rezerwacja", icon: CalendarDays },
];

const RIGHT_TABS: { id: MobileTab; label: string; icon: typeof Gift }[] = [
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
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Bar background — floating pill */}
      <div className="mx-3 mb-2 relative">
        {/* Shadow underneath */}
        <div className="absolute inset-0 rounded-[22px] bg-black/60 blur-xl -z-10 scale-[0.95] translate-y-1" />

        <div className="relative bg-[#161616] rounded-[22px] border border-white/[0.06] overflow-visible">
          <div className="flex items-center h-[62px] px-1">
            {/* Left tabs */}
            {SIDE_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className="flex flex-col items-center justify-center flex-1 gap-1 active:scale-90 transition-transform"
                  aria-label={tab.label}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon
                    className={clsx(
                      "w-[20px] h-[20px] transition-colors duration-150",
                      isActive ? "text-white" : "text-white/35"
                    )}
                    strokeWidth={isActive ? 2.2 : 1.5}
                  />
                  <span
                    className={clsx(
                      "text-[9px] tracking-wide transition-colors duration-150",
                      isActive ? "text-white font-semibold" : "text-white/35"
                    )}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}

            {/* Center — elevated Menu FAB */}
            <div className="flex-1 flex justify-center">
              <button
                type="button"
                onClick={() => onTabChange("menu")}
                className="relative -mt-7 group active:scale-90 transition-transform"
                aria-label="Menu"
                aria-current={activeTab === "menu" ? "page" : undefined}
              >
                {/* Glow ring */}
                <div
                  className={clsx(
                    "absolute inset-0 rounded-full transition-opacity duration-300",
                    activeTab === "menu" ? "opacity-60" : "opacity-0"
                  )}
                  style={{
                    background: "radial-gradient(circle, rgba(196,30,30,0.5) 0%, transparent 70%)",
                    transform: "scale(1.6)",
                  }}
                />
                {/* Button */}
                <div
                  className={clsx(
                    "relative w-[54px] h-[54px] rounded-full flex items-center justify-center",
                    "bg-[#c41e1e] shadow-[0_4px_20px_rgba(196,30,30,0.45)]",
                    "ring-[3px] ring-[#161616]"
                  )}
                >
                  <ChopsticksIcon className="w-6 h-6 text-white" />
                </div>
                <span
                  className={clsx(
                    "block text-[9px] font-semibold text-center mt-1 tracking-wide transition-colors",
                    activeTab === "menu" ? "text-white" : "text-white/50"
                  )}
                >
                  Menu
                </span>
              </button>
            </div>

            {/* Right tabs */}
            {RIGHT_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const showBadge = tab.id === "cart" && cartCount > 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className="flex flex-col items-center justify-center flex-1 gap-1 active:scale-90 transition-transform"
                  aria-label={tab.label}
                  aria-current={isActive ? "page" : undefined}
                >
                  <div className="relative">
                    <Icon
                      className={clsx(
                        "w-[20px] h-[20px] transition-colors duration-150",
                        isActive ? "text-white" : "text-white/35"
                      )}
                      strokeWidth={isActive ? 2.2 : 1.5}
                    />
                    {showBadge && (
                      <span
                        className={clsx(
                          "absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-[4px]",
                          "flex items-center justify-center",
                          "text-[8px] font-bold text-white",
                          "bg-[#c41e1e] rounded-full",
                          "shadow-[0_2px_6px_rgba(196,30,30,0.5)]",
                          "nav-badge-pop"
                        )}
                      >
                        {cartCount > 99 ? "99+" : cartCount}
                      </span>
                    )}
                  </div>
                  <span
                    className={clsx(
                      "text-[9px] tracking-wide transition-colors duration-150",
                      isActive ? "text-white font-semibold" : "text-white/35"
                    )}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
