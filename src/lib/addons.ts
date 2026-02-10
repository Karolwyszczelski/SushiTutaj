// src/lib/addons.ts

export const EXTRAS = ["Tempura", "Płatek sojowy", "Tamago", "Ryba pieczona"] as const;

const DBMOD_PREFIX = "DBMOD|"; // DBMOD|<groupId>|<modifierId>|<priceCents>|<name>
const DBVAR_PREFIX = "DBVAR|"; // DBVAR|<variantId>|<priceCents>|<name>

function parseDbModAddon(addon: string): { priceCents: number; name: string } | null {
  if (!addon.startsWith(DBMOD_PREFIX)) return null;
  const parts = addon.split("|");
  // ["DBMOD", groupId, modifierId, priceCents, ...nameParts]
  if (parts.length < 5) return null;
  const priceCents = Number(parts[3]);
  const name = parts.slice(4).join("|").trim();
  if (!Number.isFinite(priceCents)) return null;
  return { priceCents, name };
}

function parseDbVarAddon(addon: string): { priceCents: number; name: string } | null {
  if (!addon.startsWith(DBVAR_PREFIX)) return null;
  const parts = addon.split("|");
  // ["DBVAR", variantId, priceCents, ...nameParts]
  if (parts.length < 4) return null;
  const priceCents = Number(parts[2]);
  const name = parts.slice(3).join("|").trim();
  if (!Number.isFinite(priceCents)) return null;
  return { priceCents, name };
}


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

export const SWAP_FEE_NAME = "Zamiana w zestawie";
export const RAW_SET_BAKE_ALL = "Zamiana całego zestawu na pieczony";
export const RAW_SET_BAKE_ALL_LEGACY =
  "Zamiana całego zestawu surowego na pieczony (+5 zł)";
export const RAW_SET_BAKE_ROLL_PREFIX = "Zamiana surowej rolki na pieczoną: ";
export const SET_ROLL_EXTRA_PREFIX = "Dodatek do rolki: ";
export const SET_UPGRADE_ADDON = "Powiększenie zestawu";

// NOWE: prefiks dla zestawu SUSHI SPECJAŁ – musi być taki sam jak w CheckoutModal
export const SUSHI_SPECJAL_ADDON_PREFIX = "SUSHI SPECJAŁ: ";

// Cennik dodatków (spójny z CheckoutModal)
const EXTRA_PRICES: Record<string, number> = {
  Tempura: 4,
  "Płatek sojowy": 3, // tu było 4 – wyrównane do frontu
  Tamago: 4,
  "Ryba pieczona": 2,
};

/** Dopłata za wersję pieczoną całego zestawu – per zestaw (z menu) */
const SET_BAKE_PRICES: Record<string, number> = {
  "zestaw 2": 2,
  "zestaw 5": 6,
  "zestaw 7": 2,
  "zestaw 10": 2,
  "zestaw 11": 8,
  "zestaw 12": 4,
  "zestaw 13": 8,
};

/** Zwraca cenę za wersję pieczoną zestawu na podstawie nazwy produktu */
export function getSetBakePriceByName(productName: string): number | null {
  const name = (productName || "").toLowerCase();
  for (const key of Object.keys(SET_BAKE_PRICES)) {
    if (name.startsWith(key) || name.includes(key)) {
      return SET_BAKE_PRICES[key];
    }
  }
  return null;
}

const TARTAR_BASES = [
  "Podanie: na awokado",
  "Podanie: na ryżu",
  "Podanie: na chipsach krewetkowych",
];

export function computeAddonPriceBackend(addon: string, productName?: string): number {

  const dbm = parseDbModAddon(addon);
  if (dbm) return Math.max(0, dbm.priceCents) / 100;

  const dbv = parseDbVarAddon(addon);
  if (dbv) return Math.max(0, dbv.priceCents) / 100;

  // Sosy – tak jak na froncie: 2 zł
  if (ALL_SAUCES.includes(addon)) return 2;

  // Jednorazowa opłata za zamiany w zestawie
  if (addon === SWAP_FEE_NAME) return 5;

  // Bazowe opcje tatara – 0 zł
  if (TARTAR_BASES.includes(addon)) return 0;

  // Zestaw SUSHI SPECJAŁ – wybór proporcji pieczone/surowe, bez dopłaty
  if (addon.startsWith(SUSHI_SPECJAL_ADDON_PREFIX)) return 0;

  // Wersja pieczona całego zestawu – cena zależy od konkretnego zestawu
  if (addon === RAW_SET_BAKE_ALL || addon === RAW_SET_BAKE_ALL_LEGACY) {
    const price = productName ? getSetBakePriceByName(productName) : null;
    return typeof price === "number" ? price : 5; // fallback 5 zł
  }

  // Powiększenie zestawu – fallback 1 zł (front liczy dokładnie po opisie)
  if (addon === SET_UPGRADE_ADDON) {
    return 1;
  }

  // Pojedyncza rolka w zestawie na pieczoną
  if (addon.startsWith(RAW_SET_BAKE_ROLL_PREFIX)) return 2;

  // Addon per rolka w zestawie (np. "Dodatek do rolki: ... — Tempura")
  let label = addon;
  if (addon.startsWith(SET_ROLL_EXTRA_PREFIX)) {
    const after = addon.slice(SET_ROLL_EXTRA_PREFIX.length).trim();
    const parts = after.split("—");
    const maybeExtra = (parts[1] || parts[0] || "").trim();
    const foundBase = EXTRAS.find((ex) =>
      maybeExtra.toLowerCase().includes(ex.toLowerCase())
    );
    if (foundBase) label = foundBase;
  }

  const extraPrice = EXTRA_PRICES[label as keyof typeof EXTRA_PRICES];
  if (typeof extraPrice === "number") return extraPrice;

  // Fallback: nie naliczaj opłaty za nieznane etykiety (bezpieczniej niż „losowe 4 zł”).
  // Log do wykrycia braków w mappingu.
  try {
    console.warn("[addons] Unknown addon label:", addon);
  } catch {}
  return 0;
}
