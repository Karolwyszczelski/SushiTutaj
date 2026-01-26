// src/app/api/orders/create/_lib/notes.ts
import "server-only";

type Any = Record<string, any>;

// ===== NOTE SANITIZE (pozycja) =====
export function stripNoteBeforePipe(v?: string | null): string | null {
  if (!v) return null;
  const left = String(v).split("|")[0].trim();
  return left ? left : null;
}

export function looksLikeAutoSwapSummary(txt: string): boolean {
  const t = (txt || "").trim();
  if (!t) return false;

  const arrows = (t.match(/→/g) || []).length + (t.match(/->/g) || []).length;
  if (arrows === 0) return false;

  // typowe: wiele zamian + separatory / ilości / nowe linie
  if (arrows >= 2) return true;
  if (t.includes(";") || t.includes("\n")) return true;
  if (/\b\d+\s*[x×]\s*\S+/.test(t)) return true;

  return false;
}

export function hasStructuredSwaps(raw: Any): boolean {
  const opt = raw?.options ?? raw?._src?.options ?? null;

  const a = Array.isArray(raw?.swaps) && raw.swaps.length > 0;
  const b = Array.isArray(opt?.swaps) && opt.swaps.length > 0;
  const c = Array.isArray(raw?.set_swaps) && raw.set_swaps.length > 0;
  const d = Array.isArray(opt?.set_swaps) && opt.set_swaps.length > 0;

  return a || b || c || d;
}

export function extractItemNoteCandidate(raw: Any): string | null {
  const opt = raw?.options ?? {};
  const c =
    (typeof raw?.note === "string" && raw.note) ||
    (typeof opt?.note === "string" && opt.note) ||
    (typeof raw?.item_note === "string" && raw.item_note) ||
    (typeof raw?.customer_note === "string" && raw.customer_note) ||
    (typeof raw?.client_note === "string" && raw.client_note) ||
    (typeof opt?.customer_note === "string" && opt.customer_note) ||
    (typeof opt?.client_note === "string" && opt.client_note) ||
    (typeof opt?.comment === "string" && opt.comment) ||
    (typeof raw?.comment === "string" && raw.comment) ||
    null;

  return c ? String(c) : null;
}

export function sanitizeItemNote(raw: Any): string | undefined {
  const candidateRaw = extractItemNoteCandidate(raw);
  if (!candidateRaw) return undefined;

  // 1) Jeśli jest pipe, traktujemy lewą stronę jako “prawdziwą” notatkę klienta
  const left = stripNoteBeforePipe(candidateRaw);
  if (left) return left;

  const candidate = candidateRaw.trim();
  if (!candidate) return undefined;

  // 2) Jeśli wygląda jak auto-podsumowanie zamian I mamy swapy strukturalnie -> wywalamy notatkę
  if (looksLikeAutoSwapSummary(candidate) && hasStructuredSwaps(raw)) {
    return undefined;
  }

  // 3) W innym wypadku zostaw (żeby nic nie zginęło)
  return candidate;
}
