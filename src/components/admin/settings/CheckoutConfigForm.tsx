"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/**
 * Konfiguracja v1:
 * - sauces: lista sosów (key = stały identyfikator, label = nazwa dla UI)
 * - rules: lista reguł dopasowania (po nazwie/subkategorii) i naliczania gratisów
 * Uwaga: Checkout zawsze powinien mieć fallback (gdy config jest pusty / zepsuty).
 */

const DEFAULT_CONFIG = {
  version: 1,
  sauces: [
    { key: "soy", label: "Sos sojowy", price_cents: 200, enabled: true },
    { key: "teriyaki", label: "Teryiaki", price_cents: 200, enabled: true },
    { key: "mayo", label: "Spicy Mayo", price_cents: 200, enabled: true },
    { key: "toffi", label: "Sos toffi", price_cents: 200, enabled: true },
    { key: "choco", label: "Sos czekoladowy", price_cents: 200, enabled: true }
  ],
  saucePriority: ["soy", "teriyaki", "mayo", "toffi", "choco"],
  rules: [
    // ROLKI: zawsze 1x soja gratis
    {
      id: "rolls_soy_free",
      enabled: true,
      match: { subcategoryIncludes: ["rolki", "roll", "hoso", "futo", "california"] },
      action: { type: "perSauce", freeBySauce: { soy: 1 }, hint: "1× sos sojowy gratis do rolek." }
    },

    // ZESTAWY / SETY / LUNCHE / VEGE SETY: tier wg nazwy
    {
      id: "sets_tiers",
      enabled: true,
      match: { nameIncludes: ["zestaw", "set", "lunch", "vege set", "nigiri set", "zestaw miesiąca"] },
      action: {
        type: "countByNameRegex",
        tiers: [
          { nameRegex: "\\bzestaw[\\s\\-]*([1-7])\\b", freeCount: 1 },
          { nameRegex: "\\bzestaw[\\s\\-]*(8|9|10|11|12)\\b", freeCount: 2 },
          { nameRegex: "\\bzestaw[\\s\\-]*13\\b", freeCount: 3 },
          { nameRegex: "\\b100\\s*szt\\b|\\b100szt\\b", freeCount: 4 },
          { nameRegex: "tutaj\\s*specjal|turtaj\\s*specjal", freeCount: 2 },
          { nameRegex: "zestaw\\s*miesi[aą]ca", freeCount: 1 },
          { nameRegex: "nigiri\\s*set", freeCount: 1 },
          { nameRegex: "\\blunch[\\s\\-]*[123]\\b", freeCount: 1 },
          { nameRegex: "\\bvege[\\s\\-]*set[\\s\\-]*[12]\\b", freeCount: 1 }
        ],
        defaultFreeCount: 1,
        eligibleSauces: "ALL",
        hintTpl: "W cenie: {N} sos(y) gratis do zestawu."
      }
    },

    // PRZYSTAWKI: bataty -> 1 wybrany z listy
    {
      id: "sweet_potato_fries",
      enabled: true,
      match: { nameIncludes: ["frytki z batat", "frytki batat"] },
      action: {
        type: "count",
        freeCount: 1,
        eligibleSauces: ["teriyaki", "mayo", "toffi", "choco"],
        hint: "Do batatów: 1 wybrany sos gratis."
      }
    },

    // TEMPURA MIX -> 1 teryiaki + 1 mayo
    {
      id: "tempura_mix",
      enabled: true,
      match: { nameIncludes: ["tempura mix"] },
      action: {
        type: "perSauce",
        freeBySauce: { teriyaki: 1, mayo: 1 },
        hint: "Do tempura mix: 1× teryiaki i 1× mayo gratis."
      }
    },

    // KREWETKI W TEMPURZE -> 1 teryiaki + 1 mayo
    {
      id: "shrimp_tempura",
      enabled: true,
      match: { nameIncludes: ["krewetki w tempurze", "krewetka w tempurze"] },
      action: {
        type: "perSauce",
        freeBySauce: { teriyaki: 1, mayo: 1 },
        hint: "Do krewetek: 1× teryiaki i 1× mayo gratis."
      }
    }
  ],
  options: {
    // możesz tu trzymać też drinkFlavors itd., jeśli chcesz mieć jedno miejsce na checkout-config
  }
};

