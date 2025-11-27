// src/store/cartStore.ts
import { create } from "zustand";

export interface CartItem {
  /** ID produktu z bazy (Supabase) – opcjonalne */
  id?: string;
  /** Alias na ID produktu – używane przy payloadzie zamówienia */
  product_id?: string;
  /** Nazwa bazowa (np. oryginalna rolka w zestawie) – opcjonalnie */
  baseName?: string;

  /** Nazwa pozycji widoczna w koszyku */
  name: string;
  /** Cena jednostkowa (może być number albo string z bazy) */
  price: number | string;
  /** Ilość sztuk w koszyku */
  quantity?: number;

  /** Dodatki (sosy, „Ryba pieczona”, Tempura itd.) */
  addons?: string[];
  /** Zamiany składników / rolek w zestawie */
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

  addAddon: (name: string, addon: string) => void;
  removeAddon: (name: string, addon: string) => void;
  /** Zamiana składnika/rolki w zestawie – nadpisuje istniejącą zamianę dla danego `from` */
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
      // Łączymy pozycje po nazwie – jeśli nazwa ta sama, zwiększamy quantity
      const existing = state.items.find((i) => i.name === item.name);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.name === item.name
              ? {
                  ...i,
                  quantity: (i.quantity || 1) + (item.quantity || 1),
                }
              : i
          ),
        };
      }

      // Nowa pozycja w koszyku
      return {
        items: [
          ...state.items,
          {
            ...item,
            quantity: item.quantity || 1,
            addons: item.addons || [],
            swaps: item.swaps || [],
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
    set((state) => ({
      items: state.items.filter((item) => item.name !== name),
    })),

  addAddon: (name, addon) =>
    set((state) => ({
      items: state.items.map((i) => {
        if (i.name !== name) return i;
        const addons = Array.isArray(i.addons) ? i.addons : [];
        if (addons.includes(addon)) return i;
        return { ...i, addons: [...addons, addon] };
      }),
    })),

  removeAddon: (name, addon) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.name === name
          ? {
              ...i,
              addons: (i.addons || []).filter((a) => a !== addon),
            }
          : i
      ),
    })),

  swapIngredient: (name, from, to) =>
    set((state) => ({
      items: state.items.map((i) => {
        if (i.name !== name) return i;

        const swaps = Array.isArray(i.swaps) ? i.swaps : [];
        const fromLc = (from || "").toLowerCase();

        // Usuwamy poprzednią zamianę dla tego samego `from` i dokładamy aktualną
        const nextSwaps = [
          ...swaps.filter(
            (s) =>
              !s ||
              typeof s.from !== "string" ||
              s.from.toLowerCase() !== fromLc
          ),
          { from, to },
        ];

        return { ...i, swaps: nextSwaps };
      }),
    })),

  removeSwap: (name, swapIndex) =>
    set((state) => ({
      items: state.items.map((i) => {
        if (i.name !== name) return i;
        const swaps = Array.isArray(i.swaps) ? i.swaps : [];
        if (swapIndex < 0 || swapIndex >= swaps.length) return i;
        const nextSwaps = [...swaps];
        nextSwaps.splice(swapIndex, 1);
        return { ...i, swaps: nextSwaps };
      }),
    })),

  toggleCart: () =>
    set((state) => ({
      isOpen: !state.isOpen,
    })),

  clearCart: () =>
    set({
      items: [],
    }),

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
