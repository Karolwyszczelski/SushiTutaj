"use client";

import React, {
  useEffect,
  useState,
  useMemo,
  FormEvent,
  useCallback,
} from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { RotateCcw, Save, Upload, X, Image as ImageIcon } from "lucide-react";

type Row = {
  id?: string;
  legacy_id: string | null; // "current"
  name: string | null;
  description: string | null;
  image_url: string | null;
  product_id: string | null;
  restaurant_id: string | null;
  starts_on: string | null; // YYYY-MM-DD
  ends_on: string | null; // YYYY-MM-DD
  promo_price_cents: number | null; // int
  is_active: boolean | null;
};

const SOM_BUCKET = process.env.NEXT_PUBLIC_SOM_BUCKET || "menu";
const MAX_MB = 6;

// domyślny obrazek z public/
const DEFAULT_LOCAL_IMAGE = "/assets/menuphoto/zestaw-miesiaca.png";

// stała ścieżka w Storage (nadpisywanie = “podmiana”)
const SOM_STORAGE_PATH = "som/zestaw-miesiaca";

const toCentsNullable = (v: string): number | null => {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const fromCentsNullable = (v: number | null | undefined) => {
  if (v == null) return "";
  return (v / 100).toFixed(2);
};

function safeExt(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (!ext) return "jpg";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return ext;
  return "jpg";
}

function withCacheBuster(url: string, buster: number) {
  if (!url) return url;
  // lokalne assety nie potrzebują cache-bustera
  if (url.startsWith("/")) return url;
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}v=${buster}`;
}

export default function SushiOfMonthForm() {
  const supabase = getSupabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // dane formularza
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // to jest URL, który zapisujemy do DB (bez cache-bustera)
  const [imageUrl, setImageUrl] = useState("");
  const [startsOn, setStartsOn] = useState<string>("");
  const [endsOn, setEndsOn] = useState<string>("");
  const [promoPrice, setPromoPrice] = useState<string>(""); // PLN
  const [isActive, setIsActive] = useState<boolean>(true);

  // cache-buster tylko do podglądu
  const [previewBuster, setPreviewBuster] = useState<number>(() => Date.now());

  // opcjonalnie: aktualizuj produkty w menu
  const [syncProducts, setSyncProducts] = useState(true);

  const resetInfoLater = useCallback(() => {
    window.setTimeout(() => setInfo(null), 2500);
  }, []);

  const previewUrl = useMemo(
    () => withCacheBuster(imageUrl, previewBuster),
    [imageUrl, previewBuster]
  );

  const setImageUrlSafe = useCallback((v: string) => {
    setImageUrl(v);
    // odśwież podgląd przy ręcznej zmianie URL
    setPreviewBuster(Date.now());
  }, []);

  // upload do Storage + ustaw public URL w polu imageUrl
  const uploadImage = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      setInfo(null);

      try {
        if (!file) return;

        const sizeMb = file.size / 1024 / 1024;
        if (sizeMb > MAX_MB) {
          throw new Error(`Plik za duży. Max ${MAX_MB} MB.`);
        }

        const ext = safeExt(file.name);

        // Nadpisujemy stały obiekt w Storage:
        // - używamy jednej ścieżki + rozszerzenie (żeby content-type i preview były spójne)
        // - jeśli kiedyś zmienisz format (np. jpg -> png), URL się zmieni
        //   (to OK, bo i tak zapisujemy go do DB)
        const path = `${SOM_STORAGE_PATH}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(SOM_BUCKET)
          .upload(path, file, {
            upsert: true,
            cacheControl: "3600",
            contentType: file.type || undefined,
          });

        if (upErr) throw upErr;

        const { data } = supabase.storage.from(SOM_BUCKET).getPublicUrl(path);
        const publicUrl = data?.publicUrl;
        if (!publicUrl) throw new Error("Nie udało się uzyskać public URL.");

        // zapisujemy CZYSTY URL do DB
        setImageUrl(publicUrl);
        // a podgląd odświeżamy cache-busterem
        setPreviewBuster(Date.now());

        setInfo("Wgrano zdjęcie.");
        resetInfoLater();
      } catch (e: any) {
        setError(e?.message || "Błąd uploadu.");
      } finally {
        setUploading(false);
      }
    },
    [supabase, resetInfoLater]
  );

  // wczytaj ostatnią wersję "current" (dowolnej restauracji)
  useEffect(() => {
    let stop = false;

    (async () => {
      setLoading(true);
      setError(null);
      setInfo(null);

      try {
        const { data, error } = await supabase
          .from("sushi_of_month")
          .select("*")
          .eq("legacy_id", "current")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error && error.code !== "PGRST116") throw error; // ignore "no rows"
        const r = (data as Row | null) || null;

        setName(r?.name ?? "Zestaw miesiąca");
        setDescription(r?.description ?? "");

        const dbUrl = String(r?.image_url ?? "").trim();
        setImageUrl(dbUrl || DEFAULT_LOCAL_IMAGE);

        setStartsOn(r?.starts_on ?? "");
        setEndsOn(r?.ends_on ?? "");
        setPromoPrice(fromCentsNullable(r?.promo_price_cents));
        setIsActive(Boolean(r?.is_active ?? true));

        setPreviewBuster(Date.now());
      } catch (e: any) {
        if (!stop) setError(e?.message || "Błąd wczytywania.");
      } finally {
        if (!stop) setLoading(false);
      }
    })();

    return () => {
      stop = true;
    };
  }, [supabase]);

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

      // 2) Pobierz istniejące wiersze current (żeby znać product_id per restauracja)
      const { data: existing, error: exErr } = await supabase
        .from("sushi_of_month")
        .select("restaurant_id,product_id")
        .eq("legacy_id", "current");
      if (exErr) throw exErr;

      const existSet = new Set<string>(
        (existing || []).map((x: any) => x.restaurant_id).filter(Boolean)
      );

      // 3) wartości docelowe
      const promoCents = toCentsNullable(promoPrice);

      // jeśli ktoś “wyczyści”, wracamy do domyślnego assetu
      const finalImageUrl = String(imageUrl || "").trim() || DEFAULT_LOCAL_IMAGE;

      // 4) Payload wspólny (NIE DOTYKAMY product_id)
      const payload = {
        legacy_id: "current",
        name: name || undefined,
        description: description || null,
        image_url: finalImageUrl,
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        promo_price_cents: promoCents,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };

      // 5) Update wszystkich istniejących "current"
      const { error: upAllErr } = await supabase
        .from("sushi_of_month")
        .update(payload as any)
        .eq("legacy_id", "current");
      if (upAllErr && upAllErr.code !== "PGRST116") throw upAllErr;

      // 6) Dodaj brakujące restauracje (jeśli są)
      const missing = allRestaurantIds.filter((id) => !existSet.has(id));
      const insertedProductIds: string[] = [];

      if (missing.length > 0) {
        const rowsToInsert: any[] = [];

        for (const rid of missing) {
          let productId: string | null = null;

          const { data: p, error: pErr } = await supabase
            .from("products")
            .select("id")
            .eq("restaurant_id", rid)
            .ilike("name", "Zestaw miesiąca")
            .limit(1)
            .maybeSingle();

          if (!pErr) productId = (p as any)?.id ?? null;
          if (productId) insertedProductIds.push(productId);

          rowsToInsert.push({
            ...payload,
            restaurant_id: rid,
            product_id: productId,
          });
        }

        const { error: insErr } = await supabase.from("sushi_of_month").insert(rowsToInsert);
        if (insErr) throw insErr;
      }

      // 7) Synchronizuj PRODUKTY w menu (image/desc/nazwa + opcjonalnie cena)
      if (syncProducts) {
        const productIdsAll = Array.from(
          new Set(
            [
              ...(existing || []).map((x: any) => x.product_id).filter(Boolean),
              ...insertedProductIds,
            ] as string[]
          )
        );

        if (productIdsAll.length > 0) {
          const prodPatch: any = {
            image_url: finalImageUrl,
            name: name || "Zestaw miesiąca",
            description: description || null,
          };

          // jeśli wpisana cena promocyjna, to ujednolicamy też product.price_cents
          if (promoCents != null) prodPatch.price_cents = promoCents;

          const { error: pUpErr } = await supabase
            .from("products")
            .update(prodPatch)
            .in("id", productIdsAll);

          if (pUpErr) throw pUpErr;
        }
      }

      setInfo(
        syncProducts
          ? "Zapisano: sushi_of_month + produkty w menu zsynchronizowane."
          : "Zapisano: sushi_of_month zsynchronizowane."
      );
      resetInfoLater();

      // odśwież podgląd po zapisie
      setPreviewBuster(Date.now());
    } catch (e: any) {
      setError(e?.message || "Błąd zapisu.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Ładowanie…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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

      {/* Sekcja: podstawowe */}
      <div className="rounded-2xl border bg-slate-50/60 p-4 md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <div className="rounded-xl bg-white p-2 ring-1 ring-slate-200">
            <ImageIcon className="h-4 w-4 text-slate-700" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Ustawienia zestawu</div>
            <div className="text-xs text-slate-600">Zmiany dotyczą wszystkich restauracji.</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
              Nazwa
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
              Cena promocyjna (PLN)
            </label>
            <input
              value={promoPrice}
              onChange={(e) => setPromoPrice(e.target.value)}
              inputMode="decimal"
              placeholder="np. 99.00 (puste = bierz cenę z produktu)"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
              Opis
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
              Data od
            </label>
            <input
              type="date"
              value={startsOn || ""}
              onChange={(e) => setStartsOn(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
              Data do
            </label>
            <input
              type="date"
              value={endsOn || ""}
              onChange={(e) => setEndsOn(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
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
      </div>

      {/* Sekcja: zdjęcie (mobile-first) */}
      <div className="rounded-2xl border bg-white p-4 md:p-6">
        <div className="mb-3">
          <div className="text-xs font-semibold uppercase text-slate-600">
            Zdjęcie (upload) lub URL
          </div>
          <div className="text-xs text-slate-500">
            Domyślnie: <span className="font-mono">{DEFAULT_LOCAL_IMAGE}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          {/* PODGLĄD — na mobile jest pierwszy */}
          <div className="order-1 md:order-2 md:col-span-5">
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase text-slate-600">
                Podgląd
              </div>
              <div className="mt-2 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Podgląd"
                    className="h-56 w-full object-contain md:h-80"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-56 items-center justify-center text-sm text-slate-500 md:h-80">
                    Brak zdjęcia
                  </div>
                )}
              </div>

              <div className="mt-3 text-xs text-slate-500">
                Bucket: <span className="font-mono">{SOM_BUCKET}</span>
                <br />
                Storage path: <span className="font-mono">{SOM_STORAGE_PATH}</span>
              </div>
            </div>
          </div>

          {/* KONTROLKI — na mobile pod spodem */}
          <div className="order-2 md:order-1 md:col-span-7">
            <input
              value={imageUrl}
              onChange={(e) => setImageUrlSafe(e.target.value)}
              placeholder="https://… (albo wgraj plik poniżej)"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            />

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 hover:bg-slate-50">
                <Upload className="h-4 w-4" />
                {uploading ? "Wgrywanie…" : "Wgraj zdjęcie"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadImage(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>

              <button
                type="button"
                onClick={() => setImageUrlSafe(DEFAULT_LOCAL_IMAGE)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 hover:bg-slate-50"
              >
                <RotateCcw className="h-4 w-4" /> Przywróć domyślne
              </button>

              <button
                type="button"
                onClick={() => setImageUrlSafe("")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 hover:bg-slate-50"
              >
                <X className="h-4 w-4" /> Wyczyść
              </button>

              <div className="mt-1 text-xs text-slate-500 sm:ml-auto sm:mt-0">
                Max: {MAX_MB} MB
              </div>
            </div>

            <div className="mt-4 rounded-xl border bg-slate-50 p-3">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={syncProducts}
                  onChange={(e) => setSyncProducts(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-400"
                />
                <span className="text-sm text-slate-800">
                  Synchronizuj też produkt w menu
                </span>
              </label>

              <div className="mt-1 text-xs text-slate-600">
                Jeśli zaznaczone, aktualizuje też <span className="font-mono">products.image_url</span> (+ nazwa/opis, opcjonalnie cena).
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Akcje */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 sm:w-auto"
        >
          <RotateCcw className="h-4 w-4" /> Odrzuć zmiany
        </button>

        <button
          type="submit"
          disabled={saving || uploading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
        >
          <Save className="h-4 w-4" />
          {saving ? "Zapisywanie…" : "Zapisz i zastosuj wszędzie"}
        </button>
      </div>
    </form>
  );
}