function safeParseJson(text: string) {
  try {
    return { ok: true as const, value: JSON.parse(text) };
  } catch (e: any) {
    return { ok: false as const, error: e?.message || "Nieprawidłowy JSON" };
  }
}

function validateConfig(cfg: any): string | null {
  if (!cfg || typeof cfg !== "object") return "Config musi być obiektem JSON.";
  if (cfg.version !== 1) return "Obsługiwana jest tylko wersja configu: version=1.";

  if (!Array.isArray(cfg.sauces)) return "Pole 'sauces' musi być tablicą.";
  const keys = new Set<string>();
  for (const s of cfg.sauces) {
    if (!s?.key || typeof s.key !== "string") return "Każdy sos musi mieć 'key' (string).";
    if (keys.has(s.key)) return `Duplikat key w sauces: '${s.key}'.`;
    keys.add(s.key);
    if (!s?.label || typeof s.label !== "string") return `Sos '${s.key}' musi mieć label (string).`;
    if (!Number.isFinite(Number(s.price_cents))) return `Sos '${s.key}' musi mieć price_cents (number).`;
  }

  if (cfg.saucePriority && !Array.isArray(cfg.saucePriority))
    return "Pole 'saucePriority' musi być tablicą (albo usuń).";

  if (cfg.rules && !Array.isArray(cfg.rules)) return "Pole 'rules' musi być tablicą.";

  return null;
}

export default function CheckoutConfigForm({ restaurantId }: { restaurantId: string | null }) {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [raw, setRaw] = useState(JSON.stringify(DEFAULT_CONFIG, null, 2));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    let stop = false;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data, error } = await supabase
          .from("restaurant_checkout_config")
          .select("config")
          .eq("restaurant_id", restaurantId)
          .maybeSingle();

        if (error) throw error;
        if (stop) return;

        const cfg = (data as any)?.config ?? DEFAULT_CONFIG;
        setRaw(JSON.stringify(cfg, null, 2));
      } catch (e: any) {
        if (!stop) setErr(e?.message || "Nie udało się wczytać konfiguracji.");
      } finally {
        if (!stop) setLoading(false);
      }
    })();

    return () => {
      stop = true;
    };
  }, [restaurantId, supabase]);

  const save = async () => {
    if (!restaurantId) return;
    setErr(null);
    setOkMsg(null);

    const parsed = safeParseJson(raw);
    if (!parsed.ok) {
      setErr(parsed.error);
      return;
    }

    const vErr = validateConfig(parsed.value);
    if (vErr) {
      setErr(vErr);
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("restaurant_checkout_config")
        .upsert(
          { restaurant_id: restaurantId, config: parsed.value, updated_by: null },
          { onConflict: "restaurant_id" }
        );

      if (error) throw error;
      setOkMsg("Zapisano konfigurację.");
    } catch (e: any) {
      setErr(e?.message || "Nie udało się zapisać konfiguracji.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      {err && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {err}
        </div>
      )}
      {okMsg && (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {okMsg}
        </div>
      )}

      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setRaw(JSON.stringify(DEFAULT_CONFIG, null, 2));
            setErr(null);
            setOkMsg(null);
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Wstaw domyślne
        </button>

        <button
          type="button"
          onClick={save}
          disabled={saving || loading || !restaurantId}
          className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Zapisuję…" : "Zapisz"}
        </button>
      </div>

      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        spellCheck={false}
        className="min-h-[320px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
      />
    </div>
  );
}
