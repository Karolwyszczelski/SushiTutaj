"use client";

import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import clsx from "clsx";

import type {
  DbOption,
  DbOptionGroup,
  DbProductOptionLink,
  DbProductOptions,
  ProductDb,
} from "./shared";
import {
  BASE_SAUCES,
  EXTRAS,
  RAW_SET_BAKE_ALL,
  RAW_SET_BAKE_ALL_LEGACY,
  RAW_SET_BAKE_ROLL_PREFIX,
  SET_ROLL_EXTRA_PREFIX,
  SET_UPGRADE_ADDON,
  SWAP_FEE_NAME,
  buildDefaultFreeSaucesForRule,
  computeAddonsCostWithSauces,
  getSauceRuleForItem,
  getSetBakePriceForProduct,
  inferCategoryFromName,
  isAlreadyBakedOrTempura,
  isCaliforniaToppedByText,
  isDessertProduct,
  isSauceAddon,
  isSpecialCaliforniaBakedFishProduct,
  normalize,
  normalizePlain,
  parseSetComposition,
  parseSetUpgradeInfo,
  pluralizeSos,
  summarizeSauceList,
  withCategoryPrefix,
} from "./shared";

export const ProductItem: React.FC<{
  prod: any;
  productCategory: (name: string) => string;
  productsDb: ProductDb[];
  optionsByCat: Record<string, string[]>;
  restaurantSlug: string;
  dbOptionsByProductId: Record<string, DbProductOptions>;
  helpers: {
  addAddon: (name: string, addon: string, opts?: { allowDuplicate?: boolean }) => void;
  removeAddon: (name: string, addon: string, opts?: { removeOne?: boolean }) => void;
  swapIngredient: (name: string, from: string, to: string) => void;
  removeItem: (name: string) => void;
  removeWholeItem: (name: string) => void;
  
};
}> = ({
  prod,
  productCategory,
  productsDb,
  optionsByCat,
  restaurantSlug,
  dbOptionsByProductId,
  helpers,
}) => {
  
  const { addAddon, removeAddon, swapIngredient, removeItem, removeWholeItem } =
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

  // 1. NAJPIERW DEFINIUJEMY prodInfo
  const prodInfo =
    (prod.product_id && byId.get(prod.product_id)) ||
    (prod.id && byId.get(prod.id)) ||
    (prod.baseName && byName.get(prod.baseName)) ||
    byName.get(prod.name);

  // 2. TERAZ MOŻEMY GO UŻYĆ w optionGroups
  // === NOWA LOGIKA Z BAZY ===
  // Wyciągamy grupy opcji z produktu do łatwiejszej zmiennej
  const optionGroups = useMemo(() => {
  // Dopisałem typ: (link: DbProductOptionLink)
  return prodInfo?.product_option_groups?.map((link: DbProductOptionLink) => link.option_group) || [];
}, [prodInfo]);

  const addonsArr: string[] = Array.isArray(prod.addons) ? (prod.addons as string[]) : [];
  
  // 3. Funkcja pomocnicza sprawdzająca czy opcja jest wybrana
  const isOptionSelected = (optionName: string) => addonsArr.includes(optionName);

  // 3. Obsługa kliknięcia (Radio vs Checkbox)
  const handleOptionToggle = (group: DbOptionGroup, option: DbOption) => {
    const isSelected = isOptionSelected(option.name);

    if (group.type === 'radio') {
        // Dla RADIO: Najpierw usuń inne opcje z tej grupy (żeby nie było 2 smaków naraz)
        group.options.forEach(o => {
            if (isOptionSelected(o.name)) removeAddon(prod.name, o.name);
        });
        // Dodaj nową (zawsze zaznaczamy, nie można "odznaczyć" radia klikając w nie)
        // Chyba że min_select pozwala na 0, ale dla smaków to rzadkie.
        if (!isSelected || group.min_select === 0) {
           addAddon(prod.name, option.name);
        }
    } else {
        // Dla CHECKBOX: Klasyczne włącz/wyłącz
        if (isSelected) {
            removeAddon(prod.name, option.name);
        } else {
            addAddon(prod.name, option.name);
        }
    }
  };

   // kategoria: najpierw po nazwie, potem z bazy
  const inferredCat = inferCategoryFromName(prodInfo?.name || prod.name);
  const subcat = (inferredCat || prodInfo?.subcategory || "").toLowerCase();

  const isSet = subcat === "zestawy";
  const isSpec = subcat === "specjały";

  // Zestaw miesiąca: blokujemy zamiany w zestawie
const isSetMonth =
  isSet &&
  (() => {
    const n = normalizePlain(String(prodInfo?.name || prod.name || ""));
    return n.includes("zestaw miesiaca") || n.includes("zestaw miesiac");
  })();


  const productSubcat =
    inferredCat ||
    prodInfo?.subcategory ||
    productCategory(prod.baseName || prod.name);

  const singleCurrentName = useMemo(() => {
    if (isSet || isSpec) return prod.name as string;
    const swaps = Array.isArray((prod as any).swaps)
      ? (prod as any).swaps
      : [];
    const found = swaps.find(
      (s: any) =>
        s &&
        typeof s.from === "string" &&
        s.from.toLowerCase() === (prod.name || "").toLowerCase()
    );
    return (found?.to as string) || prod.name;
  }, [isSet, isSpec, prod.swaps, prod.name, prod]); // eslint-disable-line react-hooks/exhaustive-deps

  const setRows = useMemo(
    () => (isSet ? parseSetComposition(prodInfo?.description) : []),
    [isSet, prodInfo?.description]
  );

  const normalizeSetRowKey = (
  row: { qty: number; cat: string; from: string }
) => {
  const cat = (row.cat || "").trim();
  const from = (row.from || "").trim();
  if (!from) return cat;

  // rozbijamy po "+" bo w zestawach często są miksy typu
  // "krewetka + łosoś surowy"
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

  // KLUCZ MUSI zachować cały miks, inaczej różne rolki z tym samym łososiem się zderzają
  // i dopłaty typu Tempura naliczają się tylko raz.
  if (parts.length > 1) {
    const fishParts = parts.filter(isFishPart);
    const nonFishParts = parts.filter((p) => !isFishPart(p));

    // ryba na początek, ale reszta zostaje (żeby miks był unikalny)
    const ordered =
      fishParts.length > 0 ? [...fishParts, ...nonFishParts] : parts;

    return `${cat} ${ordered.join(" + ")}`.replace(/\s+/g, " ").trim();
  }

  return `${cat} ${from}`.replace(/\s+/g, " ").trim();
};


  // dopłata za wersję pieczoną całego zestawu (jeśli jest przewidziana w menu)
  const setBakePrice = isSet ? getSetBakePriceForProduct(prodInfo) : null;

  // info o powiększeniu (np. 28 szt + 6 szt za 1 zł = 34 szt)
  const setUpgradeInfo = isSet ? parseSetUpgradeInfo(prodInfo) : null;

  const isWholeSetBaked =
    (prod.addons ?? []).includes(RAW_SET_BAKE_ALL) ||
    (prod.addons ?? []).includes(RAW_SET_BAKE_ALL_LEGACY);

  const isSetUpgraded = (prod.addons ?? []).includes(SET_UPGRADE_ADDON);

  const isRawRow = (row: { qty: number; cat: string; from: string }) =>
    /surowy/i.test(row.from);

  /**
   * Zwraca aktualnie wybraną wartość zamiany dla danej rolki w zestawie.
   * WAŻNE: Używamy pełnego klucza (cat + from), żeby rozróżnić rolki
   * z tym samym składnikiem w różnych kategoriach (np. Hosomaki tuńczyk vs Futomaki tuńczyk).
   */
  const getSetSwapCurrent = (rowKey: string, originalFrom: string): string => {
    if (isSetMonth) return originalFrom;
    const swaps = Array.isArray(prod.swaps) ? prod.swaps : [];
    const found = swaps.find(
      (s: any) =>
        s &&
        typeof s.from === "string" &&
        s.from.toLowerCase() === rowKey.toLowerCase()
    );
    return (found?.to as string) || originalFrom;
  };

  const priceNum =
    typeof prod.price === "string" ? parseFloat(prod.price) : prod.price || 0;
  const { addonsCost, sauceHint } = useMemo(() => {
  return computeAddonsCostWithSauces({
    addons: prod.addons ?? [],
    product: prodInfo ?? null,
    itemName: String(prodInfo?.name || prod.name || ""),
    subcat: String(subcat || ""),
    restaurantSlug,
  });
}, [prod.addons, prodInfo, prod.name, subcat, restaurantSlug]);
  const lineTotal = (priceNum + addonsCost) * (prod.quantity || 1);

  // ===== helpery do zliczania addonów (pozwala mieć N× ten sam addon) =====
const countAddon = useCallback((label: string): number => {
  const arr: string[] = Array.isArray(prod.addons)
    ? ((prod.addons as any[]).filter((x) => typeof x === "string") as string[])
    : [];
  return arr.reduce((acc, a) => (a === label ? acc + 1 : acc), 0);
}, [prod.addons]);

const syncAddonCount = useCallback((label: string, desiredCount: number) => {
  const desired = Math.max(0, Math.floor(Number(desiredCount || 0)));
  const current = countAddon(label);

  if (current < desired) {
    for (let i = 0; i < desired - current; i++) {
      addAddon(prod.name, label, { allowDuplicate: true });
    }
    return;
  }

  if (current > desired) {
    for (let i = 0; i < current - desired; i++) {
      removeAddon(prod.name, label, { removeOne: true });
    }
  }
}, [prod.name, addAddon, removeAddon, countAddon]);



  // Czy dany extra jest dozwolony dla tego produktu
  const canUseExtra = (extra: string): boolean => {
    if (isSet) {
      // w zestawach używamy canUseExtraForRow (per rolka)
      return false;
    }

    if (!prodInfo) return false;

    const catForLogic =
      inferCategoryFromName(prodInfo.name) ||
      inferCategoryFromName(prod.name) ||
      prodInfo.subcategory ||
      subcat ||
      "";

    const s = catForLogic.toLowerCase();

    // === California ===
    if (s.includes("california")) {
      if (extra === "Ryba pieczona") {
        const text = `${prod.name} ${prodInfo.description || ""}`;
        // jeśli ta California jest już pieczona / w tempurze – nie dokładamy „Ryby pieczonej”
        if (isAlreadyBakedOrTempura(text)) return false;

        return isSpecialCaliforniaBakedFishProduct(
          prod.name,
          prodInfo.description || ""
        );
      }
      // do California nie dokładamy innych EXTRAS poza tą jedną opcją
      return false;
    }

    // === Hosomaki / Hoso ===
    if (s.includes("hoso")) {
      // Hoso mają tylko Tempurę, ale nie pokazuj jej, jeśli już są w tempurze/pieczone
      if (extra === "Tempura") {
        const text = `${prod.name} ${prodInfo.description || ""}`;
        if (isAlreadyBakedOrTempura(text)) return false;
        return true;
      }
      return false;
    }

    // === Futomaki / Futo ===
    if (s.includes("futo")) {
      if (extra === "Ryba pieczona") {
        const text = `${prod.name} ${prodInfo.description || ""}`;
        // jeśli futomak jest już pieczony / w tempurze – nie pokazujemy „Ryby pieczonej”
        if (isAlreadyBakedOrTempura(text)) return false;
        // tylko przy surowych futomakach
        return /surowy/i.test(text);
      }
      if (extra === "Tamago") return true;
      return extra === "Tempura" || extra === "Płatek sojowy";
    }

    // === Nigiri ===
    if (s.includes("nigiri")) {
      // Nigiri z łososiem / tuńczykiem – tylko Ryba pieczona (opalana)
      const text = `${prodInfo.name} ${prodInfo.description || ""}`.toLowerCase();
      const fishNigiri =
        text.includes("łosoś") ||
        text.includes("losos") ||
        text.includes("tuńczyk") ||
        text.includes("tunczyk");
      return extra === "Ryba pieczona" && fishNigiri;
    }

    return false;
  };

  /**
   * Wykonuje zamianę składnika w zestawie.
   * WAŻNE: rowKey to pełny klucz (cat + from), np. "Hosomaki tuńczyk surowy",
   * originalFrom to oryginalna nazwa składnika (np. "tuńczyk surowy").
   */
  const doSetSwap = (rowKey: string, originalFrom: string, to: string) => {
  if (isSetMonth) return; // Zestaw miesiąca: brak zamian

  const current = getSetSwapCurrent(rowKey, originalFrom);
  if (!to || to === current) return;

  const swaps = Array.isArray(prod.swaps) ? prod.swaps : [];

  const rowKeyLc = rowKey.trim().toLowerCase();
  const toLc = to.trim().toLowerCase();
  const originalFromLc = originalFrom.trim().toLowerCase();

  // 1) wykonaj zamianę w stanie koszyka (używamy pełnego klucza)
  swapIngredient(prod.name, rowKey, to);

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
  // Musimy wyciągnąć oryginalny składnik z rowKey (usuwając prefix kategorii)
  const activeSwapCount = nextSwaps.filter((s: any) => {
    if (!s || typeof s.from !== "string" || typeof s.to !== "string") return false;
    
    const fromKey = s.from.trim().toLowerCase();
    const toVal = s.to.trim().toLowerCase();
    
    // Wyciągnij oryginalny składnik z klucza (usuń prefix kategorii)
    // rowKey ma format "Kategoria składnik", np. "Hosomaki tuńczyk surowy"
    const catPrefixes = ["futomaki", "hosomaki", "california", "nigiri"];
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

useEffect(() => {
  if (!isSetMonth) return;
  // jeśli kiedyś była dopłata za zamiany – czyścimy ją dla Zestawu miesiąca
  syncAddonCount(SWAP_FEE_NAME, 0);
}, [isSetMonth, prod.addons, prod.name, syncAddonCount]);




  // Frytki z batatów z przystawek – tylko w Szczytnie i Przasnyszu
   const isSweetPotatoFries = useMemo(() => {
    const city = (restaurantSlug || "").toLowerCase();
    if (city !== "szczytno" && city !== "przasnysz") return false;

    // bierzemy nazwę z koszyka + ewentualnie z bazy
    const text = `${prod.name || ""} ${
      prodInfo?.name || ""
    } ${prodInfo?.description || ""}`.toLowerCase();

    return (
      text.includes("frytki z batat") ||
      text.includes("frytki batat")
    );
  }, [prod, prodInfo, restaurantSlug]);

  const saucesForProduct = useMemo(() => {
  return isSweetPotatoFries
    ? ["Spicy Mayo", "Teryiaki", "Sos czekoladowy", "Sos toffi"]
    : BASE_SAUCES;
}, [isSweetPotatoFries]);

const sauceQtyMap = useMemo(() => {
  const arr: string[] = Array.isArray(prod.addons) ? (prod.addons as string[]) : [];
  const allowed = new Set(saucesForProduct);

  const m = new Map<string, number>();
  for (const a of arr) {
    if (typeof a !== "string") continue;
    if (!allowed.has(a)) continue;
    m.set(a, (m.get(a) ?? 0) + 1);
  }
  return m;
}, [prod.addons, saucesForProduct]);

const getSauceQty = useCallback(
  (s: string) => sauceQtyMap.get(s) ?? 0,
  [sauceQtyMap]
);

const incSauce = useCallback(
  (s: string) => addAddon(prod.name, s, { allowDuplicate: true }),
  [addAddon, prod.name]
);

const decSauce = useCallback(
  (s: string) => removeAddon(prod.name, s, { removeOne: true }),
  [removeAddon, prod.name]
);


  // Tatar: globalnie (wszystkie miasta) — przystawki + tatar z łososia/tuńczyka
const isTartar = useMemo(() => {
  if (!prodInfo) return false;

  const sub = (prodInfo.subcategory || "").toLowerCase();
  if (!sub.includes("przystawk")) return false;

  const text = `${prodInfo.name} ${prodInfo.description || ""}`.toLowerCase();
  if (!text.includes("tatar")) return false;

  const hasFish =
    text.includes("łosoś") ||
    text.includes("łososia") ||
    text.includes("losos") ||
    text.includes("lososia") ||
    text.includes("łososi") ||
    text.includes("lososi") ||
    text.includes("tuńczyk") ||
    text.includes("tunczyk") ||
    text.includes("tuńczyka") ||
    text.includes("tunczyka");

  return hasFish;
}, [prodInfo]);

  const isDessert = useMemo(
  () => isDessertProduct(prod, prodInfo),
  [prod, prodInfo]
);


// 1) Najpewniejsza detekcja: po subkategorii z DB (napoje = bez sosów)
const drinkSubcatPlain = useMemo(
  () =>
    normalizePlain(
      String(prodInfo?.subcategory || productSubcat || subcat || "")
    ),
  [prodInfo?.subcategory, productSubcat, subcat]
);

const isDrinkBySubcat = drinkSubcatPlain.includes("napoj"); // łapie "napoje", "napój", itd.

const isDrink = isDrinkBySubcat;


const showSauces = !isDrink && !isDessert;

// 2) Bezpiecznik: jeśli to napój/deser, usuń sosy z addonów (żeby nie naliczało kosztu)
  // ===== SOSY: reguła + auto-ustawienie gratisów dla zestawów/set-like =====
  const itemNameForSauces = useMemo(
    () => String(prodInfo?.name || prod.name || ""),
    [prodInfo?.name, prod.name]
  );

  const sauceRule = useMemo(
    () =>
      getSauceRuleForItem({
        itemName: itemNameForSauces,
        subcatLc: String(subcat || ""),
        restaurantSlug,
      }),
    [itemNameForSauces, subcat, restaurantSlug]
  );

  // identyczna definicja “set-like” jak w getSauceRuleForItem (żeby nie łapać np. napojów)
  const shouldAutoPrefillFreeSauces = useMemo(() => {
    const namePlain = normalizePlain(itemNameForSauces);
    const subPlain = String(subcat || "").toLowerCase();

    const isSetLike =
      subPlain === "zestawy" ||
      namePlain.includes("zestaw") ||
      namePlain.includes(" set ") ||
      namePlain.includes("lunch") ||
      /\bset\b/i.test(namePlain);

    return isSetLike;
  }, [itemNameForSauces, subcat]);

  const freeSaucesTotal = useMemo(() => {
    if (sauceRule.kind === "count") {
      return Math.max(0, Number(sauceRule.freeCount || 0));
    }
    if (sauceRule.kind === "perSauce") {
      return Object.values(sauceRule.freeBySauce || {}).reduce(
        (acc, v) => acc + Math.max(0, Number(v || 0)),
        0
      );
    }
    return 0;
  }, [sauceRule]);

  const defaultFreeSauces = useMemo(() => {
    if (!shouldAutoPrefillFreeSauces) return [];
    return buildDefaultFreeSaucesForRule(sauceRule);
  }, [shouldAutoPrefillFreeSauces, sauceRule]);

  const defaultFreeSaucesSummary = useMemo(
    () => summarizeSauceList(defaultFreeSauces),
    [defaultFreeSauces]
  );

  const didAutoInitSaucesRef = useRef(false);

  useEffect(() => {
    // nie nadpisujemy UX po pierwszej inicjalizacji
    if (didAutoInitSaucesRef.current) return;

    // tylko gdy sosy w ogóle są widoczne (nie napoje/desery)
    if (!showSauces) return;

    // tylko dla zestawów / set-like
    if (!shouldAutoPrefillFreeSauces) return;

    const arr: string[] = Array.isArray(prod.addons) ? (prod.addons as string[]) : [];
    const alreadyHasAnySauce = arr.some((a) => typeof a === "string" && isSauceAddon(a));

    // auto-prefill TYLKO jeśli klient jeszcze nic nie wybrał
    if (!alreadyHasAnySauce && defaultFreeSauces.length > 0) {
      didAutoInitSaucesRef.current = true;
      defaultFreeSauces.forEach((s) => addAddon(prod.name, s, { allowDuplicate: true }));
      return;
    }

    // jeśli już są sosy (klient kliknął) — nie ruszamy
    if (alreadyHasAnySauce) {
      didAutoInitSaucesRef.current = true;
    }
  }, [
    showSauces,
    shouldAutoPrefillFreeSauces,
    defaultFreeSauces,
    prod.addons,
    prod.name,
    addAddon,
  ]);

  const toggleAddon = (a: string) => {
  const on = (prod.addons ?? []).includes(a);
  const isExtra = EXTRAS.includes(a);
  const allowed = isExtra ? canUseExtra(a) : true;
  if (!allowed) return;

  if (on) {
    removeAddon(prod.name, a);
    return;
  }

  // jeśli to jeden z EXTRAS -> usuń pozostałe EXTRAS (radio-like)
  if (isExtra) {
    EXTRAS.forEach((ex) => {
      if ((prod.addons ?? []).includes(ex)) {
        removeAddon(prod.name, ex);
      }
    });
  }

  addAddon(prod.name, a);
};

  const toggleWholeSetBake = () => {
    const on = isWholeSetBaked;
    if (on) {
      // zdejmujemy oba możliwe labele, na wszelki wypadek
      removeAddon(prod.name, RAW_SET_BAKE_ALL);
      removeAddon(prod.name, RAW_SET_BAKE_ALL_LEGACY);
    } else {
      addAddon(prod.name, RAW_SET_BAKE_ALL);
      // przy wersji pieczonej całego zestawu wyłączamy pieczenie pojedynczych rolek
      setRows.forEach((row) => {
        const rowKeyBase = normalizeSetRowKey(row);
        const label = RAW_SET_BAKE_ROLL_PREFIX + rowKeyBase;
        if ((prod.addons ?? []).includes(label)) {
          removeAddon(prod.name, label);
        }
      });
    }
  };

  const setSetSize = (upgraded: boolean) => {
    if (!setUpgradeInfo) return;
    if (upgraded) {
      if (!isSetUpgraded) addAddon(prod.name, SET_UPGRADE_ADDON);
    } else {
      if (isSetUpgraded) removeAddon(prod.name, SET_UPGRADE_ADDON);
    }
  };

  // WYŚWIETLANA NAZWA W KOSZYKU: kategoria + nazwa (dla pojedynczych rolek)
  const displayTitle = useMemo(() => {
    if (isSet || isSpec) return prod.name as string;
    return withCategoryPrefix(singleCurrentName, productSubcat);
  }, [isSet, isSpec, prod.name, singleCurrentName, productSubcat]);

  return (
    <div className="border border-black/10 bg-white p-3">
     <div className="flex items-center justify-between gap-2 font-semibold mb-2 min-w-0">
  <span className="text-black min-w-0 flex-1 truncate">
    {displayTitle} x{prod.quantity || 1}
  </span>
  <span className="text-black shrink-0">
    {lineTotal.toFixed(2).replace(".", ",")} zł
  </span>
</div>

      <div className="text-xs text-black/80 space-y-3">
      {/* === SEKCJA DYNAMICZNYCH OPCJI Z BAZY (Najwyższy priorytet) === */}
        {optionGroups.length > 0 && (
           <div className="space-y-3 mb-2 pt-1 border-b border-dashed border-gray-200 pb-3">
              {/* Dopisałem typ: (group: DbOptionGroup) */}
{optionGroups.map((group: DbOptionGroup) => (
  <div key={group.id}>
                      <div className="font-semibold mb-1 text-black">{group.name}</div>
                      <div className="flex flex-wrap gap-2">
    {/* Dopisałem typ: (option: DbOption) */}
    {group.options.map((option: DbOption) => {
        const selected = isOptionSelected(option.name);
                              // Wyświetl cenę tylko jeśli jest większa niż 0
                              const priceTxt = option.price_modifier > 0 
                                   ? ` (+${(option.price_modifier/100).toFixed(2)} zł)` 
                                   : '';
                              
                              return (
                                  <button
                                      key={option.id}
                                      onClick={() => handleOptionToggle(group, option)}
                                      className={clsx(
                                          "px-2 py-1.5 rounded text-[11px] border transition-colors",
                                          selected 
                                              ? "bg-black text-white border-black" 
                                              : "bg-white text-black hover:bg-gray-50 border-gray-200"
                                      )}
                                  >
                                      {selected ? "✓ " : ""}{option.name}{priceTxt}
                                  </button>
                              )
                          })}
                      </div>
                  </div>
              ))}
           </div>
        )}
        {isSet && setRows.length > 0 && (
          <div className="space-y-2">
            <div className="font-semibold">Skład zestawu</div>

{setRows.map((row, i) => {
  const catKey = normalize(row.cat);
  const isCaliforniaRow = /california/i.test(row.cat || "");

  // znormalizowany klucz tej rolki w zestawie - MUSI być przed getSetSwapCurrent!
  const rowKeyBase = normalizeSetRowKey(row);

  // Używamy pełnego klucza (z kategorią) aby rozróżnić rolki z tym samym składnikiem
  const current = getSetSwapCurrent(rowKeyBase, row.from);

  // produkt WYBRANEJ rolki (po zamianie) – nie oryginał ani cały zestaw
  const currentPrefixed = withCategoryPrefix(current, row.cat);
  const currentProduct =
    byName.get(current) || byName.get(currentPrefixed) || null;

  // tekst do logiki – MUSI opisywać WYBRANĄ rolkę (żeby nie “ciągnęło tempury”)
  const textForLogic = `${currentProduct?.name || currentPrefixed} ${
    currentProduct?.description || ""
  }`;


  // 1. Sprawdźmy, czy ten konkretny składnik zestawu (oryginał) jest Specjałem
  const originalNameFull = withCategoryPrefix(row.from, row.cat);
  const originalDbItem = byName.get(row.from) || byName.get(originalNameFull);
  
  // Sprawdzamy subkategorię w bazie ("specjały")
  const isRowSpecial = (originalDbItem?.subcategory || "").toLowerCase() === "specjały";

  let pool: string[] = [];

  if (isRowSpecial) {
    // JEŚLI TO SPECJAŁ: blokujemy zamiany (pula jest pusta).
    // Użytkownik zobaczy tylko "Skład zestawu — California Rainbow"
    pool = [];
  } else {
    // JEŚLI TO ZWYKŁA ROLKA: generujemy standardową pulę zamian (bez specjałów)
    pool = (optionsByCat[catKey] || []).filter(
      (n) => (productCategory(n) || "").toLowerCase() !== "specjały"
    );

    // DLA CALIFORNI: filtrujemy tylko do tej samej „klasy” (obłożona ↔ obłożona)
    if (isCaliforniaRow) {
      const currentIsTopped = currentProduct
        ? isCaliforniaToppedByText(currentProduct.name, currentProduct.description)
        : isCaliforniaToppedByText(currentPrefixed, null);

      pool = pool.filter((n) => {
        const p = byName.get(n);
        if (!p) return false;
        const pIsTopped = isCaliforniaToppedByText(p.name, p.description);
        return pIsTopped === currentIsTopped;
      });
    }
  }

  // OPCJE SELECTA:
  const rawOptions = [current, row.from, ...pool];
  const selectOptions = Array.from(new Set(rawOptions));

  // pieczenie konkretnej rolki w zestawie
  const rollAddonLabel = RAW_SET_BAKE_ROLL_PREFIX + rowKeyBase;

  // --- POPRAWKA: Sprawdzamy aktualnie wybraną rolkę (po zamianie), a nie tylko oryginał ---
  const currentTextLc = (textForLogic || "").toLowerCase();
  
  // Pozwól na pieczenie, jeśli w nazwie jest "surowy" LUB nazwa ryby (łosoś/tuńczyk)
  const isCurrentRawOrFish = 
    /surowy|surowe|surowa/i.test(currentTextLc) ||
    /łosoś|losos|tuńczyk|tunczyk/i.test(currentTextLc);

  // Sprawdź, czy ta wybrana rolka nie jest już pieczona/w tempurze
  const isCurrentBaked = isAlreadyBakedOrTempura(currentTextLc);

  const rowBakePossible = isCurrentRawOrFish && !isCurrentBaked;
  const rawRow = isRawRow(row); 
  // ---------------------------------------------------------------------------------------

  const rollBaked = (prod.addons ?? []).includes(rollAddonLabel);

  const toggleRowBake = () => {
    if (!rawRow || !rowBakePossible || isWholeSetBaked) return;
    if (rollBaked) removeAddon(prod.name, rollAddonLabel);
    else addAddon(prod.name, rollAddonLabel);
  };

  // Dodatki per konkretną rolkę
  const extraKey = (ex: string) => `${SET_ROLL_EXTRA_PREFIX}${rowKeyBase} — ${ex}`;
  const rowCatLc = (row.cat || "").toLowerCase();

  const isExtraAllowedForRowText = (ex: string, rowText: string): boolean => {
    const rowTextLc = (rowText || "").toLowerCase();
    const rowTextPlain = normalizePlain(rowText || "");

    // 0) BLOKADA "DODAJESZ TO CO JUŻ JEST W ROLCE"
    // Tempura / tempurze / tempur... => blokuj Tempurę
    if (ex === "Tempura" && rowTextLc.includes("tempur")) return false;

    // "płatek sojowy" / "w płatku sojowym" => blokuj Płatek sojowy
if (
  ex === "Płatek sojowy" &&
  (rowTextPlain.includes("platek sojow") || rowTextPlain.includes("platku sojow"))
) return false;

// "tamago" => blokuj Tamago (żeby nie dało się dodać drugi raz)
if (ex === "Tamago" && rowTextPlain.includes("tamago")) return false;

    // === Hosomaki / Hoso ===
    if (rowCatLc.includes("hosomaki") || rowCatLc.includes("hoso")) {
      // Hosomaki: tylko Tempura, ale nie jeśli już tempur...
      return ex === "Tempura";
    }

    // === Futomaki / Futo ===
    if (rowCatLc.includes("futomaki") || rowCatLc.includes("futo")) {
      if (ex === "Ryba pieczona") {
        // Jeśli rolka jest już pieczona/w tempurze -> ukryj opcję
        if (isAlreadyBakedOrTempura(rowTextLc)) return false;

        // surowy LUB ma rybę w nazwie
        return (
          /surowy|surowe|surowa/i.test(rowTextLc) ||
          /łosoś|losos|tuńczyk|tunczyk/i.test(rowTextLc)
        );
      }

      if (ex === "Tamago") return true;
      return ex === "Tempura" || ex === "Płatek sojowy";
    }

    // === Nigiri ===
    if (rowCatLc.includes("nigiri")) {
      if (ex !== "Ryba pieczona") return false;
      const hasFish =
        rowTextLc.includes("łosoś") ||
        rowTextLc.includes("losos") ||
        rowTextLc.includes("tuńczyk") ||
        rowTextLc.includes("tunczyk");

      return hasFish && !isAlreadyBakedOrTempura(rowTextLc);
    }

    return false;
  };

  const canUseExtraForRow = (ex: string): boolean => {
    // kluczowe: analizujemy WYBRANĄ rolkę (textForLogic)
    return isExtraAllowedForRowText(ex, String(textForLogic || ""));
  };


  // labelki do selecta: pokazuj krótko (np. "Dorsz"), ale value zostaje pełne
  const stripKnownPrefix = (label: string) =>
    (label || "")
      .replace(/^(Futomak(?:i)?|Hosomak(?:i)?|California|Nigiri)\s+/i, "")
      .trim();

  const optionLabelShort = (n: string) => stripKnownPrefix(withCategoryPrefix(n, row.cat));

  return (
    <div
      key={i}
      className="rounded-2xl border border-black/10 bg-white p-3 space-y-3"
    >
      {/* 1) Skład rolki w zestawie */}
      <div className="text-sm font-semibold text-black leading-snug">
  {row.qty}x {currentPrefixed}
</div>

{normalizePlain(currentPrefixed) !== normalizePlain(withCategoryPrefix(row.from, row.cat)) && (
  <div className="text-[11px] text-black/50">
    W zestawie było: {withCategoryPrefix(row.from, row.cat)}
  </div>
)}

      {/* 2) Zamiana */}
{isSetMonth ? (
  <div className="rounded-xl bg-gray-50 border border-black/10 p-2 text-[11px] text-black/70">
    Zamiany niedostępne dla „Zestawu miesiąca”.
  </div>
) : (
  <div className="space-y-1">
    <div className="text-[11px] font-semibold text-black/70">Zamień na</div>
    <select
      className="border border-black/15 rounded-xl px-3 py-2 bg-white w-full"
      value={current}
      onChange={(e) => {
        const next = e.target.value;

        // jeśli była dopłata za pieczenie, a nowa WYBRANA rolka jest już pieczona / w tempurze → zdejmij dopłatę
        const nextPref = withCategoryPrefix(next, row.cat);
        const nextProd = byName.get(next) || byName.get(nextPref) || null;
        const nextText = `${nextProd?.name || nextPref} ${nextProd?.description || ""}`;

        if ((prod.addons ?? []).includes(rollAddonLabel) && isAlreadyBakedOrTempura(nextText)) {
          removeAddon(prod.name, rollAddonLabel);
        }

        // Jeśli do tej rolki były dodane dodatki (Tempura / Płatek / itd.),
        // a po zamianie nowa rolka JUŻ to ma lub nie powinna tego mieć -> zdejmij addon, żeby nie naliczać podwójnie
        for (const ex of EXTRAS) {
          const k = extraKey(ex);
          const onExtra = (prod.addons ?? []).includes(k);
          if (!onExtra) continue;

          // używamy tej samej logiki co przy renderze przycisków
          const allowedAfter = isExtraAllowedForRowText(ex, nextText);
          if (!allowedAfter) removeAddon(prod.name, k);
        }


        doSetSwap(rowKeyBase, row.from, next);
      }}
      aria-label={`Zamiana: ${row.qty}x ${row.cat} ${row.from}`}
    >
      {selectOptions.map((n) => {
        const short = optionLabelShort(n);
        return (
          <option key={n} value={n}>
            {n === row.from ? `Skład zestawu — ${short}` : short}
          </option>
        );
      })}
    </select>
  </div>
)}

      {/* 3) Pieczenie tej rolki (jeśli dotyczy) */}
      {rawRow && (
        <button
          type="button"
          onClick={toggleRowBake}
          disabled={isWholeSetBaked || !rowBakePossible}
          className={clsx(
            "w-full px-3 py-2 rounded-xl text-[11px] border",
            (isWholeSetBaked || !rowBakePossible)
              ? "opacity-40 cursor-not-allowed bg-gray-50 border-gray-200"
              : rollBaked
              ? "bg-black text-white border-black"
              : "bg-white text-black hover:bg-gray-50 border-gray-200"
          )}
        >
          {rollBaked
  ? "✓ Ta rolka pieczona (+2 zł)"
  : rowBakePossible
  ? "+ Zamień tę rolkę na pieczoną (+2 zł)"
  : "Ta rolka jest już pieczona lub w tempurze"}
        </button>
      )}

      {/* 4) Dodatki do tej rolki */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-black/70">
          Dodatki do tej rolki
        </div>

        <div className="flex flex-wrap gap-2">
          {EXTRAS.map((ex) => {
            const key = extraKey(ex);
            const allowed = canUseExtraForRow(ex);
            const on = (prod.addons ?? []).includes(key);

            return (
              <button
                key={ex}
                type="button"
                  disabled={!allowed && !on}
                onClick={() => {
  // jeśli jest już włączone, pozwól ZAWSZE zdjąć
  if (on) {
    removeAddon(prod.name, key);
    return;
  }

  // jeśli nie jest włączone, a jest niedozwolone — nie dodawaj
  if (!allowed) return;

  // radio-like w obrębie tej rolki
  EXTRAS.forEach((ex2) => {
    const k2 = extraKey(ex2);
    if ((prod.addons ?? []).includes(k2)) removeAddon(prod.name, k2);
  });

  addAddon(prod.name, key);
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
    </div>
  );
})}

            {/* Rozmiar zestawu: standard vs powiększony (+szt za 1–2 zł) */}
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

            {!isSetMonth && (
  <p className="text-[11px] text-black/60">
    Zamiany tylko w obrębie tej samej kategorii (Futomaki ↔ Futomaki,
    Hosomaki ↔ Hosomaki, California ↔ California itd.). California
    może być zamieniana tylko na inne rolki California z tej samej
    „klasy” (obłożone ↔ obłożone, klasyczne ↔ klasyczne). Bez
    specjałów. Dodajemy pozycję „{SWAP_FEE_NAME}”.
  </p>
)}


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

        {showSauces && (
  <div className="mt-2">
    <div className="font-semibold mb-2">Sosy</div>
    {/* info o sosach (przeniesione nad listę) */}
<p className="text-[11px] text-black/60 -mt-1 mb-2">
  {sauceHint ? `${sauceHint} ` : ""}
  Dodatkowe porcje liczymy wg cennika sosów (obecnie 2 zł / porcja).
</p>
        {shouldAutoPrefillFreeSauces && freeSaucesTotal > 0 && (
      <div className="mb-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
        <div className="text-[11px] font-semibold text-black">
          W cenie masz {freeSaucesTotal} {pluralizeSos(freeSaucesTotal)} gratis.
        </div>
        {defaultFreeSaucesSummary ? (
          <div className="text-[11px] text-black/70">
            Domyślnie wybieramy: {defaultFreeSaucesSummary}. Możesz zmienić ilości poniżej.
          </div>
        ) : null}
      </div>
    )}


    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
      <div className="grid grid-cols-[1fr_120px] items-center px-3 py-2 bg-gray-50 text-[11px] font-semibold text-black/70">
        <span>Sos</span>
        <span className="text-right">Ilość</span>
      </div>

      <div className="divide-y divide-black/5">
        {saucesForProduct.map((s) => {
          const qty = getSauceQty(s);

          return (
            <div
              key={s}
              className={clsx(
                "grid grid-cols-[1fr_120px] items-center gap-2 px-3 py-2",
                qty > 0 ? "bg-white" : "bg-white"
              )}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-black leading-snug break-words">
                  {s}
                </div>
                <div className="text-[11px] text-black/60">
                  2,00 zł / porcja
                </div>
              </div>

              <div className="flex items-center justify-end gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => decSauce(s)}
                  disabled={qty === 0}
                  className={clsx(
                    "h-9 w-9 rounded-xl border text-base leading-none flex items-center justify-center",
                    qty === 0
                      ? "opacity-40 cursor-not-allowed border-gray-200 bg-white"
                      : "border-gray-300 hover:bg-gray-50 bg-white"
                  )}
                  aria-label={`Usuń porcję: ${s}`}
                >
                  –
                </button>

                <span className="w-8 text-center text-sm font-semibold text-black/70 tabular-nums">
                  {qty}
                </span>

                <button
                  type="button"
                  onClick={() => incSauce(s)}
                  className="h-9 w-9 rounded-xl border border-black bg-black text-white text-base leading-none flex items-center justify-center hover:opacity-90"
                  aria-label={`Dodaj porcję: ${s}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
)}

        {!isSet && !isDrink && !isDessert && (
          <div>
            <div className="font-semibold mb-1">Dodatki:</div>
            <div className="flex flex-wrap gap-2">
              {EXTRAS.map((ex) => {
                const allowed = canUseExtra(ex);
                const on = prod.addons?.includes(ex);
                return (
                  <button
                    key={ex}
                    onClick={() => allowed && toggleAddon(ex)}
                    className={clsx(
  "px-2 py-1 rounded text-[11px] border",
  on
    ? "bg-black text-white border-black"
    : !allowed
    ? "opacity-40 cursor-not-allowed bg-gray-50 border-gray-200"
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
      </div>

      <div className="flex justify-end items-center mt-2 gap-2 flex-wrap text-[15px]">
        <button
          onClick={() => removeItem(prod.name)}
          className="text-red-600 underline"
        >
          Usuń 1 szt.
        </button>
        <button
          onClick={() => removeWholeItem(prod.name)}
          className="text-red-600 underline"
        >
          Usuń produkt
        </button>
      </div>
    </div>
  );
};
