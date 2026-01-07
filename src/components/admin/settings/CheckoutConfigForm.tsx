"use client";

import React, { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { Loader2, Save, Info, Package, Clock, MapPin } from "lucide-react";

type CheckoutConfig = {
  packagingCost: number;
  minScheduleMinutes: number;
  slotStepMinutes: number;
  requireAutocomplete: boolean;
};

const DEFAULT_CONFIG: CheckoutConfig = {
  packagingCost: 3.0,
  minScheduleMinutes: 60,
  slotStepMinutes: 20,
  requireAutocomplete: true,
};

function safeNumber(input: string, fallback: number) {
  const n = Number(String(input ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(n: number, min: number, max: number) {
  const v = Math.round(n);
  return Math.max(min, Math.min(max, v));
}

function clampFloat(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function CheckoutConfigForm({ restaurantId }: { restaurantId: string | null }) {
  const supabase = getSupabaseBrowser();

  const [config, setConfig] = useState<CheckoutConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadConfig = useCallback(async () => {
    if (!restaurantId) return;

    setLoading(true);
    setNotice(null);

    const { data, error } = await supabase
      .from("restaurants")
      .select("checkout_config")
      .eq("id", restaurantId)
      .maybeSingle();

    if (error) {
      console.error("CheckoutConfigForm: błąd load", error);
      setConfig(DEFAULT_CONFIG);
      setNotice({ type: "error", text: "Nie udało się pobrać ustawień. Wczytano domyślne." });
      setLoading(false);
      return;
    }

    const raw = (data as any)?.checkout_config;
    if (raw && typeof raw === "object") {
      setConfig({
        ...DEFAULT_CONFIG,
        ...raw,
        packagingCost: clampFloat(safeNumber(raw.packagingCost, DEFAULT_CONFIG.packagingCost), 0, 9999),
        minScheduleMinutes: clampInt(safeNumber(raw.minScheduleMinutes, DEFAULT_CONFIG.minScheduleMinutes), 0, 1440),
        slotStepMinutes: clampInt(safeNumber(raw.slotStepMinutes, DEFAULT_CONFIG.slotStepMinutes), 1, 240),
        requireAutocomplete: typeof raw.requireAutocomplete === "boolean" ? raw.requireAutocomplete : DEFAULT_CONFIG.requireAutocomplete,
      });
    } else {
      setConfig(DEFAULT_CONFIG);
    }

    setLoading(false);
  }, [restaurantId, supabase]);

  useEffect(() => {
    if (!restaurantId) return;
    void loadConfig();
  }, [restaurantId, loadConfig]);

  const handleSave = useCallback(async () => {
    if (!restaurantId) return;
    setSaving(true);
    setNotice(null);

    try {
      const payload: CheckoutConfig = {
        packagingCost: clampFloat(Number(config.packagingCost || 0), 0, 9999),
        minScheduleMinutes: clampInt(Number(config.minScheduleMinutes || 0), 0, 1440),
        slotStepMinutes: clampInt(Number(config.slotStepMinutes || 1), 1, 240),
        requireAutocomplete: !!config.requireAutocomplete,
      };

      const { error } = await supabase
        .from("restaurants")
        .update({ checkout_config: payload })
        .eq("id", restaurantId);

      if (error) throw error;

      setNotice({ type: "success", text: "Zapisano ustawienia sklepu." });
    } catch (e) {
      console.error("CheckoutConfigForm: błąd zapisu", e);
      setNotice({ type: "error", text: "Błąd zapisu ustawień." });
    } finally {
      setSaving(false);
    }
  }, [restaurantId, supabase, config]);

  if (!restaurantId) {
    return <div className="text-sm text-slate-500">Brak restauracji — wybierz lokal.</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-500 gap-2">
        <Loader2 className="animate-spin" size={20} /> Ładowanie ustawień...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header formularza */}
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
        <div>
          <h3 className="text-base font-bold text-slate-800">Ustawienia koszyka</h3>
          <p className="text-xs text-slate-500">Zarządzaj kosztami globalnymi i czasem realizacji.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadConfig()}
            disabled={saving}
            className="hidden sm:inline-flex items-center gap-2 border border-slate-200 bg-white text-slate-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 transition disabled:opacity-50"
            title="Odśwież ustawienia z bazy"
          >
            Odśwież
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 transition disabled:opacity-50 shadow-md"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Zapisz
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`px-6 py-3 text-sm border-b ${
            notice.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-100"
              : "bg-rose-50 text-rose-800 border-rose-100"
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="p-6 space-y-8">
        {/* SEKCJA 1: KOSZTY */}
        <section className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
          <div className="text-slate-600">
            <div className="flex items-center gap-2 font-semibold text-slate-900 mb-1">
              <Package size={18} className="text-emerald-600" />
              Opłaty
            </div>
            <p className="text-xs leading-relaxed">Koszty doliczane automatycznie do każdego zamówienia.</p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Koszt opakowania</label>
            <div className="relative max-w-xs">
              <input
                type="number"
                step="0.01"
                value={config.packagingCost}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    packagingCost: clampFloat(safeNumber(e.target.value, prev.packagingCost), 0, 9999),
                  }))
                }
                className="w-full pl-4 pr-12 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all font-medium"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">PLN</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Kwota ta zostanie doliczona do sumy zamówienia jako „Opakowanie”.</p>
          </div>
        </section>

        <div className="h-px bg-slate-100" />

        {/* SEKCJA 2: CZAS */}
        <section className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
          <div className="text-slate-600">
            <div className="flex items-center gap-2 font-semibold text-slate-900 mb-1">
              <Clock size={18} className="text-blue-600" />
              Czas realizacji
            </div>
            <p className="text-xs leading-relaxed">Steruj tym, jak szybko klienci mogą zamawiać jedzenie „na godzinę”.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Min. czas oczekiwania</label>
              <div className="relative">
                <input
                  type="number"
                  value={config.minScheduleMinutes}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      minScheduleMinutes: clampInt(safeNumber(e.target.value, prev.minScheduleMinutes), 0, 1440),
                    }))
                  }
                  className="w-full pl-4 pr-12 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">min</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Najwcześniejszy slot: <i>Teraz + X min</i>.</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Krok czasowy (sloty)</label>
              <div className="relative">
                <input
                  type="number"
                  value={config.slotStepMinutes}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      slotStepMinutes: clampInt(safeNumber(e.target.value, prev.slotStepMinutes), 1, 240),
                    }))
                  }
                  className="w-full pl-4 pr-12 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">min</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Np. 20 min = 12:00, 12:20, 12:40…</p>
            </div>
          </div>
        </section>

        <div className="h-px bg-slate-100" />

        {/* SEKCJA 3: GOOGLE MAPS */}
        <section className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
          <div className="text-slate-600">
            <div className="flex items-center gap-2 font-semibold text-slate-900 mb-1">
              <MapPin size={18} className="text-rose-600" />
              Adresy
            </div>
            <p className="text-xs leading-relaxed">Walidacja i podpowiedzi adresowe.</p>
          </div>

          <div
            className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4 cursor-pointer hover:border-slate-300 transition-colors"
            onClick={() => setConfig((prev) => ({ ...prev, requireAutocomplete: !prev.requireAutocomplete }))}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setConfig((prev) => ({ ...prev, requireAutocomplete: !prev.requireAutocomplete }));
              }
            }}
          >
            <div>
              <label className="block text-sm font-bold text-slate-900 cursor-pointer">
                Wymagaj wyboru z listy Google Maps
              </label>
              <p className="text-xs text-slate-500 mt-1">
                Zablokuj ręczne wpisywanie ulicy. Klient musi wybrać podpowiedź z mapy.
                <br />
                Zalecane dla poprawnego obliczania stref dostaw.
              </p>
            </div>

            <div
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 ease-in-out shrink-0 ${
                config.requireAutocomplete ? "bg-emerald-500" : "bg-slate-300"
              }`}
              aria-hidden="true"
            >
              <div
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ease-in-out ${
                  config.requireAutocomplete ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Info footer */}
      <div className="bg-sky-50 px-6 py-3 border-t border-sky-100 flex gap-3 text-sky-800 text-xs items-start">
        <Info className="shrink-0 mt-0.5" size={16} />
        <p>
          <strong>Ceny dodatków</strong> (np. Tempura +4 zł) oraz <strong>warianty produktów</strong> (np. smak Bubble Tea)
          edytujesz bezpośrednio w edycji każdego produktu (zakładka „Menu”). Te ustawienia tutaj dotyczą całego sklepu.
        </p>
      </div>
    </div>
  );
}