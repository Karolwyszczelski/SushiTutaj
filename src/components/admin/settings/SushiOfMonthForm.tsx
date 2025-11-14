"use client";

import React, { useEffect, useMemo, useState, FormEvent, useCallback } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { RotateCcw, Save } from "lucide-react";

type Row = {
  id?: string;
  legacy_id: string | null;          // "current"
  name: string | null;
  description: string | null;
  image_url: string | null;
  product_id: string | null;
  product_slug: string | null;
  restaurant_id: string | null;      // istnieje w bazie, ale traktujemy globalnie
  starts_on: string | null;          // YYYY-MM-DD
  ends_on: string | null;            // YYYY-MM-DD
  promo_price_cents: number | null;  // int
  is_active: boolean | null;
};

const toCents = (v: string) => {
  const n = Number((v || "0").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const fromCents = (v: number | null | undefined) =>
  ((v ?? 0) / 100).toFixed(2);

export default function SushiOfMonthForm() {
  const supabase = useMemo(() => createClientComponentClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // dane formularza
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [productId, setProductId] = useState("");
  const [productSlug, setProductSlug] = useState("");
  const [startsOn, setStartsOn] = useState<string>("");
  const [endsOn, setEndsOn] = useState<string>("");
  const [promoPrice, setPromoPrice] = useState<string>(""); // w PLN
  const [isActive, setIsActive] = useState<boolean>(true);

  // wczytaj ostatnią wersję "current" (dowolnej restauracji)
  useEffect(() => {
    let stop = false;
    (async () => {
      setLoading(true);
      setError(null);
      setInfo(null);
      try {
        // weź pierwszy lepszy "current" (jeśli masz wiele – i tak nadpisujemy wszystkie przy zapisie)
        const { data, error } = await supabase
          .from("sushi_of_month")
          .select("*")
          .eq("legacy_id", "current")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error && error.code !== "PGRST116") throw error; // ignore "no rows"
        const r = (data as Row | null) || null;

        setName(r?.name ?? "");
        setDescription(r?.description ?? "");
        setImageUrl(r?.image_url ?? "");
        setProductId(r?.product_id ?? "");
        setProductSlug(r?.product_slug ?? "");
        setStartsOn(r?.starts_on ?? "");
        setEndsOn(r?.ends_on ?? "");
        setPromoPrice(fromCents(r?.promo_price_cents ?? 0));
        setIsActive(Boolean(r?.is_active ?? true));
      } catch (e: any) {
        if (!stop) setError(e?.message || "Błąd wczytywania.");
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [supabase]);

  const resetInfoLater = useCallback(() => {
    setTimeout(() => setInfo(null), 2500);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      // 1) Pobierz listę wszystkich restauracji
      const { data: restaurants, error: rErr } = await supabase
        .from("restaurants")
        .select("id");
      if (rErr) throw rErr;
      const allRestaurantIds = (restaurants || []).map((r: any) => r.id as string);

      // 2) Zbuduj payload
      const payload = {
        legacy_id: "current",
        name: name || null,
        description: description || null,
        image_url: imageUrl || null,
        product_id: productId || null,
        product_slug: productSlug || null,
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        promo_price_cents: toCents(promoPrice),
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };

      // 3) Zaktualizuj wszystko co istnieje (legacy_id='current') jednym strzałem
      //    – dzięki temu każda istniejąca restauracja dostaje te same wartości.
      const { error: upAllErr } = await supabase
        .from("sushi_of_month")
        .update(payload)
        .eq("legacy_id", "current");
      if (upAllErr && upAllErr.code !== "PGRST116") throw upAllErr;

      // 4) Sprawdź, gdzie nie ma jeszcze wiersza i dodaj brakujące
      const { data: existing, error: exErr } = await supabase
        .from("sushi_of_month")
        .select("restaurant_id")
        .eq("legacy_id", "current");
      if (exErr) throw exErr;

      const existSet = new Set<string>(
        (existing || [])
          .map((x: any) => x.restaurant_id)
          .filter(Boolean)
      );

      const missing = allRestaurantIds.filter((id) => !existSet.has(id));
      if (missing.length > 0) {
        const rows = missing.map((rid) => ({ ...payload, restaurant_id: rid }));
        const { error: insErr } = await supabase.from("sushi_of_month").insert(rows);
        if (insErr) throw insErr;
      }

      setInfo("Zapisano i zsynchronizowano we wszystkich restauracjach.");
      resetInfoLater();
    } catch (e: any) {
      setError(e?.message || "Błąd zapisu.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Ładowanie…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
          {info}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">Nazwa</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">Cena promocyjna (PLN)</label>
          <input
            value={promoPrice}
            onChange={(e) => setPromoPrice(e.target.value)}
            inputMode="decimal"
            placeholder="np. 99.00"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">Opis</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">Data od</label>
          <input
            type="date"
            value={startsOn || ""}
            onChange={(e) => setStartsOn(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">Data do</label>
          <input
            type="date"
            value={endsOn || ""}
            onChange={(e) => setEndsOn(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">URL obrazka (opcjonalnie)</label>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">Powiązany produkt (ID/Slug – opcjonalnie)</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="product_id (UUID)"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
            <input
              value={productSlug}
              onChange={(e) => setProductSlug(e.target.value)}
              placeholder="product_slug"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-400"
            />
            <span className="text-sm text-slate-800">Aktywne</span>
          </label>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
        >
          <RotateCcw className="h-4 w-4" /> Odrzuć zmiany
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> Zapisz i zastosuj wszędzie
        </button>
      </div>
    </form>
  );
}
