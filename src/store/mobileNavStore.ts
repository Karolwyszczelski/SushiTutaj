// src/store/mobileNavStore.ts
import { create } from "zustand";

export type MobileTab = "set" | "reservation" | "menu" | "cart" | "account" | "home";

interface MobileNavState {
  activeTab: MobileTab;
  setActiveTab: (tab: MobileTab) => void;
  
  // Bottom sheets
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  
  accountOpen: boolean;
  setAccountOpen: (open: boolean) => void;
  
  reservationOpen: boolean;
  setReservationOpen: (open: boolean) => void;
}

export const useMobileNavStore = create<MobileNavState>((set) => ({
  activeTab: "home",
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  cartOpen: false,
  setCartOpen: (open) => set({ cartOpen: open }),
  
  accountOpen: false,
  setAccountOpen: (open) => set({ accountOpen: open }),
  
  reservationOpen: false,
  setReservationOpen: (open) => set({ reservationOpen: open }),
}));
