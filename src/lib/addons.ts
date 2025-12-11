// src/lib/addons.ts

export const EXTRAS = ["Tempura", "Płatek sojowy", "Tamago", "Ryba pieczona"] as const;

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

const TARTAR_BASES = [
  "Podanie: na awokado",
  "Podanie: na ryżu",
  "Podanie: na chipsach krewetkowych",
];

export function computeAddonPriceBackend(addon: string): number {
  // Sosy – tak jak na froncie: 2 zł
  if (ALL_SAUCES.includes(addon)) return 2;

  // Jednorazowa opłata za zamiany w zestawie
  if (addon === SWAP_FEE_NAME) return 5;

  // Bazowe opcje tatara – 0 zł
  if (TARTAR_BASES.includes(addon)) return 0;

  // Zestaw SUSHI SPECJAŁ – wybór proporcji pieczone/surowe, bez dopłaty
  if (addon.startsWith(SUSHI_SPECJAL_ADDON_PREFIX)) return 0;

  // Wersja pieczona całego zestawu – fallback 5 zł (precyzyjniej liczy front)
  if (addon === RAW_SET_BAKE_ALL || addon === RAW_SET_BAKE_ALL_LEGACY) {
    return 5;
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

  // Fallback, gdy pojawi się nietypowy addon
  return 4;
}
