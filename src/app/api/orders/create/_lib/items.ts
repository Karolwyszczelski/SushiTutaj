import { num, toArray } from "./normalize";
import {
  nameFromProductRow,
  descFromProductRow,
  ingredientsFromProductRow,
  parseIngredients,
  type ProductRow,
} from "./products";
import { sanitizeItemNote } from "./notes";

export type Any = Record<string, any>;

export type NormalizedItem = {
  name: string;
  quantity: number;
  price: number;
  addons: string[];
  ingredients: string[];
  note?: string;
  description?: string;
  _src?: Any;
};

// OCZYSZCZONA wersja (bez mięsa z poprzedniego systemu)
export function buildItemFromDbAndOptions(
  dbRow: ProductRow | undefined,
  raw: Any
): NormalizedItem {
  const baseName =
    nameFromProductRow(dbRow) ||
    raw.name ||
    raw.product_name ||
    raw.productName ||
    raw.title ||
    raw.label ||
    "(bez nazwy)";

  const quantity = (num(raw.quantity ?? raw.qty ?? 1, 1) ?? 1) as number;
  const price = (num(raw.price ?? raw.unit_price ?? raw.total_price ?? 0, 0) ??
    0) as number;

  const opt = raw.options ?? {};
  const addons: string[] = [
    ...toArray(raw.addons),
    ...toArray(opt.addons),
    ...toArray(raw.extras),
    ...toArray(raw.toppings),
    ...toArray(raw.selected_addons),
  ]
    .flat()
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean);

  const baseIngredients = ingredientsFromProductRow(dbRow);
  const clientIng = [
    ...parseIngredients(raw.ingredients),
    ...parseIngredients(raw.sklad),
    ...parseIngredients(raw.composition),
  ];
  const ingredients = [...baseIngredients, ...clientIng];

  const note = sanitizeItemNote(raw);

  const description =
    (typeof raw.description === "string" && raw.description) ||
    descFromProductRow(dbRow);

  return {
    name: String(baseName),
    quantity,
    price,
    addons,
    ingredients,
    note,
    description,
    _src: raw,
  };
}
