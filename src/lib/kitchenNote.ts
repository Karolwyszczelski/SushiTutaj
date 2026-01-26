// src/lib/kitchenNote.ts
import {
  RAW_SET_BAKE_ALL,
  RAW_SET_BAKE_ALL_LEGACY,
  RAW_SET_BAKE_ROLL_PREFIX,
  SET_ROLL_EXTRA_PREFIX,
  SET_UPGRADE_ADDON,
} from "../lib/addons";

type OrderItemPayload = {
  name: string;
  quantity: number;
  unit_price: number | string;
  options?: {
    addons?: string[];
    swaps?: { from: string; to: string }[];
    note?: string;
  };
};

export function buildKitchenNote(items: OrderItemPayload[]): string {
  const lines: string[] = [];

  for (const it of items) {
    const qty = it.quantity || 1;
    const addons = it.options?.addons ?? [];
    const swaps = it.options?.swaps ?? [];
    const note = (it.options?.note || "").trim();

    lines.push(`• ${it.name} ×${qty}`);

    if (swaps.length > 0) {
      lines.push("    Zamiany:");
      for (const s of swaps) {
        if (!s || !s.from || !s.to) continue;
        lines.push(`    - ${s.from} → ${s.to}`);
      }
    }

    // CAŁY ZESTAW PIECZONY
    const hasWholeBake =
      addons.includes(RAW_SET_BAKE_ALL) ||
      addons.includes(RAW_SET_BAKE_ALL_LEGACY);
    if (hasWholeBake) {
      lines.push("    CAŁY ZESTAW PIECZONY");
    }

    // POSZCZEGÓLNE ROLKI PIECZONE
    const bakedRolls = addons.filter((a) =>
      a.startsWith(RAW_SET_BAKE_ROLL_PREFIX)
    );
    for (const a of bakedRolls) {
      const roll = a.slice(RAW_SET_BAKE_ROLL_PREFIX.length).trim();
      if (!roll) continue;
      lines.push(`    ROLKA PIECZONA: ${roll}`);
    }

    // DODATKI PER ROLKA
    const perRollExtras = addons.filter((a) =>
      a.startsWith(SET_ROLL_EXTRA_PREFIX)
    );
    if (perRollExtras.length > 0) {
      lines.push("    Dodatki do rolek:");
      for (const a of perRollExtras) {
        const after = a.slice(SET_ROLL_EXTRA_PREFIX.length).trim();
        const [roll, extra] = after.split("—");
        const rollLabel = (roll || "").trim();
        const extraLabel = (extra || roll || "").trim();
        if (!rollLabel && !extraLabel) continue;
        lines.push(
          `    - ${rollLabel || "rolka"}: ${extraLabel || "dodatek"}`
        );
      }
    }

    // POWIĘKSZENIE ZESTAWU
    if (addons.includes(SET_UPGRADE_ADDON)) {
      lines.push("    ZESTAW POWIĘKSZONY (+szt)");
    }

    // POZOSTAŁE DODATKI (sosy itd.)
    const leftovers = addons.filter(
      (a) =>
        !a.startsWith(RAW_SET_BAKE_ROLL_PREFIX) &&
        !a.startsWith(SET_ROLL_EXTRA_PREFIX) &&
        a !== RAW_SET_BAKE_ALL &&
        a !== RAW_SET_BAKE_ALL_LEGACY &&
        a !== SET_UPGRADE_ADDON
    );
    if (leftovers.length > 0) {
      lines.push(`    Dodatki: ${leftovers.join(", ")}`);
    }

    if (note) {
      lines.push(`    Notatka: ${note}`);
    }
  }

  return lines.join("\n");
}
