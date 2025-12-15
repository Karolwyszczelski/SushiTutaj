// src/store/cartStore.ts
import { create } from "zustand";

export interface CartItem {
  /** Stabilne ID linii koszyka (nie myli pozycji o tej samej nazwie) */
  lineId?: string;

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

  /** Dodatki (możliwe duplikaty, jeśli allowDuplicate=true) */
  addons?: string[];
  /** Zamiany składników / rolek w zestawie */
  swaps?: { from: string; to: string }[];

  /** Podpis konfiguracji – do łączenia identycznych pozycji */
  signature?: string;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  isCheckoutOpen: boolean;
  checkoutStep: number;

  addItem: (item: CartItem) => void;
  removeItem: (key: string) => void; // key = lineId (zalecane) albo name (legacy)
  removeWholeItem: (key: string) => void; // jw.

  addAddon: (
    key: string,
    addon: string,
    opts?: { allowDuplicate?: boolean }
  ) => void;
  removeAddon: (
    key: string,
    addon: string,
    opts?: { removeOne?: boolean }
  ) => void;

  swapIngredient: (key: string, from: string, to: string) => void;
  removeSwap: (key: string, swapIndex: number) => void;

  toggleCart: () => void;
  clearCart: () => void;
  goToStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  openCheckoutModal: () => void;
  closeCheckoutModal: () => void;
}

/** Bezpieczny generator ID (client-side) */
const genLineId = () => {
  try {
    // @ts-ignore
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `li_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
};

const canonAddons = (addons?: string[]) => {
  const arr = Array.isArray(addons) ? addons.slice() : [];
  // sort utrzymuje duplikaty i daje stabilny podpis
  return arr.map(String).sort((a, b) => a.localeCompare(b)).join("|");
};

const canonSwaps = (swaps?: { from: string; to: string }[]) => {
  const arr = Array.isArray(swaps) ? swaps.slice() : [];
  return arr
    .map((s) => `${String(s?.from ?? "")}→${String(s?.to ?? "")}`)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
};

const makeSignature = (item: CartItem) => {
  const pid = item.product_id || item.id || "";
  const base = item.baseName || "";
  const name = item.name || "";
  const a = canonAddons(item.addons);
  const s = canonSwaps(item.swaps);
  return [pid, base, name, a, s].join("::");
};

const ensureNormalized = (items: CartItem[]) => {
  // uzupełnij lineId/signature oraz złącz identyczne po signature
  const mapped = items.map((it) => {
    const lineId = it.lineId || genLineId();
    const addons = Array.isArray(it.addons) ? it.addons : [];
    const swaps = Array.isArray(it.swaps) ? it.swaps : [];
    const quantity = it.quantity ?? 1;
    const signature = makeSignature({ ...it, lineId, addons, swaps, quantity });
    return { ...it, lineId, addons, swaps, quantity, signature };
  });

  const bySig = new Map<string, CartItem>();
  for (const it of mapped) {
    const sig = it.signature || makeSignature(it);
    const existing = bySig.get(sig);
    if (!existing) {
      bySig.set(sig, it);
    } else {
      bySig.set(sig, {
        ...existing,
        quantity: (existing.quantity || 1) + (it.quantity || 1),
      });
    }
  }
  return Array.from(bySig.values());
};

/** Dopasowanie: najpierw lineId, potem name (legacy) */
const matchKey = (item: CartItem, key: string) =>
  item.lineId === key || item.name === key;

const useCartStore = create<CartState>((set) => ({
  items: [],
  isOpen: false,
  isCheckoutOpen: false,
  checkoutStep: 1,

  addItem: (item) =>
    set((state) => {
      const incoming: CartItem = {
        ...item,
        lineId: item.lineId || genLineId(),
        quantity: item.quantity ?? 1,
        addons: Array.isArray(item.addons) ? item.addons : [],
        swaps: Array.isArray(item.swaps) ? item.swaps : [],
      };
      incoming.signature = makeSignature(incoming);

      const normalized = ensureNormalized([...state.items, incoming]);
      return { items: normalized };
    }),

  removeItem: (key) =>
    set((state) => {
      let removed = false;

      const next = state.items.reduce<CartItem[]>((acc, it) => {
        if (!removed && matchKey(it, key)) {
          removed = true;
          const q = (it.quantity ?? 1) - 1;
          if (q > 0) acc.push({ ...it, quantity: q });
          return acc;
        }
        acc.push(it);
        return acc;
      }, []);

      return { items: ensureNormalized(next) };
    }),

  removeWholeItem: (key) =>
    set((state) => ({
      items: ensureNormalized(state.items.filter((it) => !matchKey(it, key))),
    })),

  addAddon: (key, addon, opts) =>
    set((state) => {
      const next = state.items.map((it) => {
        if (!matchKey(it, key)) return it;

        const addons = Array.isArray(it.addons) ? it.addons : [];
        const exists = addons.includes(addon);

        if (!opts?.allowDuplicate && exists) return it;

        const updated = { ...it, addons: [...addons, addon] };
        updated.signature = makeSignature(updated);
        return updated;
      });

      return { items: ensureNormalized(next) };
    }),

  removeAddon: (key, addon, opts) =>
    set((state) => {
      const next = state.items.map((it) => {
        if (!matchKey(it, key)) return it;

        const addons = Array.isArray(it.addons) ? it.addons : [];
        if (!addons.length) return it;

        let updatedAddons = addons;

        if (opts?.removeOne) {
          const idx = addons.indexOf(addon);
          if (idx === -1) return it;
          updatedAddons = addons.slice();
          updatedAddons.splice(idx, 1);
        } else {
          updatedAddons = addons.filter((a) => a !== addon);
        }

        const updated = { ...it, addons: updatedAddons };
        updated.signature = makeSignature(updated);
        return updated;
      });

      return { items: ensureNormalized(next) };
    }),

  swapIngredient: (key, from, to) =>
    set((state) => {
      const fromLc = (from || "").toLowerCase();

      const next = state.items.map((it) => {
        if (!matchKey(it, key)) return it;

        const swaps = Array.isArray(it.swaps) ? it.swaps : [];
        const nextSwaps = [
          ...swaps.filter(
            (s) =>
              !s ||
              typeof s.from !== "string" ||
              s.from.toLowerCase() !== fromLc
          ),
          { from, to },
        ];

        const updated = { ...it, swaps: nextSwaps };
        updated.signature = makeSignature(updated);
        return updated;
      });

      return { items: ensureNormalized(next) };
    }),

  removeSwap: (key, swapIndex) =>
    set((state) => {
      const next = state.items.map((it) => {
        if (!matchKey(it, key)) return it;

        const swaps = Array.isArray(it.swaps) ? it.swaps : [];
        if (swapIndex < 0 || swapIndex >= swaps.length) return it;

        const nextSwaps = swaps.slice();
        nextSwaps.splice(swapIndex, 1);

        const updated = { ...it, swaps: nextSwaps };
        updated.signature = makeSignature(updated);
        return updated;
      });

      return { items: ensureNormalized(next) };
    }),

  toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

  clearCart: () =>
    set({
      items: [],
      // opcjonalnie (jeśli chcesz): isOpen: false, isCheckoutOpen: false, checkoutStep: 1
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
