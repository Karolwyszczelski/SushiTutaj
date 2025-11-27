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

const EXTRA_PRICES: Record<string, number> = {
  Tempura: 4,
  "Płatek sojowy": 4,
  Tamago: 4,
  "Ryba pieczona": 2,
};

const TARTAR_BASES = [
  "Podanie: na awokado",
  "Podanie: na ryżu",
  "Podanie: na chipsach krewetkowych",
];

export function computeAddonPriceBackend(addon: string): number {
  if (ALL_SAUCES.includes(addon)) return 3;
  if (addon === SWAP_FEE_NAME) return 5;
  if (TARTAR_BASES.includes(addon)) return 0;

  if (addon === RAW_SET_BAKE_ALL || addon === RAW_SET_BAKE_ALL_LEGACY) {
    // tu backend może policzyć dokładniej po produkcie, ale jako fallback:
    return 5;
  }

  if (addon === SET_UPGRADE_ADDON) {
    return 1; // fallback, tak jak na froncie
  }

  if (addon.startsWith(RAW_SET_BAKE_ROLL_PREFIX)) return 2;

  // addon per rolka w zestawie
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

  return 4;
}
