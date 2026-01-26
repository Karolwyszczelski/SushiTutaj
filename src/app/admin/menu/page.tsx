"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import {
  Pencil,
  Trash,
  ToggleRight,
  ChevronDown,
  Power,
  Truck,
  ShoppingBag,
  Upload,
  Loader2,
  ImageIcon,
  X,
  Layers,
  Utensils,
  Settings,
  List,
  Plus,
} from "lucide-react";

import debounce from "lodash.debounce";
import Image from "next/image";
import AddonOptionsForm from "@/components/admin/settings/AddonOptionsForm";
import CheckoutConfigForm from "@/components/admin/settings/CheckoutConfigForm";
import clsx from "clsx";

/* ========= Typy ========= */
interface Product {
  id: string;
  restaurant_id: string;
  name: string | null;
  description: string | null;
  subcategory: string | null;
  position: number | null;
  image_url: string | null;
  available: boolean;
  is_active: boolean;
  price_cents: number | null;
}

type OptionGroup = {
  id: string;
  name: string;
  type: string;
};

/* ========= Utils ========= */
const fmtPrice = (cents?: number | null) =>
  ((cents ?? 0) / 100).toFixed(2) + " zł";

/* ========= Uniwersalny Modal (Dodawanie / Edycja) ========= */
function ProductModal({
  product,         // Jeśli null -> tryb dodawania
  restaurantId,    // Potrzebne do utworzenia nowego produktu
  onClose,
  onSaved,
}: {
  product?: Product | null;
  restaurantId: string;
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const supabase = getSupabaseBrowser();
  const isEditing = !!product;

  const [form, setForm] = useState({
    name: product?.name ?? "",
    priceZl: product?.price_cents != null ? (product.price_cents / 100).toFixed(2) : "",
    description: product?.description ?? "",
    subcategory: product?.subcategory ?? "",
    image_url: product?.image_url ?? "",
    position: product?.position ?? 0,
  });

  const [allGroups, setAllGroups] = useState<OptionGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [loadingGroups, setLoadingGroups] = useState(true);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Pobieranie grup opcji i powiązań (jeśli edycja)
  useEffect(() => {
    async function fetchGroupsData() {
      if (!restaurantId) return;
      try {
        setLoadingGroups(true);
        // 1. Pobierz wszystkie grupy dostępne dla restauracji
        const { data: groupsData, error: groupsError } = await supabase
          .from("option_groups")
          .select("id, name, type")
          .eq("restaurant_id", restaurantId)
          .order("name");

        if (groupsError) throw groupsError;
        // Map to handle null type
        setAllGroups((groupsData || []).map(g => ({ ...g, type: g.type || "radio" })));

        // 2. Jeśli edytujemy, pobierz zaznaczone grupy
        if (isEditing && product) {
          const { data: linksData, error: linksError } = await supabase
            .from("product_option_groups")
            .select("option_group_id")
            .eq("product_id", product.id);

          if (linksError) throw linksError;
          const linkedIds = new Set((linksData || []).map((l) => l.option_group_id));
          setSelectedGroupIds(linkedIds);
        }
      } catch (error) {
        console.error("Błąd pobierania grup opcji:", error);
      } finally {
        setLoadingGroups(false);
      }
    }

    fetchGroupsData();
  }, [product, restaurantId, isEditing, supabase]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || e.target.files.length === 0) return;
      setUploading(true);
      setErr(null);

      const file = e.target.files[0];
      const fileExt = file.name.split(".").pop();
      // Jeśli mamy ID produktu to go używamy, jeśli nie (nowy produkt) to timestamp
      const prefix = product?.id || `new_${Date.now()}`; 
      const fileName = `${prefix}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("menu-items")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("menu-items")
        .getPublicUrl(fileName);

      setForm((prev) => ({ ...prev, image_url: data.publicUrl }));
    } catch (error: any) {
      setErr("Błąd podczas wgrywania zdjęcia: " + error.message);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const removeImage = () => {
    setForm((prev) => ({ ...prev, image_url: "" }));
  };

  const toggleGroup = (groupId: string) => {
    const next = new Set(selectedGroupIds);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    setSelectedGroupIds(next);
  };

  const save = async () => {
    setErr(null);
    if (!form.name.trim()) {
      setErr("Nazwa produktu jest wymagana.");
      return;
    }
    
    setSaving(true);
    try {
      const cents = Math.round(
        Number((form.priceZl || "0").replace(",", ".")) * 100
      );
      
      const payload: any = {
        name: form.name,
        description: form.description || null,
        subcategory: form.subcategory || null,
        image_url: form.image_url || null,
        position: Number.isFinite(Number(form.position)) ? Number(form.position) : 0,
        price_cents: Number.isFinite(cents) ? cents : 0,
        restaurant_id: restaurantId, // Ważne przy tworzeniu
      };

      let savedProduct: Product;

      if (isEditing && product) {
        // --- AKTUALIZACJA ---
        const { data, error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", product.id)
          .select("*")
          .single();

        if (error) throw error;
        savedProduct = data as Product;
      } else {
        // --- TWORZENIE NOWEGO ---
        // Domyślnie dostępny i aktywny
        payload.available = true;
        payload.is_active = true;

        const { data, error } = await supabase
          .from("products")
          .insert(payload)
          .select("*")
          .single();

        if (error) throw error;
        savedProduct = data as Product;
      }

      // --- AKTUALIZACJA GRUP OPCJI (Usuń stare -> Dodaj nowe) ---
      // Najpierw czyścimy powiązania dla tego produktu
      const { error: deleteError } = await supabase
        .from("product_option_groups")
        .delete()
        .eq("product_id", savedProduct.id);
      
      if (deleteError) throw deleteError;

      // Teraz dodajemy zaznaczone
      if (selectedGroupIds.size > 0) {
        const rowsToInsert = Array.from(selectedGroupIds).map((groupId, idx) => ({
          product_id: savedProduct.id,
          option_group_id: groupId,
          sort_order: idx,
        }));

        const { error: insertError } = await supabase
          .from("product_option_groups")
          .insert(rowsToInsert);
          
        if (insertError) throw insertError;
      }

      onSaved(savedProduct);
      onClose();
    } catch (e: any) {
      setErr(e.message || "Nie udało się zapisać zmian.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onMouseDown={onClose}
      />
      <div
        className="relative z-[121] w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0 bg-white">
          <h3 className="text-xl font-bold">
            {isEditing ? "Edytuj produkt" : "Dodaj nowy produkt"}
          </h3>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-sm hover:bg-slate-50"
          >
            <X size={18} /> Zamknij
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 custom-scrollbar bg-white">
          {err && (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {err}
            </div>
          )}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            
            {/* LEWA KOLUMNA */}
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
                    Nazwa <span className="text-rose-500">*</span>
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="np. Pizza Margarita"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
                      Cena (PLN)
                    </label>
                    <input
                      value={form.priceZl}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, priceZl: e.target.value }))
                      }
                      inputMode="decimal"
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
                      Kolejność
                    </label>
                    <input
                      type="number"
                      value={form.position}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          position: Number(e.target.value),
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
                    Kategoria
                  </label>
                  <input
                    value={form.subcategory}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, subcategory: e.target.value }))
                    }
                    placeholder="np. Pizze, Napoje, Dodatki"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Sekcja Wariantów */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Layers className="text-slate-500" size={18} />
                    <h4 className="text-sm font-bold text-slate-700">Warianty i Opcje</h4>
                  </div>
                  
                  {loadingGroups ? (
                    <div className="text-xs text-slate-500">Ładowanie grup...</div>
                  ) : allGroups.length === 0 ? (
  <div className="text-xs text-slate-500">
    Brak zdefiniowanych grup opcji. Przejdź do zakładki &quot;Warianty / Dodatki&quot; aby je utworzyć.
  </div>
) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                      {allGroups.map(group => (
                        <label key={group.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-100 p-1.5 rounded-md transition">
                          <input 
                            type="checkbox"
                            checked={selectedGroupIds.has(group.id)}
                            onChange={() => toggleGroup(group.id)}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>{group.name}</span>
                          <span className="text-xs text-slate-400 ml-auto uppercase">{group.type}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 mt-2">
                    Zaznacz grupy, które mają się wyświetlać przy tym produkcie.
                  </p>
              </div>
            </div>

            {/* PRAWA KOLUMNA */}
            <div className="space-y-4">
               <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-600">
                    Opis
                  </label>
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    placeholder="Krótki opis składników..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase text-slate-600">
                  Zdjęcie produktu
                </label>

                <div className="flex flex-col gap-3">
                  <div className="relative w-full aspect-[4/3] bg-slate-100 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center group">
                    {form.image_url ? (
                      <>
                        <Image
                          src={form.image_url}
                          alt="Podgląd"
                          fill
                          className="object-cover"
                          unoptimized
                        />
                        <button
                          onClick={removeImage}
                          className="absolute top-2 right-2 p-1.5 bg-rose-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-rose-700"
                          title="Usuń zdjęcie"
                        >
                          <Trash size={16} />
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center text-slate-400">
                        <ImageIcon size={32} />
                        <span className="text-xs mt-2">Brak zdjęcia</span>
                      </div>
                    )}

                    {uploading && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                        <Loader2
                          className="animate-spin text-emerald-600"
                          size={32}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      className={`flex items-center justify-center gap-2 cursor-pointer w-full py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition shadow-sm ${
                        uploading ? "opacity-50 pointer-events-none" : ""
                      }`}
                    >
                      <Upload size={16} />
                      <span>
                        {uploading ? "Wgrywanie..." : "Wgraj zdjęcie"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={uploading}
                      />
                    </label>
                    <p className="text-[10px] text-slate-500 text-center">
                      Max 2MB. JPG, PNG, WebP.
                    </p>
                  </div>

                  <div className="mt-2 pt-3 border-t border-slate-100">
                    <label className="mb-1 block text-[10px] uppercase text-slate-400">
                      Lub wklej link ręcznie
                    </label>
                    <input
                      value={form.image_url}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, image_url: e.target.value }))
                      }
                      placeholder="https://..."
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4 shrink-0 bg-slate-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 text-slate-700"
          >
            Anuluj
          </button>
          <button
            onClick={save}
            disabled={saving || uploading}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 shadow-md"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEditing ? "Zapisz zmiany" : "Utwórz produkt"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========= Główna Strona z Zakładkami ========= */
export default function AdminMenuPage() {
  const supabase = getSupabaseBrowser();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);

  // Zakładki
  const [activeTab, setActiveTab] = useState<'menu' | 'variants' | 'checkout'>('menu');

  // Stan produktów
  const [products, setProducts] = useState<Product[]>([]);
  const [filterCat, setFilterCat] = useState<string>("Wszystkie");
  const [sortKey, setSortKey] = useState<
    "nameAsc" | "nameDesc" | "priceAsc" | "priceDesc"
  >("nameAsc");
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Stan restauracji
    // Stan restauracji
  const [orderingOpen, setOrderingOpen] = useState<boolean | null>(null); // global
  const [orderingDeliveryOpen, setOrderingDeliveryOpen] = useState<boolean | null>(null);
  const [orderingTakeawayOpen, setOrderingTakeawayOpen] = useState<boolean | null>(null);

  const [toggleOrderingBusy, setToggleOrderingBusy] = useState(false);
  const [toggleDeliveryBusy, setToggleDeliveryBusy] = useState(false);
  const [toggleTakeawayBusy, setToggleTakeawayBusy] = useState(false);


  /* 1) Pobierz lokal */
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const r = await fetch("/api/restaurants/ensure-cookie", {
          cache: "no-store",
          credentials: "include",
        });
        const j = await r.json().catch(() => ({}));
        if (stop) return;
        setRestaurantId(j?.restaurant_id ?? null);
        setSlug(j?.restaurant_slug ?? null);
      } catch {
        if (!stop) {
          setRestaurantId(null);
          setSlug(null);
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  /* 2) Załaduj produkty + status przyjmowania */
  const fetchAll = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [{ data, error: err }, ri] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id,restaurant_id,name,description,subcategory,position,image_url,available,is_active,price_cents"
          )
          .eq("restaurant_id", restaurantId)
          .order("subcategory", { ascending: true, nullsFirst: true })
          .order("position", { ascending: true, nullsFirst: true })
          .order("name", { ascending: true }),
                supabase
          .from("restaurants")
          .select("active, ordering_delivery_active, ordering_takeaway_active")
          .eq("id", restaurantId)
          .maybeSingle(),

      ]);

      if (err) throw err;
      setProducts((data as Product[]) ?? []);
            if (!ri.error && ri.data) {
        const row = ri.data as any;
        setOrderingOpen(Boolean(row.active));
        setOrderingDeliveryOpen(Boolean(row.ordering_delivery_active));
        setOrderingTakeawayOpen(Boolean(row.ordering_takeaway_active));
      }
      setError(null);
    } catch (e: any) {
      setError(e.message || "Błąd ładowania danych");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, supabase]);

  useEffect(() => {
    if (!restaurantId) return;
    void fetchAll();

    const chProducts = supabase
      .channel("public:products:" + restaurantId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => void fetchAll()
      )
      .subscribe();

    const chRestaurants = supabase
      .channel("public:restaurants:" + restaurantId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurants",
          filter: `id=eq.${restaurantId}`,
        },
                (p: any) => {
          const row = (p?.new || p?.record) as
            | {
                active?: boolean;
                ordering_delivery_active?: boolean;
                ordering_takeaway_active?: boolean;
              }
            | undefined;

          if (!row) return;

          if (typeof row.active === "boolean") setOrderingOpen(row.active);
          if (typeof row.ordering_delivery_active === "boolean")
            setOrderingDeliveryOpen(row.ordering_delivery_active);
          if (typeof row.ordering_takeaway_active === "boolean")
            setOrderingTakeawayOpen(row.ordering_takeaway_active);
        }

      )
      .subscribe();

    return () => {
      void supabase.removeChannel(chProducts);
      void supabase.removeChannel(chRestaurants);
    };
  }, [restaurantId, supabase, fetchAll]);

  const displayNameWithCategory = useCallback((p: Product): string => {
    const cat = (p.subcategory || "").trim();
    const name = (p.name || "").trim();
    if (!cat) return name;
    const lcName = name.toLowerCase();
    const lcCat = cat.toLowerCase();
    if (lcName.startsWith(lcCat + " ") || lcName.startsWith(lcCat + "-") || lcName.startsWith(lcCat + ":")) {
      return name;
    }
    return `${cat} ${name}`;
  }, []);

  const toggleAvailability = async (id: string, current: boolean) => {
    setTogglingId(id);
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, available: !current, is_active: !current } : p
      )
    );
    try {
      const { error } = await supabase
        .from("products")
        .update({ available: !current, is_active: !current })
        .eq("id", id);
      if (error) throw error;
    } catch (e: any) {
      alert(`Nie udało się zmienić dostępności: ${e.message || e}`);
      setProducts((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, available: current, is_active: current } : p
        )
      );
    } finally {
      setTogglingId(null);
    }
  };

    const flipOrderingGlobal = async () => {
    if (orderingOpen == null || !restaurantId) return;
    setToggleOrderingBusy(true);

    const prev = orderingOpen;
    const next = !prev;
    setOrderingOpen(next);

    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ active: next })
        .eq("id", restaurantId);
      if (error) throw error;
    } catch (e: any) {
      setOrderingOpen(prev);
      alert("Nie udało się zmienić statusu zamawiania: " + (e.message || e));
    } finally {
      setToggleOrderingBusy(false);
    }
  };

  const flipOrderingDelivery = async () => {
    if (orderingDeliveryOpen == null || !restaurantId) return;
    setToggleDeliveryBusy(true);

    const prev = orderingDeliveryOpen;
    const next = !prev;
    setOrderingDeliveryOpen(next);

    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ ordering_delivery_active: next })
        .eq("id", restaurantId);
      if (error) throw error;
    } catch (e: any) {
      setOrderingDeliveryOpen(prev);
      alert("Nie udało się zmienić statusu dostaw: " + (e.message || e));
    } finally {
      setToggleDeliveryBusy(false);
    }
  };

  const flipOrderingTakeaway = async () => {
    if (orderingTakeawayOpen == null || !restaurantId) return;
    setToggleTakeawayBusy(true);

    const prev = orderingTakeawayOpen;
    const next = !prev;
    setOrderingTakeawayOpen(next);

    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ ordering_takeaway_active: next })
        .eq("id", restaurantId);
      if (error) throw error;
    } catch (e: any) {
      setOrderingTakeawayOpen(prev);
      alert("Nie udało się zmienić statusu wynosu: " + (e.message || e));
    } finally {
      setToggleTakeawayBusy(false);
    }
  };


  const handleOpenAddModal = () => {
    setEditingProduct(null); // Tryb tworzenia
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: Product) => {
    setEditingProduct(p);
    setIsModalOpen(true);
  };

  const handleModalSaved = (savedProduct: Product) => {
    if (editingProduct) {
      // Edycja
      setProducts((prev) => prev.map((p) => (p.id === savedProduct.id ? savedProduct : p)));
    } else {
      // Nowy produkt - dodaj do listy
      setProducts((prev) => [...prev, savedProduct]);
    }
  };

  const categories = useMemo(
    () =>
      Array.from(
        new Set(products.map((p) => p.subcategory || "Bez kategorii"))
      )
        .filter(Boolean)
        .sort(),
    [products]
  );

  const filtered = useMemo(() => {
    return products
      .filter((p) => {
        if (
          filterCat !== "Wszystkie" &&
          (p.subcategory || "Bez kategorii") !== filterCat
        )
          return false;
        if (search.trim()) {
          const term = search.toLowerCase();
          const matchesName = (p.name || "").toLowerCase().includes(term);
          const matchesDesc = (p.description || "").toLowerCase().includes(term);
          const matchesCat = (p.subcategory || "").toLowerCase().includes(term);
          return matchesName || matchesDesc || matchesCat;
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortKey) {
          case "nameAsc": return (a.name || "").localeCompare(b.name || "");
          case "nameDesc": return (b.name || "").localeCompare(a.name || "");
          case "priceAsc": return (a.price_cents ?? 0) - (b.price_cents ?? 0);
          case "priceDesc": return (b.price_cents ?? 0) - (a.price_cents ?? 0);
          default: return 0;
        }
      });
  }, [products, filterCat, sortKey, search]);

  const onSearchChange = useCallback(
    (v: string) => {
      const debouncedSetSearch = debounce((val: string) => setSearch(val), 300);
      debouncedSetSearch(v);
    },
    []
  );

  /* Pomocniczy komponent do zakładek */
  const TabButton = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={clsx(
        "flex items-center gap-2 px-6 py-3 font-medium text-sm transition-all relative shrink-0",
        activeTab === id
          ? "text-slate-900"
          : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
      )}
    >
      <Icon size={18} className={activeTab === id ? "text-emerald-600" : "text-slate-400"} />
      {label}
      {activeTab === id && (
        <span className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-600 rounded-t-full" />
      )}
    </button>
  );

  /* ---------- RENDER STRONY ---------- */
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 text-slate-900">
      {!restaurantId && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Brak przypisanego lokalu. Otwórz stronę wyboru restauracji.
        </div>
      )}

      {/* NAGŁÓWEK GŁÓWNY */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
            Zarządzanie menu {slug ? `— ${slug}` : ""}
          </h1>
          {error && <p className="mt-1 text-sm text-rose-600">{error}</p>}
        </div>

        {/* Przyciski Akcji (Globalne) */}
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {/* Guzik DODAJ PRODUKT */}
          <button
            onClick={handleOpenAddModal}
            disabled={!restaurantId}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-emerald-700 hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Plus size={20} strokeWidth={2.5} />
            Dodaj produkt
          </button>

                    {/* Przełączniki zamówień: global / dostawa / wynos */}
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              onClick={flipOrderingGlobal}
              disabled={orderingOpen == null || toggleOrderingBusy || !restaurantId}
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold shadow-sm transition-all ${
                orderingOpen
                  ? "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                  : "bg-white text-slate-500 border-slate-300 hover:bg-slate-50"
              }`}
              title="Włącz/wyłącz przyjmowanie zamówień globalnie (blokuje wszystko)"
            >
              <Power className={`h-4 w-4 ${orderingOpen ? "text-emerald-600" : "text-slate-400"}`} />
              {orderingOpen ? "Zamówienia: WŁ." : "Zamówienia: WYŁ."}
            </button>

            <div className="grid grid-cols-2 gap-3 w-full sm:w-auto">
              <button
                onClick={flipOrderingDelivery}
                disabled={orderingDeliveryOpen == null || toggleDeliveryBusy || !restaurantId}
                className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold shadow-sm transition-all ${
                  orderingOpen && orderingDeliveryOpen
                    ? "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
                title="Włącz/wyłącz dostawy dla lokalu (działa tylko gdy Zamówienia: WŁ.)"
              >
                <Truck className={`h-4 w-4 ${orderingOpen && orderingDeliveryOpen ? "text-emerald-600" : "text-slate-400"}`} />
                {orderingOpen
                  ? orderingDeliveryOpen ? "Dostawa: WŁ." : "Dostawa: WYŁ."
                  : "Dostawa: —"}
              </button>

              <button
                onClick={flipOrderingTakeaway}
                disabled={orderingTakeawayOpen == null || toggleTakeawayBusy || !restaurantId}
                className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold shadow-sm transition-all ${
                  orderingOpen && orderingTakeawayOpen
                    ? "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
                title="Włącz/wyłącz wynos dla lokalu (działa tylko gdy Zamówienia: WŁ.)"
              >
                <ShoppingBag className={`h-4 w-4 ${orderingOpen && orderingTakeawayOpen ? "text-emerald-600" : "text-slate-400"}`} />
                {orderingOpen
                  ? orderingTakeawayOpen ? "Wynos: WŁ." : "Wynos: WYŁ."
                  : "Wynos: —"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ZAKŁADKI */}
      <div className="mb-6 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-100 overflow-x-auto hide-scrollbar">
          <TabButton id="menu" label="Produkty (Menu)" icon={Utensils} />
          <TabButton id="variants" label="Warianty / Dodatki" icon={List} />
          <TabButton id="checkout" label="Ustawienia Koszyka" icon={Settings} />
        </div>

        <div className="p-4 md:p-6 bg-slate-50/30 min-h-[400px]">
          
          {/* ZAKŁADKA 1: MENU (TABELA) */}
          {activeTab === 'menu' && (
             <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Pasek filtrów */}
<div className="flex flex-col md:flex-row items-end gap-3 mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm w-full">
  {/* Kategoria + Sortuj (mniejsze) */}
  <div className="grid grid-cols-2 gap-3 w-full md:flex md:w-auto md:flex-none">
    <div className="min-w-0 md:w-52">
      <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
        Kategoria
      </label>
      <select
        className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition text-sm"
        value={filterCat}
        onChange={(e) => setFilterCat(e.target.value)}
      >
        <option value="Wszystkie">Wszystkie</option>
        {categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>

    <div className="min-w-0 md:w-52">
      <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
        Sortuj
      </label>
      <div className="relative">
        <select
          className="w-full appearance-none rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition text-sm"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as any)}
        >
          <option value="nameAsc">Nazwa A-Z</option>
          <option value="nameDesc">Nazwa Z-A</option>
          <option value="priceAsc">Cena rosnąco</option>
          <option value="priceDesc">Cena malejąco</option>
        </select>
        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">
          <ChevronDown size={14} />
        </div>
      </div>
    </div>
  </div>

  {/* Szukaj (zdecydowanie większe) */}
  <div className="w-full md:flex-1 md:min-w-[420px]">
    <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
      Szukaj
    </label>
    <input
      type="text"
      placeholder="Nazwa, opis..."
      onChange={(e) => onSearchChange(e.target.value)}
      className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition text-sm"
    />
  </div>

  <button
    onClick={() => fetchAll()}
    disabled={loading || !restaurantId}
    className="h-[38px] px-4 rounded-lg bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 transition disabled:opacity-50 w-full md:w-auto md:flex-none"
  >
    Odśwież
  </button>
</div>

                {/* Tabela Desktop */}
                <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50/50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">#</th>
                        <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Nazwa</th>
                        <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Cena</th>
                        <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Kategoria</th>
                        <th className="px-6 py-3 text-center text-xs font-bold uppercase tracking-wide text-slate-500">Dostępność</th>
                        <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Akcje</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="animate-pulse">
                            <td colSpan={6} className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-full"></div></td>
                          </tr>
                        ))
                      ) : filtered.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-500">Brak produktów do wyświetlenia.</td>
                        </tr>
                      ) : (
                        filtered.map((it, i) => (
                          <tr key={it.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 text-sm text-slate-500">{i + 1}</td>
                            <td className="px-6 py-4 text-sm font-semibold text-slate-900">{displayNameWithCategory(it)}</td>
                            <td className="px-6 py-4 text-sm text-slate-700">{fmtPrice(it.price_cents)}</td>
                            <td className="px-6 py-4 text-sm text-slate-500">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                  {it.subcategory}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={() => toggleAvailability(it.id, it.available)}
                                disabled={togglingId === it.id}
                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition ${
                                  it.available ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                                }`}
                              >
                                {it.available ? "Dostępny" : "Ukryty"}
                                <ToggleRight size={16} />
                              </button>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button onClick={() => handleOpenEditModal(it)} className="p-1.5 hover:bg-sky-50 text-sky-600 rounded transition" title="Edytuj">
                                  <Pencil size={18} />
                                </button>
                                <button onClick={() => {
                                  if (!confirm("Na pewno usunąć ten produkt?")) return;
                                  supabase.from("products").delete().eq("id", it.id).then(({ error }) => {
                                    if (error) return alert("Błąd usuwania");
                                    setProducts((p) => p.filter((x) => x.id !== it.id));
                                  });
                                }} className="p-1.5 hover:bg-rose-50 text-rose-600 rounded transition" title="Usuń">
                                  <Trash size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                
                {/* Mobile Cards */}
                <div className="md:hidden space-y-4">
                    {filtered.map(it => (
                        <div key={it.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3 active:scale-[0.99] transition-transform">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-bold text-slate-900">{displayNameWithCategory(it)}</h4>
                                    <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600 mt-1 inline-block">{it.subcategory}</span>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-slate-800">{fmtPrice(it.price_cents)}</div>
                                </div>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-slate-100 mt-1">
                                 <button
                                    onClick={() => toggleAvailability(it.id, it.available)}
                                    className={`text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 ${it.available ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}
                                 >
                                    <ToggleRight size={14} />
                                    {it.available ? "Dostępny" : "Ukryty"}
                                 </button>
                                 <div className="flex gap-1">
                                     <button onClick={() => handleOpenEditModal(it)} className="bg-sky-50 text-sky-700 p-2 rounded-lg"><Pencil size={18}/></button>
                                     <button onClick={() => {
                                         if (!confirm("Usunąć?")) return;
                                         supabase.from("products").delete().eq("id", it.id).then(({error}) => {
                                            if(!error) setProducts(p => p.filter(x => x.id !== it.id));
                                         })
                                     }} className="bg-rose-50 text-rose-700 p-2 rounded-lg"><Trash size={18}/></button>
                                 </div>
                            </div>
                        </div>
                    ))}
                    {filtered.length === 0 && !loading && (
                      <div className="text-center py-10 text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">
                        Brak produktów. <br/> Dodaj pierwszy produkt klikając guzik na górze.
                      </div>
                    )}
                </div>
             </div>
          )}

          {/* ZAKŁADKA 2: WARIANTY */}
          {activeTab === 'variants' && (
             <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-7xl mx-auto">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                   <div className="mb-6">
                      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Layers className="text-sky-600" />
                        Zarządzanie grupami opcji
                      </h2>
                      <p className="text-sm text-slate-500 mt-1">
  Tutaj dodasz smaki napojów, rodzaje mięsa, czy płatne dodatki (np. &quot;Podwójny ser&quot;).
  Stworzone grupy przypiszesz potem do produktów w zakładce &quot;Produkty&quot; (klikając Edytuj).
</p>
                   </div>
                   <AddonOptionsForm restaurantSlug={slug} />
                </div>
             </div>
          )}

          {/* ZAKŁADKA 3: USTAWIENIA KOSZYKA */}
          {activeTab === 'checkout' && (
             <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-7xl mx-auto">
                 <div className="mb-6">
                      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Settings className="text-slate-600" />
                        Konfiguracja sklepu
                      </h2>
                      <p className="text-sm text-slate-500 mt-1">
                        Globalne ustawienia czasu realizacji, kosztów opakowania i walidacji adresu.
                      </p>
                   </div>
                 <CheckoutConfigForm restaurantId={restaurantId} />
             </div>
          )}

        </div>
      </div>

      {isModalOpen && restaurantId && (
        <ProductModal
          product={editingProduct} // null = tworzenie, obiekt = edycja
          restaurantId={restaurantId}
          onClose={() => setIsModalOpen(false)}
          onSaved={handleModalSaved}
        />
      )}
    </div>
  );
}