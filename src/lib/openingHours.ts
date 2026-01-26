// src/lib/openingHours.ts
const tz = "Europe/Warsaw";

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (h: number, m: number) => `${pad(h)}:${pad(m)}`;

type Day = 0|1|2|3|4|5|6; // 0=nd
type Range = [h:number, m:number, H:number, M:number];

const SCHEDULE: Record<string, Partial<Record<Day, Range>> & {default?: Range}> = {
  ciechanow: {
    0: [12, 0, 20, 30], // nd
    1: [12, 0, 20, 30],
    2: [12, 0, 20, 30],
    3: [12, 0, 20, 30],
    4: [12, 0, 20, 30], // pt
    5: [12, 0, 21, 30], // sob
    6: [12, 0, 21, 30],
  },
  przasnysz: { default: [12, 0, 20, 30] }, // codziennie
  szczytno:  { default: [12, 0, 20, 30] }, // codziennie
};

export const plNow = (d = new Date()) =>
  new Date(d.toLocaleString("en-CA", { timeZone: tz }));

export function isOpenNow(slug: string, d = plNow()) {
  const sch = SCHEDULE[slug] ?? SCHEDULE["przasnysz"];
  const wd = d.getDay() as Day;
  const r = sch[wd] ?? sch.default;
  if (!r) return { open: false, openLabel: "zamknięte" };

  const mins = d.getHours() * 60 + d.getMinutes();
  const openM = r[0] * 60 + r[1];
  const closeM = r[2] * 60 + r[3];
  const open = mins >= openM && mins <= closeM;

  return { open, openLabel: `${fmt(r[0], r[1])}–${fmt(r[2], r[3])}` };
}
