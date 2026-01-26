// src/components/EditOrderButton.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import clsx from "clsx";
import { createClient } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";

export type OrderOption = "local" | "takeaway" | "delivery";

export interface EditableItem {
  id?: string | null;
  product_id?: string | null;
  baseName?: string | null;
  name: string;
  price: number;
  quantity: number;
  addons?: string[];
  swaps?: { from: string; to: string }[];
  note?: string;
}

interface EditOrderButtonProps {
  orderId: string;
  currentProducts: any[];
  currentSelectedOption: OrderOption;
  onOrderUpdated: (orderId: string, updatedData?: Partial<any>) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
}

type ProductDb = {
  id: string;
  name: string;
  subcategory: string | null;
  description: string | null;
  price_cents?: number | null;
  price?: number | string | null;
  restaurant_id?: string | null;
};

/* ---------- Supabase ---------- */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ---------- Sushi: sosy / dodatki / zestawy ---------- */
const BASE_SAUCES = [
  "Sos sojowy",
  "Teryiaki",
  "Spicy Mayo",
  "Mango",
  "Sriracha",
  "Żurawina",
];

const BATATA_SAUCES = ["Sos czekoladowy", "Sos toffi"];
const ALL_SAUCES = [...BASE_SAUCES, ...BATATA_SAUCES];

const EXTRAS = ["Tempura", "Płatek sojowy", "Tamago", "Ryba pieczona"];
const SWAP_FEE_NAME = "Zamiana w zestawie";

const EXTRA_PRICES: Record<string, number> = {
  Tempura: 4,
  "Płatek sojowy": 4,
  Tamago: 4,
  "Ryba pieczona": 2,
};

const RAW_SET_BAKE_ALL = "Zamiana całego zestawu na pieczony";
const RAW_SET_BAKE_ALL_LEGACY =
  "Zamiana całego zestawu surowego na pieczony (+5 zł)";
const RAW_SET_BAKE_ROLL_PREFIX = "Zamiana surowej rolki na pieczoną: ";
const SET_ROLL_EXTRA_PREFIX = "Dodatek do rolki: ";
const SET_UPGRADE_ADDON = "Powiększenie zestawu";

const TARTAR_BASES = [
  "Podanie: na awokado",
  "Podanie: na ryżu",
  "Podanie: na chipsach krewetkowych",
];

const SET_BAKE_PRICES: Record<string, number> = {
  "zestaw 2": 2,
  "zestaw 5": 6,
  "zestaw 7": 2,
  "zestaw 10": 2,
  "zestaw 11": 8,
  "zestaw 12": 4,
  "zestaw 13": 8,
};

type SetUpgradeInfo = {
  basePieces: number;
  extraPieces: number;
  totalPieces: number;
  price: number;
};

function parseSetUpgradeInfo(product?: ProductDb | null): SetUpgradeInfo | null {
  if (!product?.description) return null;
  const text = product.description.toLowerCase().replace(",", ".");

  const re =
    /(\d+)\s*szt[^+\d]*\+\s*(\d+)\s*szt\s*za\s*(\d+)\s*zł[^=]*=\s*(\d+)\s*szt/;
  const m = text.match(re);
  if (!m) return null;

  const basePieces = Number(m[1]);
  const extraPieces = Number(m[2]);
  const price = Number(m[3]);
  const totalPieces = Number(m[4]);

  if (
    !Number.isFinite(basePieces) ||
    !Number.isFinite(extraPieces) ||
    !Number.isFinite(price)
  ) {
    return null;
  }

  return { basePieces, extraPieces, totalPieces, price };
}

function getSetUpgradePrice(product?: ProductDb | null): number | null {
  const info = parseSetUpgradeInfo(product || null);
  return info ? info.price : null;
}

function getSetBakePriceForProduct(product?: ProductDb | null): number | null {
  if (!product) return null;
  const name = product.name.toLowerCase();
  for (const key of Object.keys(SET_BAKE_PRICES)) {
    if (name.startsWith(key)) {
      return SET_BAKE_PRICES[key];
    }
  }
  return null;
}

function isSpecialCaliforniaBakedFishProduct(
  name: string,
  description?: string | null
): boolean {
  const text = `${name} ${description || ""}`.toLowerCase();

  const hasSalmon = text.includes("łosoś") || text.includes("losos");
  const isRaw =
    text.includes("surowy") ||
    text.includes("surowe") ||
    text.includes("surowa") ||
    text.includes("surow");
  const hasCrab =
    text.includes("paluszek krabowy") ||
    text.includes("paluszki krabowe") ||
    text.includes("paluszkiem krabowym") ||
    text.includes("krabowy") ||
    text.includes("krab");
  const hasShrimp = text.includes("krewet");

  return hasSalmon && isRaw && hasCrab && hasShrimp;
}

function computeAddonPrice(addon: string, product?: ProductDb | null): number {
  if (ALL_SAUCES.includes(addon)) return 3;
  if (addon === SWAP_FEE_NAME) return 5;

  if (TARTAR_BASES.includes(addon)) return 0;

  if (addon === RAW_SET_BAKE_ALL || addon === RAW_SET_BAKE_ALL_LEGACY) {
    const p = getSetBakePriceForProduct(product || null);
    return typeof p === "number" ? p : 5;
  }

  if (addon === SET_UPGRADE_ADDON) {
    const p = getSetUpgradePrice(product || null);
    return typeof p === "number" ? p : 1;
  }

  if (addon.startsWith(RAW_SET_BAKE_ROLL_PREFIX)) return 2;

  let label = addon;

  if (addon.startsWith(SET_ROLL_EXTRA_PREFIX)) {
    const after = addon.slice(SET_ROLL_EXTRA_PREFIX.length).trim();
    const parts = after.split("—");
    const maybeExtra = (parts[1] || parts[0] || "").trim();
    const foundBase = EXTRAS.find((ex) =>
      maybeExtra.toLowerCase().includes(ex.toLowerCase())
    );
    if (foundBase) {
      label = foundBase;
    }
  }

  const extraPrice = EXTRA_PRICES[label as keyof typeof EXTRA_PRICES];
  if (typeof extraPrice === "number") return extraPrice;

  return 4;
}

