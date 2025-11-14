// src/store/cartStore.ts
import { create } from 'zustand';

export interface CartItem {
  name: string;
  price: number;
  quantity?: number;

  // Nowe pola
  meatType?: "wołowina" | "kurczak";
  extraMeatCount?: number;
  addons?: string[];
  swaps?: { from: string; to: string }[];
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  isCheckoutOpen: boolean;
  checkoutStep: number;

  addItem: (item: CartItem) => void;
  removeItem: (name: string) => void;
  removeWholeItem: (name: string) => void;
  changeMeatType: (name: string, newMeat: "wołowina"|"kurczak") => void;
  addExtraMeat: (name: string) => void;
  removeExtraMeat: (name: string) => void;
  addAddon: (name: string, addon: string) => void;
  removeAddon: (name: string, addon: string) => void;
  swapIngredient: (name: string, from: string, to: string) => void;
  removeSwap: (name: string, swapIndex: number) => void;

  toggleCart: () => void;
  clearCart: () => void;
  goToStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  openCheckoutModal: () => void;
  closeCheckoutModal: () => void;
}

const useCartStore = create<CartState>((set) => ({
  items: [],
  isOpen: false,
  isCheckoutOpen: false,
  checkoutStep: 1,

  addItem: (item) =>
    set((state) => {
      const existing = state.items.find((i) => i.name === item.name);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.name === item.name
              ? { ...i, quantity: (i.quantity || 1) + 1 }
              : i
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            ...item,
            quantity: item.quantity || 1,
            meatType: item.meatType || "wołowina",
            extraMeatCount: 0,
            addons: [],
            swaps: []
          },
        ],
      };
    }),

  removeItem: (name) =>
    set((state) => {
      const updatedItems = state.items.reduce<CartItem[]>((acc, item) => {
        if (item.name === name) {
          const newQuantity = (item.quantity || 1) - 1;
          if (newQuantity > 0) {
            acc.push({ ...item, quantity: newQuantity });
          }
        } else {
          acc.push(item);
        }
        return acc;
      }, []);
      return { items: updatedItems };
    }),

  removeWholeItem: (name) =>
    set((state) => {
      const updatedItems = state.items.filter((item) => item.name !== name);
      return { items: updatedItems };
    }),

  changeMeatType: (name, newMeat) =>
    set((state) => {
      const newItems = state.items.map((i) =>
        i.name === name ? { ...i, meatType: newMeat } : i
      );
      return { items: newItems };
    }),

  addExtraMeat: (name) =>
    set((state) => {
      const newItems = state.items.map((i) => {
        if (i.name === name) {
          return { ...i, extraMeatCount: (i.extraMeatCount || 0) + 1 };
        }
        return i;
      });
      return { items: newItems };
    }),

  removeExtraMeat: (name) =>
    set((state) => {
      const newItems = state.items.map((i) => {
        if (i.name === name && i.extraMeatCount && i.extraMeatCount > 0) {
          return { ...i, extraMeatCount: i.extraMeatCount - 1 };
        }
        return i;
      });
      return { items: newItems };
    }),

  addAddon: (name, addon) =>
    set((state) => {
      const newItems = state.items.map((i) => {
        if (i.name === name) {
          return {
            ...i,
            addons: i.addons?.includes(addon)
              ? i.addons
              : [...(i.addons || []), addon]
          };
        }
        return i;
      });
      return { items: newItems };
    }),

  removeAddon: (name, addon) =>
    set((state) => {
      const newItems = state.items.map((i) => {
        if (i.name === name) {
          return {
            ...i,
            addons: i.addons?.filter((a) => a !== addon)
          };
        }
        return i;
      });
      return { items: newItems };
    }),

  swapIngredient: (name, from, to) =>
    set((state) => {
      const newItems = state.items.map((i) => {
        if (i.name === name) {
          return {
            ...i,
            swaps: [...(i.swaps || []), { from, to }]
          };
        }
        return i;
      });
      return { items: newItems };
    }),

  removeSwap: (name, swapIndex) =>
    set((state) => {
      const newItems = state.items.map((i) => {
        if (i.name === name) {
          const newSwaps = [...(i.swaps || [])];
          newSwaps.splice(swapIndex, 1);
          return { ...i, swaps: newSwaps };
        }
        return i;
      });
      return { items: newItems };
    }),

  toggleCart: () =>
    set((state) => ({
      isOpen: !state.isOpen,
    })),

  clearCart: () => set({ items: [] }),

  goToStep: (step) => set({ checkoutStep: step }),
  nextStep: () => set((state) => ({ checkoutStep: state.checkoutStep + 1 })),
  prevStep: () =>
    set((state) => ({
      checkoutStep: Math.max(1, state.checkoutStep - 1),
    })),

  openCheckoutModal: () => set({ isCheckoutOpen: true }),
  closeCheckoutModal: () => set({ isCheckoutOpen: false }),
}));

export default useCartStore;