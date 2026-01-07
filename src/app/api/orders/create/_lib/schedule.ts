// src/app/api/orders/create/_lib/schedule.ts
import "server-only";
import { toZonedTime } from "date-fns-tz";

/* ===== Godziny otwarcia per miasto ===== */
export type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = niedziela
export type Range = [h: number, m: number, H: number, M: number];

const SCHEDULE: Record<string, Partial<Record<Day, Range>> & { default?: Range }> =
  {
    // Ciechanów: pon–niedz 12:00–20:30, pt 12:00–21:30
    ciechanow: {
      0: [12, 0, 20, 30],
      1: [12, 0, 20, 30],
      2: [12, 0, 20, 30],
      3: [12, 0, 20, 30],
      4: [12, 0, 20, 30],
      5: [12, 0, 21, 30],
      6: [12, 0, 20, 30],
    },
    // Przasnysz / Szczytno – domyślnie 12–20:30
    przasnysz: { default: [12, 0, 20, 30] },
    szczytno: { default: [12, 0, 20, 30] },
  };

export const tz = "Europe/Warsaw";

// „prawdziwe teraz” (chwila czasu)
export const nowInstant = () => new Date();

// „widok” teraz w PL (tylko do getHours/getDay itp.)
export const nowPL = (d = nowInstant()) => toZonedTime(d, tz);

export const pad2 = (n: number) => String(n).padStart(2, "0");

const fmt = (r: Range) => `${pad2(r[0])}:${pad2(r[1])}–${pad2(r[2])}:${pad2(r[3])}`;

export function isOpenFor(slug: string, d = nowPL()) {
  const sch = SCHEDULE[slug] ?? SCHEDULE["przasnysz"];
  const wd = d.getDay() as Day;
  const r = sch[wd] ?? sch.default;
  if (!r) return { open: false, label: "zamknięte" };
  const mins = d.getHours() * 60 + d.getMinutes();
  const openM = r[0] * 60 + r[1];
  const closeM = r[2] * 60 + r[3];
  return { open: mins >= openM && mins <= closeM, label: fmt(r) };
}
