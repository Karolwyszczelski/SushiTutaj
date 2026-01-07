// src/app/api/orders/create/_lib/lunch.ts
import "server-only";

// START: LUNCH BLOCK (SERVER)
export const LUNCH_CUTOFF_MINUTES = 16 * 60; // 16:00

function normalizePlain(input: string): string {
  return (input || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase();
}

export function isLunchItemServer(itemName: string, subcat?: string | null): boolean {
  const namePlain = normalizePlain(String(itemName || ""));
  const subPlain = normalizePlain(String(subcat || ""));
  return /lunch|lunche/.test(subPlain) || /\blunch\b/.test(namePlain);
}
// END: LUNCH BLOCK (SERVER)