const normalize = (s: string) => s.toLowerCase();

const CATEGORY_PREFIX: Record<string, string> = {
  futomaki: "Futomak",
  hosomaki: "Hosomak",
  california: "California",
  nigiri: "Nigiri",
};

function withCategoryPrefix(name: string, subcategory?: string | null): string {
  const base = (name || "").trim();
  if (!subcategory) return base;
  const key = subcategory.toLowerCase();
  const prefix = CATEGORY_PREFIX[key];
  if (!prefix) return base;

  const lowerBase = base.toLowerCase();
  if (
    lowerBase.startsWith(prefix.toLowerCase() + " ") ||
    lowerBase.startsWith(key + " ")
  ) {
    return base;
  }

  if (!base) return base;
  const capitalized = base[0].toUpperCase() + base.slice(1);
  return `${prefix} ${capitalized}`;
}

function parseSetComposition(desc?: string | null) {
  if (!desc) return [] as { qty: number; cat: string; from: string }[];
  const listPart = desc.split(":").slice(1).join(":") || desc;
  const chunks = listPart.split(/[,;]/).map((c) => c.trim());
  const rows: { qty: number; cat: string; from: string }[] = [];
  const re = /^(\d+)\s*x\s*(Futomaki|California|Hosomaki|Nigiri)\s+(.+)$/i;
  chunks.forEach((c) => {
    const m = c.match(re);
    if (m) {
      const qty = parseInt(m[1], 10) || 1;
      const cat = m[2];
      const from = m[3].replace(/\s+za\s+1\s*zł.*$/i, "").trim();
      rows.push({ qty, cat, from });
    }
  });
  return rows;
}

