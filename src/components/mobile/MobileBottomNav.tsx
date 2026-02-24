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

/* ── inline chopstick icon for center button ── */
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

// Kolejność: Zestaw, Rezerwacja, MENU (środek), Koszyk, Konto
const TABS: {
  id: MobileTab;
  label: string;
  icon: typeof Gift;
  isCenter?: boolean;
}[] = [
  { id: "set", label: "Zestaw", icon: Gift },
  { id: "reservation", label: "Rezerwacja", icon: CalendarDays },
  { id: "menu", label: "Menu", icon: Gift /* placeholder, center uses custom */, isCenter: true },
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
      style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}
    >
      {/* top shadow gradient — replaces hard border */}
      <div
        className="absolute inset-x-0 -top-6 h-6 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(11,11,11,0.85) 0%, transparent 100%)",
        }}
      />

      {/* glass-like bar */}
      <div className="relative bg-[#0d0d0d]/95 backdrop-blur-md border-t border-white/[0.06]">
        <div className="flex items-end justify-around h-[64px] px-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const showBadge = tab.id === "cart" && cartCount > 0;
            const isCenter = tab.isCenter;

            /* ── center elevated Menu button ── */
            if (isCenter) {
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className="flex flex-col items-center justify-end flex-1 pb-1.5 -mt-5 group active:scale-[0.92] transition-transform"
                  aria-label={tab.label}
                  aria-current={isActive ? "page" : undefined}
                >
                  {/* outer subtle ring */}
                  <div className="relative">
                    <div
                      className={clsx(
                        "absolute -inset-[3px] rounded-full transition-opacity duration-300",
                        isActive ? "opacity-100" : "opacity-0"
                      )}
                      style={{
                        background:
                          "linear-gradient(135deg, #c41e1e 0%, #7a0d0d 100%)",
                        filter: "blur(6px)",
                      }}
                    />
                    <div
                      className={clsx(
                        "relative w-[52px] h-[52px] rounded-full flex items-center justify-center transition-all duration-200",
                        isActive
                          ? "bg-gradient-to-br from-[#c41e1e] to-[#8a1414] shadow-[0_4px_20px_rgba(166,27,27,0.5)]"
                          : "bg-gradient-to-br from-[#a61b1b] to-[#7a0d0d] shadow-[0_2px_12px_rgba(0,0,0,0.6)]"
                      )}
                    >
                      <ChopsticksIcon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <span
                    className={clsx(
                      "text-[10px] font-semibold mt-1 tracking-wide transition-colors",
                      isActive ? "text-white" : "text-white/60"
                    )}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            }

            /* ── regular tab ── */
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={clsx(
                  "flex flex-col items-center justify-end flex-1 pb-1.5 gap-[3px] relative",
                  "active:scale-[0.90] transition-all duration-150"
                )}
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
              >
                <div className="relative">
                  <Icon
                    className={clsx(
                      "w-[21px] h-[21px] transition-all duration-200",
                      isActive ? "text-white" : "text-white/40"
                    )}
                    strokeWidth={isActive ? 2.4 : 1.6}
                    {...(isActive && tab.id !== "cart"
                      ? { fill: "currentColor", fillOpacity: 0.15 }
                      : {})}
                  />
                  {showBadge && (
                    <span
                      className={clsx(
                        "absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-[5px]",
                        "flex items-center justify-center",
                        "text-[9px] font-bold text-white",
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
                    "text-[10px] tracking-wide transition-colors duration-200",
                    isActive
                      ? "text-white font-semibold"
                      : "text-white/40 font-normal"
                  )}
                >
                  {tab.label}
                </span>

                {/* active dot indicator */}
                <span
                  className={clsx(
                    "absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transition-all duration-200",
                    isActive
                      ? "bg-[#c41e1e] opacity-100 scale-100"
                      : "bg-transparent opacity-0 scale-0"
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
