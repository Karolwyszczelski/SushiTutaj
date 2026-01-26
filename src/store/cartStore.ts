// src/store/cartStore.ts
import { create } from "zustand";

export interface CartItem {
  /** Stabilne ID linii koszyka (nie myli pozycji o tej samej nazwie) */
  lineId: string;

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
  quantity: number;

  /** Dodatki (możliwe duplikaty, jeśli allowDuplicate=true) */
  addons: string[];

  /** Zamiany składników / rolek w zestawie */
  swaps: { from: string; to: string }[];

  /** Podpis konfiguracji – do łączenia identycznych pozycji */
  signature: string;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  isCheckoutOpen: boolean;
  checkoutStep: number;

  addItem: (item: Omit<Partial<CartItem>, "signature"> & Pick<CartItem, "name" | "price">) => void;
  removeItem: (key: string) => void; // key = lineId (zalecane) albo name (legacy)
  removeWholeItem: (key: string) => void; // jw.
  setQuantity: (key: string, quantity: number) => void;

  addAddon: (key: string, addon: string, opts?: { allowDuplicate?: boolean }) => void;
  removeAddon: (key: string, addon: string, opts?: { removeOne?: boolean }) => void;

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

const toNum = (v: number | string) => {
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const canonAddons = (addons?: string[]) => {
  const arr = Array.isArray(addons) ? addons.slice() : [];
  return arr.map(String).sort((a, b) => a.localeCompare(b)).join("|");
};

const canonSwaps = (swaps?: { from: string; to: string }[]) => {
  const arr = Array.isArray(swaps) ? swaps.slice() : [];
  return arr
    .map((s) => `${String(s?.from ?? "")}→${String(s?.to ?? "")}`)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
};

const makeSignature = (item: {
  product_id?: string;
  id?: string;
  baseName?: string;
  name: string;
  addons?: string[];
  swaps?: { from: string; to: string }[];
}) => {
  const pid = item.product_id || item.id || "";
  const base = item.baseName || "";
  const name = item.name || "";
  const a = canonAddons(item.addons);
  const s = canonSwaps(item.swaps);
  return [pid, base, name, a, s].join("::");
};

/** Dopasowanie: najpierw lineId, potem name (legacy) */
const matchKey = (item: CartItem, key: string) => item.lineId === key || item.name === key;

/**
 * Scalenie duplikatów po signature, ALE z zachowaniem lineId pozycji,
 * którą właśnie edytujemy (targetKey).
 */
const mergeDuplicatesKeepTarget = (items: CartItem[], targetKey: string) => {
  const targetIdx = items.findIndex((it) => matchKey(it, targetKey));
  if (targetIdx === -1) return items;

  const target = items[targetIdx];
  const sig = target.signature;

  let qtySum = target.quantity;
  const next: CartItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (i === targetIdx) continue;

    if (it.signature === sig && it.lineId !== target.lineId) {
      qtySum += it.quantity;
      continue; // usuń duplikat
    }
    next.push(it);
  }

  const mergedTarget: CartItem = { ...target, quantity: qtySum };
  // wstaw target w jego oryginalne miejsce (stabilniej dla UI)
  next.splice(targetIdx <= next.length ? targetIdx : next.length, 0, mergedTarget);
  return next;
};

const normalizeItem = (
  raw: Omit<Partial<CartItem>, "signature"> & Pick<CartItem, "name" | "price">
): CartItem => {
  const lineId = raw.lineId || genLineId();
  const quantity = Math.max(1, raw.quantity ?? 1);

  const addons = Array.isArray(raw.addons) ? raw.addons.map(String) : [];
  const swaps = Array.isArray(raw.swaps)
    ? raw.swaps
        .filter(Boolean)
        .map((s) => ({ from: String(s.from ?? ""), to: String(s.to ?? "") }))
    : [];

  const signature = makeSignature({
    product_id: raw.product_id,
    id: raw.id,
    baseName: raw.baseName,
    name: raw.name,
    addons,
    swaps,
  });

  return {
    ...raw,
    lineId,
    quantity,
    addons,
    swaps,
    // cena zostawiamy jako number|string, ale pilnujemy czytelności
    price: typeof raw.price === "number" ? raw.price : String(raw.price),
    signature,
  };
};

const useCartStore = create<CartState>((set) => ({
  items: [],
  isOpen: false,
  isCheckoutOpen: false,
  checkoutStep: 1,

  addItem: (item) =>
    set((state) => {
      const incoming = normalizeItem(item);

      // Łączymy TYLKO na etapie dodawania (to minimalizuje „przeskakiwanie” lineId w UI)
      const idxSameSig = state.items.findIndex((it) => it.signature === incoming.signature);
      if (idxSameSig !== -1) {
        const next = state.items.slice();
        const prev = next[idxSameSig];
        next[idxSameSig] = { ...prev, quantity: prev.quantity + incoming.quantity };
        return { items: next };
      }

      return { items: [...state.items, incoming] };
    }),

  removeItem: (key) =>
    set((state) => {
      const idx = state.items.findIndex((it) => matchKey(it, key));
      if (idx === -1) return state;

      const it = state.items[idx];
      const q = it.quantity - 1;

      const next = state.items.slice();
      if (q > 0) next[idx] = { ...it, quantity: q };
      else next.splice(idx, 1);

      return { items: next };
    }),

  removeWholeItem: (key) =>
    set((state) => ({
      items: state.items.filter((it) => !matchKey(it, key)),
    })),

  setQuantity: (key, quantity) =>
    set((state) => {
      const idx = state.items.findIndex((it) => matchKey(it, key));
      if (idx === -1) return state;

      const q = Math.max(0, Math.floor(quantity || 0));
      const next = state.items.slice();

      if (q === 0) next.splice(idx, 1);
      else next[idx] = { ...next[idx], quantity: q };

      return { items: next };
    }),

  addAddon: (key, addon, opts) =>
    set((state) => {
      const idx = state.items.findIndex((it) => matchKey(it, key));
      if (idx === -1) return state;

      const next = state.items.slice();
      const it = next[idx];

      const addons = it.addons.slice();
      const exists = addons.includes(addon);

      if (!opts?.allowDuplicate && exists) return state;

      addons.push(addon);

      const updated: CartItem = {
        ...it,
        addons,
        signature: makeSignature({
          product_id: it.product_id,
          id: it.id,
          baseName: it.baseName,
          name: it.name,
          addons,
          swaps: it.swaps,
        }),
      };

      next[idx] = updated;

      // jeśli po edycji wyszło identycznie jak inna linia – scal, ale zachowaj edytowane lineId
      return { items: mergeDuplicatesKeepTarget(next, it.lineId) };
    }),

  removeAddon: (key, addon, opts) =>
    set((state) => {
      const idx = state.items.findIndex((it) => matchKey(it, key));
      if (idx === -1) return state;

      const next = state.items.slice();
      const it = next[idx];

      if (!it.addons.length) return state;

      let updatedAddons = it.addons.slice();

      if (opts?.removeOne) {
        const i = updatedAddons.indexOf(addon);
        if (i === -1) return state;
        updatedAddons.splice(i, 1);
      } else {
        updatedAddons = updatedAddons.filter((a) => a !== addon);
      }

      const updated: CartItem = {
        ...it,
        addons: updatedAddons,
        signature: makeSignature({
          product_id: it.product_id,
          id: it.id,
          baseName: it.baseName,
          name: it.name,
          addons: updatedAddons,
          swaps: it.swaps,
        }),
      };

      next[idx] = updated;

      return { items: mergeDuplicatesKeepTarget(next, it.lineId) };
    }),

  swapIngredient: (key, from, to) =>
    set((state) => {
      const idx = state.items.findIndex((it) => matchKey(it, key));
      if (idx === -1) return state;

      const next = state.items.slice();
      const it = next[idx];

      const fromLc = String(from || "").toLowerCase();
      const swaps = it.swaps.slice();

      const filtered = swaps.filter(
        (s) => !(String(s?.from ?? "").toLowerCase() === fromLc)
      );
      filtered.push({ from, to });

      const updated: CartItem = {
        ...it,
        swaps: filtered,
        signature: makeSignature({
          product_id: it.product_id,
          id: it.id,
          baseName: it.baseName,
          name: it.name,
          addons: it.addons,
          swaps: filtered,
        }),
      };

      next[idx] = updated;

      return { items: mergeDuplicatesKeepTarget(next, it.lineId) };
    }),

  removeSwap: (key, swapIndex) =>
    set((state) => {
      const idx = state.items.findIndex((it) => matchKey(it, key));
      if (idx === -1) return state;

      const next = state.items.slice();
      const it = next[idx];

      if (swapIndex < 0 || swapIndex >= it.swaps.length) return state;

      const swaps = it.swaps.slice();
      swaps.splice(swapIndex, 1);

      const updated: CartItem = {
        ...it,
        swaps,
        signature: makeSignature({
          product_id: it.product_id,
          id: it.id,
          baseName: it.baseName,
          name: it.name,
          addons: it.addons,
          swaps,
        }),
      };

      next[idx] = updated;

      return { items: mergeDuplicatesKeepTarget(next, it.lineId) };
    }),

  toggleCart: () =>
    set((state) => ({
      isOpen: !state.isOpen,
      // jeśli otwierasz koszyk – niech checkout się zamknie (typowy UX i mniej konfliktów)
      isCheckoutOpen: state.isOpen ? state.isCheckoutOpen : false,
    })),

  clearCart: () =>
    set({
      items: [],
      isOpen: false,
      isCheckoutOpen: false,
      checkoutStep: 1,
    }),

  goToStep: (step) => set({ checkoutStep: Math.max(1, Math.floor(step || 1)) }),
  nextStep: () => set((state) => ({ checkoutStep: state.checkoutStep + 1 })),
  prevStep: () => set((state) => ({ checkoutStep: Math.max(1, state.checkoutStep - 1) })),

  openCheckoutModal: () =>
    set({
      isCheckoutOpen: true,
      isOpen: false,
      checkoutStep: 1,
    }),

  closeCheckoutModal: () =>
    set({
      isCheckoutOpen: false,
      checkoutStep: 1,
    }),
}));

export default useCartStore;

/** (opcjonalnie) helper, jeśli gdzieś liczysz sumy w checkout */
export const calcCartTotals = (items: CartItem[]) => {
  const subtotal = items.reduce((sum, it) => sum + toNum(it.price) * (it.quantity || 0), 0);
  const count = items.reduce((sum, it) => sum + (it.quantity || 0), 0);
  return { subtotal, count };
};