/* ---------- Pojedynczy produkt w edytorze ---------- */
const ProductItemEditor: React.FC<{
  item: EditableItem;
  index: number;
  productCategory: (name: string) => string;
  productsDb: ProductDb[];
  optionsByCat: Record<string, string[]>;
  restaurantSlug: string;
  helpers: {
    addAddon: (index: number, addon: string) => void;
    removeAddon: (index: number, addon: string, opts?: { removeOne?: boolean }) => void;
    swapIngredient: (index: number, from: string, to: string) => void;
    removeItem: (index: number) => void;
    removeWholeItem: (index: number) => void;
    setNote: (index: number, note: string) => void;
  };
}> = ({
  item,
  index,
  productCategory,
  productsDb,
  optionsByCat,
  restaurantSlug,
  helpers,
}) => {
  const { addAddon, removeAddon, swapIngredient, removeItem, removeWholeItem, setNote } =
    helpers;

  const byName = useMemo(() => {
    const map = new Map<string, ProductDb>();
    productsDb.forEach((p) => map.set(p.name, p));
    return map;
  }, [productsDb]);

  const byId = useMemo(() => {
    const map = new Map<string, ProductDb>();
    productsDb.forEach((p) => map.set(p.id, p));
    return map;
  }, [productsDb]);

  const prodInfo =
    (item.product_id && byId.get(item.product_id)) ||
    (item.id && byId.get(item.id!)) ||
    (item.baseName && byName.get(item.baseName)) ||
    byName.get(item.name);

  const subcat = (prodInfo?.subcategory || "").toLowerCase();
  const isSet = subcat === "zestawy";
  const isSpec = subcat === "specjały";
  const productSubcat =
    prodInfo?.subcategory || productCategory(item.baseName || item.name);

  const singleCurrentName = useMemo(() => {
    if (isSet || isSpec) return item.name as string;
    const swaps = Array.isArray(item.swaps) ? item.swaps : [];
    const found = swaps.find(
      (s) =>
        s &&
        typeof s.from === "string" &&
        s.from.toLowerCase() === (item.name || "").toLowerCase()
    );
    return (found?.to as string) || item.name;
  }, [isSet, isSpec, item.swaps, item.name]);

  const setRows = useMemo(
    () => (isSet ? parseSetComposition(prodInfo?.description) : []),
    [isSet, prodInfo?.description]
  );

  const normalizeSetRowKey = (row: {
    qty: number;
    cat: string;
    from: string;
  }) => {
    const cat = (row.cat || "").trim();
    const from = (row.from || "").trim();
    if (!from) return cat;

    const parts = from
      .split("+")
      .map((p) => p.trim())
      .filter(Boolean);

    const isFishPart = (s: string) => {
      const l = s.toLowerCase();
      return (
        l.includes("łosoś") ||
        l.includes("losos") ||
        l.includes("tuńczyk") ||
        l.includes("tunczyk")
      );
    };

    if (parts.length > 1) {
      const fishParts = parts.filter(isFishPart);
      if (fishParts.length === 1) {
        return `${cat} ${fishParts[0]}`.replace(/\s+/g, " ").trim();
      }
      if (fishParts.length > 1) {
        return `${cat} ${fishParts.join(" + ")}`.replace(/\s+/g, " ").trim();
      }
    }

    return `${cat} ${from}`.replace(/\s+/g, " ").trim();
  };

  const setBakePrice = isSet ? getSetBakePriceForProduct(prodInfo) : null;
  const setUpgradeInfo = isSet ? parseSetUpgradeInfo(prodInfo) : null;

  const isWholeSetBaked =
    (item.addons ?? []).includes(RAW_SET_BAKE_ALL) ||
    (item.addons ?? []).includes(RAW_SET_BAKE_ALL_LEGACY);

  const isSetUpgraded = (item.addons ?? []).includes(SET_UPGRADE_ADDON);

  const isRawRow = (row: { qty: number; cat: string; from: string }) =>
    /surowy/i.test(row.from);

  /**
   * Zwraca aktualnie wybraną wartość zamiany dla danej rolki w zestawie.
   * WAŻNE: Używamy pełnego klucza (cat + from), żeby rozróżnić rolki
   * z tym samym składnikiem w różnych kategoriach.
   */
  const getSetSwapCurrent = (rowKey: string, originalFrom: string): string => {
    const swaps = Array.isArray(item.swaps) ? item.swaps : [];
    const found = swaps.find(
      (s) =>
        s &&
        typeof s.from === "string" &&
        s.from.toLowerCase() === rowKey.toLowerCase()
    );
    return (found?.to as string) || originalFrom;
  };

  const priceNum =
    typeof (item as any).price === "string"
      ? parseFloat((item as any).price as any)
      : item.price || 0;

  const addonsCost = (item.addons ?? []).reduce(
    (sum: number, addon: string) => {
      const unit = computeAddonPrice(addon, prodInfo || undefined);
      return sum + unit;
    },
    0
  );

  const lineTotal = (priceNum + addonsCost) * (item.quantity || 1);

  const canUseExtra = (extra: string): boolean => {
    if (isSet) {
      const hasFuto = setRows.some((row) => /futo/i.test(row.cat));
      if (extra === "Tamago" && hasFuto) return true;
      if (extra === "Ryba pieczona") {
        return /SUROWY/i.test(prodInfo?.description || "");
      }
      return false;
    }

    if (!prodInfo) return false;

    const s = (prodInfo.subcategory || subcat || "").toLowerCase();

    // === California ===
    if (s.includes("california")) {
      if (
        extra === "Ryba pieczona" &&
        isSpecialCaliforniaBakedFishProduct(
          item.name,
          prodInfo?.description || ""
        )
      ) {
        return true;
      }
      return false;
    }

    // === Hosomaki ===
    if (s.includes("hoso")) {
      return extra === "Tempura";
    }

    // === Futomaki ===
    if (s.includes("futo")) {
      if (extra === "Ryba pieczona") {
        return /surowy/i.test(`${item.name} ${prodInfo.description || ""}`);
      }
      if (extra === "Tamago") return true;
      return extra === "Tempura" || extra === "Płatek sojowy";
    }

    // === Nigiri ===
    if (s.includes("nigiri")) {
      const text = `${prodInfo.name} ${
        prodInfo.description || ""
      }`.toLowerCase();
      const fishNigiri =
        text.includes("łosoś") ||
        text.includes("losos") ||
        text.includes("tuńczyk") ||
        text.includes("tunczyk");
      return extra === "Ryba pieczona" && fishNigiri;
    }

    return false;
  };

  /** Zlicza ile razy dany addon występuje w item.addons */
  const countAddon = (label: string): number => {
    const arr = Array.isArray(item.addons) ? item.addons : [];
    return arr.reduce((acc, a) => (a === label ? acc + 1 : acc), 0);
  };

  /** Synchronizuje liczbę addonów danego typu z pożądaną liczbą */
  const syncAddonCount = (label: string, desiredCount: number) => {
    const desired = Math.max(0, Math.floor(Number(desiredCount || 0)));
    const current = countAddon(label);

    if (current < desired) {
      for (let i = 0; i < desired - current; i++) {
        addAddon(index, label);
      }
      return;
    }

    if (current > desired) {
      for (let i = 0; i < current - desired; i++) {
        removeAddon(index, label, { removeOne: true });
      }
    }
  };

  /**
   * Wykonuje zamianę składnika w zestawie.
   * WAŻNE: rowKey to pełny klucz (cat + from), np. "Hosomaki tuńczyk surowy",
   * originalFrom to oryginalna nazwa składnika (np. "tuńczyk surowy").
   */
  const doSetSwap = (rowKey: string, originalFrom: string, to: string) => {
    const current = getSetSwapCurrent(rowKey, originalFrom);
    if (!to || to === current) return;

    const swaps = Array.isArray(item.swaps) ? item.swaps : [];
    const rowKeyLc = rowKey.trim().toLowerCase();
    const toLc = to.trim().toLowerCase();
    const originalFromLc = originalFrom.trim().toLowerCase();

    // 1) wykonaj zamianę w stanie (używamy pełnego klucza)
    swapIngredient(index, rowKey, to);

    // 2) zasymuluj nextSwaps po tej zmianie
    const nextSwaps = [...swaps];
    const existingIdx = nextSwaps.findIndex(
      (s: any) => s && s.from && String(s.from).trim().toLowerCase() === rowKeyLc
    );

    if (existingIdx >= 0) {
      // Jeśli zamieniono z powrotem na oryginał, usuń swap
      if (toLc === originalFromLc) {
        nextSwaps.splice(existingIdx, 1);
      } else {
        nextSwaps[existingIdx] = { ...nextSwaps[existingIdx], to };
      }
    } else {
      // Nie dodawaj swap jeśli wybrano to samo co oryginał
      if (toLc !== originalFromLc) nextSwaps.push({ from: rowKey, to });
    }

    // 3) policz ile jest aktywnych (płatnych) zamian
    // Zamiana jest płatna jeśli wartość "to" różni się od oryginalnego składnika
    const catPrefixes = ["futomaki", "hosomaki", "california", "nigiri"];
    const activeSwapCount = nextSwaps.filter((s: any) => {
      if (!s || typeof s.from !== "string" || typeof s.to !== "string") return false;
      
      const fromKey = s.from.trim().toLowerCase();
      const toVal = s.to.trim().toLowerCase();
      
      // Wyciągnij oryginalny składnik z klucza (usuń prefix kategorii)
      let originalIngredient = fromKey;
      for (const prefix of catPrefixes) {
        if (fromKey.startsWith(prefix + " ")) {
          originalIngredient = fromKey.slice(prefix.length + 1);
          break;
        }
      }
      
      // Zamiana jest płatna jeśli "to" różni się od oryginalnego składnika
      return originalIngredient !== toVal;
    }).length;

    // 4) ustaw liczbę addonów "Zamiana w zestawie" = liczba aktywnych zamian
    syncAddonCount(SWAP_FEE_NAME, activeSwapCount);
  };

  const isSweetPotatoFries = useMemo(() => {
    if (!prodInfo) return false;

    const city = (restaurantSlug || "").toLowerCase();
    if (city !== "szczytno" && city !== "przasnysz") return false;

    const sub = (prodInfo.subcategory || "").toLowerCase();
    if (!sub.includes("przystawk")) return false;

    const text = `${prodInfo.name} ${
      prodInfo.description || ""
    }`.toLowerCase();
    return text.includes("frytki z batat") || text.includes("frytki batat");
  }, [prodInfo, restaurantSlug]);

  const saucesForProduct = useMemo(() => {
    if (isSweetPotatoFries) {
      return ["Spicy Mayo", "Teryiaki", "Sos czekoladowy", "Sos toffi"];
    }
    return BASE_SAUCES;
  }, [isSweetPotatoFries]);

  const isTartar = useMemo(() => {
    if (!prodInfo) return false;

    const sub = (prodInfo.subcategory || "").toLowerCase();
    if (!sub.includes("przystawk")) return false;

    const city = (restaurantSlug || "").toLowerCase();
    if (city !== "szczytno" && city !== "przasnysz") return false;

    const text = `${prodInfo.name} ${
      prodInfo.description || ""
    }`.toLowerCase();
    if (!text.includes("tatar")) return false;

    const hasFish =
      text.includes("łosoś") ||
      text.includes("losos") ||
      text.includes("tuńczyk") ||
      text.includes("tunczyk");

    return hasFish;
  }, [prodInfo, restaurantSlug]);

  const tartarSelectedBase = useMemo<string | null>(() => {
    if (!isTartar) return null;
    const addons = Array.isArray(item.addons) ? item.addons : [];
    return TARTAR_BASES.find((b) => addons.includes(b)) ?? null;
  }, [isTartar, item.addons]);

  const setTartarBase = (base: string) => {
    if (!isTartar) return;
    TARTAR_BASES.forEach((b) => {
      if (item.addons?.includes(b)) removeAddon(index, b);
    });
    addAddon(index, base);
  };

  const toggleAddon = (a: string) => {
    const on = (item.addons ?? []).includes(a);
    const allowed = EXTRAS.includes(a) ? canUseExtra(a) : true;
    if (!allowed) return;
    if (on) removeAddon(index, a);
    else addAddon(index, a);
  };

  const toggleWholeSetBake = () => {
    const on = isWholeSetBaked;
    if (on) {
      removeAddon(index, RAW_SET_BAKE_ALL);
      removeAddon(index, RAW_SET_BAKE_ALL_LEGACY);
    } else {
      addAddon(index, RAW_SET_BAKE_ALL);
      setRows.forEach((row) => {
        const rowKeyBase = normalizeSetRowKey(row);
        const label = RAW_SET_BAKE_ROLL_PREFIX + rowKeyBase;
        if ((item.addons ?? []).includes(label)) {
          removeAddon(index, label);
        }
      });
    }
  };

  const setSetSize = (upgraded: boolean) => {
    if (!setUpgradeInfo) return;
    if (upgraded) {
      if (!isSetUpgraded) addAddon(index, SET_UPGRADE_ADDON);
    } else {
      if (isSetUpgraded) removeAddon(index, SET_UPGRADE_ADDON);
    }
  };

  const displayTitle = useMemo(() => {
    if (isSet || isSpec) return item.name as string;
    return withCategoryPrefix(singleCurrentName, productSubcat);
  }, [isSet, isSpec, item.name, singleCurrentName, productSubcat]);

  return (
    <div className="border border-black/10 bg-white p-3 rounded-xl shadow-sm">
      <div className="flex justify-between items-center font-semibold mb-2">
        <span className="text-black">
          {displayTitle} x{item.quantity || 1}
        </span>
        <span className="text-black">
          {lineTotal.toFixed(2).replace(".", ",")} zł
        </span>
      </div>

      <div className="text-xs text-black/80 space-y-3">
        {isSet && setRows.length > 0 && (
          <div className="space-y-2">
            <div className="font-semibold">Zamiany w zestawie</div>
            {setRows.map((row, i) => {
              const catKey = normalize(row.cat);
              const pool = (optionsByCat[catKey] || []).filter(
                (n) =>
                  (productCategory(n) || "").toLowerCase() !== "specjały"
              );
              
              // Pełny klucz dla tej rolki (z kategorią)
              const rowKeyBase = normalizeSetRowKey(row);
              
              // Używamy pełnego klucza aby rozróżnić rolki z tym samym składnikiem
              const current = getSetSwapCurrent(rowKeyBase, row.from);

              const rollAddonLabel = RAW_SET_BAKE_ROLL_PREFIX + rowKeyBase;
              const rawRow = isRawRow(row);
              const rollBaked = (item.addons ?? []).includes(rollAddonLabel);

              const toggleRowBake = () => {
                if (!rawRow || isWholeSetBaked) return;
                if (rollBaked) {
                  removeAddon(index, rollAddonLabel);
                } else {
                  addAddon(index, rollAddonLabel);
                }
              };

              const extraKey = (ex: string) =>
                `${SET_ROLL_EXTRA_PREFIX}${rowKeyBase} — ${ex}`;

              const currentProduct = byName.get(current) || prodInfo;
              const rowCatLc = (
                currentProduct?.subcategory || row.cat
              ).toLowerCase();
              const text = `${currentProduct?.name || row.cat} ${
                currentProduct?.description || row.from
              }`.toLowerCase();

              const canUseExtraForRow = (ex: string): boolean => {
                if (rowCatLc.includes("california")) {
                  if (ex === "Ryba pieczona") {
                    return isSpecialCaliforniaBakedFishProduct(
                      currentProduct?.name || "",
                      currentProduct?.description || ""
                    );
                  }
                  return false;
                }

                if (rowCatLc.includes("hosomaki")) {
                  return ex === "Tempura";
                }

                if (rowCatLc.includes("futomaki")) {
                  if (ex === "Ryba pieczona") {
                    return /surowy/i.test(text);
                  }
                  if (ex === "Tamago") return true;
                  return ex === "Tempura" || ex === "Płatek sojowy";
                }

                if (rowCatLc.includes("nigiri")) {
                  if (ex !== "Ryba pieczona") return false;
                  const hasFish =
                    text.includes("łosoś") ||
                    text.includes("losos") ||
                    text.includes("tuńczyk") ||
                    text.includes("tunczyk");
                  return hasFish;
                }

                return false;
              };

              return (
                <div key={i} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-1 rounded bg-gray-50 border border-gray-200">
                      {row.qty}× {row.cat}
                    </span>
                    <span className="text-black/70">zamień:</span>
                    <select
                      className="border border-black/15 rounded px-2 py-1 bg-white"
                      value={current}
                      onChange={(e) => doSetSwap(rowKeyBase, row.from, e.target.value)}
                    >
                      {[current, ...pool.filter((n) => n !== current)].map(
                        (n) => (
                          <option key={n} value={n}>
                            {withCategoryPrefix(n, row.cat)}
                          </option>
                        )
                      )}
                    </select>

                    {rawRow && (
                      <button
                        type="button"
                        onClick={toggleRowBake}
                        disabled={isWholeSetBaked}
                        className={clsx(
                          "px-2 py-1 rounded text-[11px] border",
                          isWholeSetBaked
                            ? "opacity-40 cursor-not-allowed bg-gray-50 border-gray-200"
                            : rollBaked
                            ? "bg-black text-white border-black"
                            : "bg-white text-black hover:bg-gray-50 border-gray-200"
                        )}
                      >
                        {rollBaked
                          ? "✓ Ta rolka pieczona (+2 zł)"
                          : "+ Zamień tę rolkę na pieczoną (+2 zł)"}
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pl-2">
                    <span className="text-black/70 text-[11px]">
                      Dodatki do tej rolki:
                    </span>
                    {EXTRAS.map((ex) => {
                      const key = extraKey(ex);
                      const allowed = canUseExtraForRow(ex);
                      const on = (item.addons ?? []).includes(key);
                      return (
                        <button
                          key={ex}
                          type="button"
                          onClick={() => {
                            if (!allowed) return;
                            if (on) removeAddon(index, key);
                            else addAddon(index, key);
                          }}
                          className={clsx(
                            "px-2 py-1 rounded text-[11px] border",
                            !allowed
                              ? "opacity-40 cursor-not-allowed bg-gray-50 border-gray-200"
                              : on
                              ? "bg-black text-white border-black"
                              : "bg-white text-black hover:bg-gray-50 border-gray-200"
                          )}
                        >
                          {on ? `✓ ${ex}` : `+ ${ex}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {setUpgradeInfo && (
              <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-2 space-y-1">
                <div className="font-semibold text-[11px]">
                  Rozmiar zestawu:
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSetSize(false)}
                    className={clsx(
                      "px-2 py-1 rounded border",
                      !isSetUpgraded
                        ? "bg-black text-white border-black"
                        : "bg-white text-black hover:bg-gray-50 border-gray-200"
                    )}
                  >
                    Standard – {setUpgradeInfo.basePieces} szt
                  </button>
                  <button
                    type="button"
                    onClick={() => setSetSize(true)}
                    className={clsx(
                      "px-2 py-1 rounded border",
                      isSetUpgraded
                        ? "bg-black text-white border-black"
                        : "bg-white text-black hover:bg-gray-50 border-gray-200"
                    )}
                  >
                    Powiększony – {setUpgradeInfo.totalPieces} szt (
                    +{setUpgradeInfo.extraPieces} szt za{" "}
                    {setUpgradeInfo.price} zł)
                  </button>
                </div>
              </div>
            )}

            <p className="text-[11px] text-black/60">
              Zamiany tylko w obrębie tej samej kategorii (Futomaki ↔ Futomaki,
              Hosomaki ↔ Hosomaki itd.). Bez specjałów. Dodajemy pozycję „
              {SWAP_FEE_NAME}”.
            </p>

            {isSet && setBakePrice != null && (
              <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 px-2 py-2 space-y-1">
                <div className="font-semibold text-[11px]">
                  Wersja pieczona całego zestawu:
                </div>
                <label className="flex items-center gap-2 text-[11px]">
                  <input
                    type="checkbox"
                    checked={isWholeSetBaked}
                    onChange={toggleWholeSetBake}
                  />
                  <span>
                    Zamień cały zestaw na pieczony (+{setBakePrice} zł)
                  </span>
                </label>
                {isWholeSetBaked && (
                  <p className="text-[10px] text-black/60">
                    Dla całego zestawu naliczana jest jedna dopłata +
                    {setBakePrice} zł. Indywidualne pieczenie pojedynczych
                    rolek w tym wariancie jest wyłączone.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="font-semibold mb-1">Sosy:</div>
          <div className="flex flex-wrap gap-2">
            {saucesForProduct.map((s) => {
              const on = item.addons?.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleAddon(s)}
                  className={clsx(
                    "px-2 py-1 rounded text-xs border",
                    on
                      ? "bg-black text-white border-black"
                      : "bg-white text-black hover:bg-gray-50 border-gray-200"
                  )}
                >
                  {on ? `✓ ${s}` : `+ ${s}`}
                </button>
              );
            })}
          </div>
        </div>

        {!isSet && (
          <div>
            <div className="font-semibold mb-1">Dodatki:</div>
            <div className="flex flex-wrap gap-2">
              {EXTRAS.map((ex) => {
                const allowed = canUseExtra(ex);
                const on = item.addons?.includes(ex);
                return (
                  <button
                    key={ex}
                    onClick={() => allowed && toggleAddon(ex)}
                    className={clsx(
                      "px-2 py-1 rounded text-xs border",
                      !allowed
                        ? "opacity-40 cursor-not-allowed bg-gray-50 border-gray-200"
                        : on
                        ? "bg-black text-white border-black"
                        : "bg-white text-black hover:bg-gray-50 border-gray-200"
                    )}
                  >
                    {on ? `✓ ${ex}` : `+ ${ex}`}
                  </button>
                );
              })}
            </div>

            {subcat === "california" && (
              <p className="text-[11px] text-black/60 mt-1">
                California = rolki z ryżem na zewnątrz. Standardowo nie dodajemy
                do nich dodatków – wyjątek stanowią wybrane pozycje z surowym
                łososiem, paluszkiem krabowym i/lub krewetką obłożoną łososiem.
                Tylko przy takich pozycjach dostępna jest opcja „Ryba pieczona”
                (+2 zł).
              </p>
            )}

            {subcat === "hosomaki" && (
              <p className="text-[11px] text-black/60 mt-1">
                Hosomaki (Hoso) = cienkie rolki z jednym składnikiem. Można
                dodać jedynie Tempurę, a przy zamianach wybierasz wyłącznie inne
                Hosomaki.
              </p>
            )}

            {subcat === "futomaki" && (
              <p className="text-[11px] text-black/60 mt-1">
                Futomaki (Futo) = grubsze rolki z kilkoma składnikami. Dostępne
                dodatki: Tempura, Płatek sojowy, Tamago, a przy rolkach surowych
                także „Ryba pieczona”.
              </p>
            )}

            {isSet && (
              <p className="text-[11px] text-black/60 mt-1">
                W zestawach zamieniasz rolki tylko w obrębie tej samej kategorii
                (Futomaki ↔ Futomaki, Hosomaki ↔ Hosomaki, California ↔
                California, Nigiri ↔ Nigiri). Jeśli w zestawie są Futomaki,
                możesz dodać Tamago, a w zestawach z surową rybą dostępna jest
                opcja „Ryba pieczona” dla wybranych rolek.
              </p>
            )}
          </div>
        )}

        {isTartar && (
          <div>
            <div className="font-semibold mb-1">Sposób podania tatara:</div>
            <div className="flex flex-wrap gap-2">
              {TARTAR_BASES.map((base) => {
                const label = base.replace(/^Podanie:\s*/i, "");
                const on = tartarSelectedBase === base;
                return (
                  <button
                    key={base}
                    type="button"
                    onClick={() => setTartarBase(base)}
                    className={clsx(
                      "px-2 py-1 rounded text-xs border",
                      on
                        ? "bg-black text-white border-black"
                        : "bg-white text-black hover:bg-gray-50 border-gray-200"
                    )}
                  >
                    {on ? `✓ ${label}` : label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-black/60 mt-1">
              Dostępne tylko w Szczytnie i Przasnyszu dla tatara z łososia lub
              tuńczyka: wybierz bazę (awokado, ryż lub chipsy krewetkowe).
            </p>
          </div>
        )}
      </div>

      <div className="mt-3">
        <textarea
          className="w-full text-xs border border-black/15 rounded-xl px-2 py-1 bg-white"
          placeholder="Notatka do produktu"
          value={item.note || ""}
          onChange={(e) => setNote(index, e.target.value)}
        />
      </div>

      <div className="flex justify-end items-center mt-2 gap-2 flex-wrap text-[11px]">
        <button
          onClick={() => removeItem(index)}
          className="text-red-600 underline"
        >
          Usuń 1 szt.
        </button>
        <button
          onClick={() => removeWholeItem(index)}
          className="text-red-600 underline"
        >
          Usuń produkt
        </button>
      </div>
    </div>
  );
};

/* ---------- Pomocnicze ---------- */
function getPackagingLabel(option: OrderOption) {
  if (option === "local") return "0.00 zł";
  return "2.00 zł";
}

/* ---------- Główny komponent ---------- */
export default function EditOrderButton({
  orderId,
  currentProducts,
  currentSelectedOption,
  onOrderUpdated,
  onEditStart,
  onEditEnd,
}: EditOrderButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [selectedOption, setSelectedOption] =
    useState<OrderOption>(currentSelectedOption);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [productsDb, setProductsDb] = useState<ProductDb[]>([]);

  const searchParams = useSearchParams();
  const restaurantSlug = (searchParams.get("restaurant") || "").toLowerCase();

  /* --- inicjalizacja itemów z zamówienia --- */
  useEffect(() => {
    if (!showModal) return;

    onEditStart?.();

    const normalized: EditableItem[] = (currentProducts || []).map((p: any) => {
      const options = p.options || {};
      return {
        id: p.id ?? null,
        product_id: p.product_id ?? null,
        baseName: p.baseName ?? p.name ?? null,
        name: p.name,
        price:
          typeof p.unit_price === "number"
            ? p.unit_price
            : typeof p.price === "number"
            ? p.price
            : typeof p.unit_price === "string"
            ? parseFloat(p.unit_price)
            : typeof p.price === "string"
            ? parseFloat(p.price)
            : 0,
        quantity: p.quantity ?? 1,
        addons: options.addons ?? p.addons ?? [],
        swaps: options.swaps ?? p.swaps ?? [],
        note: options.note ?? p.note ?? "",
      };
    });

    setItems(normalized);
    setSelectedOption(currentSelectedOption);
  }, [showModal, currentProducts, currentSelectedOption, onEditStart]);

  /* --- pobranie produktów z Supabase (menu) --- */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!restaurantSlug) {
        const prodRes = await supabase
          .from("products")
          .select("id,name,subcategory,description,price_cents,price,restaurant_id");

        if (!cancelled && !prodRes.error && prodRes.data) {
          setProductsDb((prodRes.data as ProductDb[]) || []);
        }
        return;
      }

      const restRes = await supabase
        .from("restaurants")
        .select("id")
        .eq("slug", restaurantSlug)
        .maybeSingle();

      if (cancelled || restRes.error || !restRes.data) return;
      const rest: any = restRes.data;

      const prodRes = await supabase
        .from("products")
        .select("id,name,subcategory,description,price_cents,price,restaurant_id")
        .eq("restaurant_id", rest.id);

      if (!cancelled && !prodRes.error && prodRes.data) {
        setProductsDb((prodRes.data as ProductDb[]) || []);
      }
    };

    if (showModal) {
      load();
    }

    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, showModal]);

  const productsByName = useMemo(() => {
    const map = new Map<string, ProductDb>();
    productsDb.forEach((p) => map.set(p.name, p));
    return map;
  }, [productsDb]);

  const productsById = useMemo(() => {
    const map = new Map<string, ProductDb>();
    productsDb.forEach((p) => map.set(p.id, p));
    return map;
  }, [productsDb]);

  const productCategory = useCallback(
    (name: string) => productsByName.get(name)?.subcategory || "",
    [productsByName]
  );

  const resolveProduct = useCallback(
    (item: EditableItem): ProductDb | undefined => {
      const pid = item.product_id ?? item.id;
      if (pid && productsById.get(pid as string)) {
        return productsById.get(pid as string);
      }
      if (item.baseName && productsByName.get(item.baseName)) {
        return productsByName.get(item.baseName);
      }
      if (item.name && productsByName.get(item.name)) {
        return productsByName.get(item.name);
      }
      return undefined;
    },
    [productsById, productsByName]
  );

  const optionsByCat = useMemo(() => {
    const out: Record<string, string[]> = {};

    productsDb.forEach((p) => {
      const cat = (p.subcategory || "").toLowerCase();
      if (!cat || cat === "specjały" || cat === "zestawy") return;

      const arr = (out[cat] ||= []);
      if (!arr.includes(p.name)) {
        arr.push(p.name);
      }
    });

    Object.values(out).forEach((arr) =>
      arr.sort((a, b) => a.localeCompare(b))
    );

    return out;
  }, [productsDb]);

  const getItemLineTotal = useCallback(
    (it: EditableItem) => {
      const qty = it.quantity || 1;
      const productDb = resolveProduct(it);
      const priceNum =
        typeof (it as any).price === "string"
          ? parseFloat((it as any).price as any)
          : it.price || 0;
      const addonsCost = (it.addons ?? []).reduce(
        (sum: number, addon: string) => {
          const unit = computeAddonPrice(addon, productDb || undefined);
          return sum + unit;
        },
        0
      );
      return (priceNum + addonsCost) * qty;
    },
    [resolveProduct]
  );

  const baseTotal = useMemo(
    () => items.reduce((acc, it) => acc + getItemLineTotal(it), 0),
    [items, getItemLineTotal]
  );

  const packagingCost =
    selectedOption === "takeaway" || selectedOption === "delivery" ? 2 : 0;
  const totalWithPackaging = baseTotal + packagingCost;

  /* --- helpery przekazywane do ProductItemEditor --- */
  const helpers = {
    addAddon: (idx: number, addon: string) => {
      setItems((prev) =>
        prev.map((it, i) =>
          i === idx ? { ...it, addons: [...(it.addons || []), addon] } : it
        )
      );
    },
    removeAddon: (idx: number, addon: string, opts?: { removeOne?: boolean }) => {
      setItems((prev) =>
        prev.map((it, i) => {
          if (i !== idx) return it;
          const addons = it.addons || [];
          if (opts?.removeOne) {
            // Usuń tylko pierwsze wystąpienie
            const idx = addons.indexOf(addon);
            if (idx === -1) return it;
            const newAddons = [...addons];
            newAddons.splice(idx, 1);
            return { ...it, addons: newAddons };
          }
          // Usuń wszystkie wystąpienia
          return { ...it, addons: addons.filter((a) => a !== addon) };
        })
      );
    },
    swapIngredient: (idx: number, from: string, to: string) => {
      setItems((prev) =>
        prev.map((it, i) => {
          if (i !== idx) return it;
          const existing = Array.isArray(it.swaps) ? it.swaps : [];
          const others = existing.filter(
            (s) => s.from.toLowerCase() !== from.toLowerCase()
          );
          return { ...it, swaps: [...others, { from, to }] };
        })
      );
    },
    removeItem: (idx: number) => {
      setItems((prev) =>
        prev.flatMap((it, i) => {
          if (i !== idx) return [it];
          const q = it.quantity || 1;
          if (q <= 1) return [];
          return [{ ...it, quantity: q - 1 }];
        })
      );
    },
    removeWholeItem: (idx: number) => {
      setItems((prev) => prev.filter((_, i) => i !== idx));
    },
    setNote: (idx: number, note: string) => {
      setItems((prev) =>
        prev.map((it, i) => (i === idx ? { ...it, note } : it))
      );
    },
  };

  const handleAddNewProduct = (prod: ProductDb) => {
    const price =
      typeof prod.price === "number"
        ? prod.price
        : typeof prod.price === "string"
        ? parseFloat(prod.price)
        : typeof prod.price_cents === "number"
        ? prod.price_cents / 100
        : 0;

    setItems((prev) => [
      ...prev,
      {
        id: prod.id,
        product_id: prod.id,
        baseName: prod.name,
        name: prod.name,
        price,
        quantity: 1,
        addons: [],
        swaps: [],
        note: "",
      },
    ]);
  };

  const closeModal = () => {
    setShowModal(false);
    onEditEnd?.();
  };

  const handleSave = async () => {
    try {
      const itemsPayload = items.map((it) => ({
        product_id: it.product_id ?? it.id ?? null,
        name: it.name,
        quantity: it.quantity || 1,
        unit_price: it.price,
        options: {
          addons: it.addons || [],
          swaps: it.swaps || [],
          note: it.note || "",
        },
      }));

      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: JSON.stringify(itemsPayload),
          selected_option: selectedOption,
          total_price: totalWithPackaging,
        }),
      });

      if (res.ok) {
        const { order } = await res.json();
        onOrderUpdated(orderId, order);
        closeModal();
      } else {
        const result = await res.json().catch(() => null);
        console.error("Błąd edycji zamówienia:", result);
      }
    } catch (error) {
      console.error("Fetch error:", error);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-full text-sm"
      >
        Edytuj
      </button>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4 z-50">
          <div className="relative bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* HEADER */}
            <div className="sticky top-0 bg-white z-10 border-b px-5 py-3 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold leading-tight truncate">
                  Edytuj zamówienie
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Opcja odbioru:{" "}
                  {selectedOption === "local"
                    ? "Na miejscu"
                    : selectedOption === "takeaway"
                    ? "Na wynos"
                    : "Dostawa"}
                  {" · "}Opakowanie: {getPackagingLabel(selectedOption)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Zamknij"
                onClick={closeModal}
                className="p-2 rounded-full hover:bg-gray-100 flex-shrink-0"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-gray-600"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* BODY */}
            <div className="p-4 overflow-y-auto flex-1 flex flex-col space-y-4">
              {/* Opcja odbioru */}
              <div className="flex flex-wrap gap-2">
                {(["local", "takeaway", "delivery"] as OrderOption[]).map(
                  (option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSelectedOption(option)}
                      className={clsx(
                        "px-3 py-2 rounded-full text-xs font-medium flex-1 min-w-[90px]",
                        selectedOption === option
                          ? "bg-yellow-400 font-bold"
                          : "bg-gray-200"
                      )}
                    >
                      {option === "local"
                        ? "NA MIEJSCU"
                        : option === "takeaway"
                        ? "NA WYNOS"
                        : "DOSTAWA"}
                    </button>
                  )
                )}
              </div>

              {/* Lista produktów */}
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <ProductItemEditor
                    key={`${item.name}-${idx}`}
                    item={item}
                    index={idx}
                    productCategory={productCategory}
                    productsDb={productsDb}
                    optionsByCat={optionsByCat}
                    restaurantSlug={restaurantSlug}
                    helpers={helpers}
                  />
                ))}
                {items.length === 0 && (
                  <p className="text-center text-sm text-gray-500">
                    Brak produktów w tym zamówieniu.
                  </p>
                )}
              </div>

              {/* Dodawanie nowych produktów */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAddProduct(true)}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-full text-sm font-medium"
                >
                  Dodaj produkt z menu
                </button>

                {showAddProduct && (
                  <div className="mt-3 border p-3 rounded-lg bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-sm">Wybierz produkt</h4>
                      <button
                        type="button"
                        onClick={() => setShowAddProduct(false)}
                        className="text-xs text-red-600"
                      >
                        Zamknij
                      </button>
                    </div>
                    <ul className="space-y-1 max-h-60 overflow-auto text-sm">
                      {productsDb.map((prod) => {
                        const label = withCategoryPrefix(
                          prod.name,
                          prod.subcategory
                        );
                        const price =
                          typeof prod.price === "number"
                            ? prod.price
                            : typeof prod.price === "string"
                            ? parseFloat(prod.price)
                            : typeof prod.price_cents === "number"
                            ? prod.price_cents / 100
                            : 0;
                        return (
                          <li key={prod.id}>
                            <button
                              type="button"
                              onClick={() => {
                                handleAddNewProduct(prod);
                                setShowAddProduct(false);
                              }}
                              className="block w-full text-left px-3 py-1 rounded hover:bg-white"
                            >
                              <span className="font-medium">{label}</span>{" "}
                              <span className="text-gray-600">
                                — {price.toFixed(2)} zł
                              </span>
                            </button>
                          </li>
                        );
                      })}
                      {productsDb.length === 0 && (
                        <li className="text-xs text-gray-500">
                          Brak produktów dla tej restauracji.
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {/* Podsumowanie */}
              <div className="mt-2 text-sm space-y-1 border-t pt-2">
                <div className="flex justify-between">
                  <span>Suma produktów:</span>
                  <span>{baseTotal.toFixed(2)} zł</span>
                </div>
                {(selectedOption === "takeaway" ||
                  selectedOption === "delivery") && (
                  <div className="flex justify-between">
                    <span>Opakowanie:</span>
                    <span>{packagingCost.toFixed(2)} zł</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-2 mt-2">
                  <span>Razem do zapłaty:</span>
                  <span>{totalWithPackaging.toFixed(2)} zł</span>
                </div>
              </div>

              {/* Akcje */}
              <div className="flex flex-col sm:flex-row gap-3 mt-3">
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-full font-semibold text-sm"
                >
                  Zapisz zmiany
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 rounded-full font-semibold text-sm"
                >
                  Anuluj
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
