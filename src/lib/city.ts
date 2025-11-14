export type CitySlug = 'ciechanow' | 'przasnysz' | 'szczytno' | 'default';

export function normalizeCitySlug(input?: string): CitySlug {
  const s = (input || '').toLowerCase();
  if (s === 'ciechanow' || s === 'przasnysz' || s === 'szczytno') return s;
  return 'ciechanow';
}
