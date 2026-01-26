
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import {
  Upload,
  X,
  Save,
  ImageIcon,
  Loader2,
  Link as LinkIcon,
  Phone,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import Image from "next/image";

type BtnType = "close" | "link" | "call";

type PopupRow = {
  id: string;
  restaurant_id: string;
  is_active: boolean;
  title: string;
  content: string;
  image_url: string | null;
  btn_type: BtnType;
  btn_label: string;
  btn_url: string;
  position: number;
};

export default function PopupSettingsForm({ restaurantId }: { restaurantId: string }) {
  const supabase = getSupabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [popups, setPopups] = useState<PopupRow[]>([]);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError(null);

    const { data, error: e } = await supabase
      .from("restaurant_popups")
      .select("id,restaurant_id,is_active,title,content,image_url,btn_type,btn_label,btn_url,position")
      .eq("restaurant_id", restaurantId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (e) {
      setError(e.message || "Nie udało się pobrać popupów.");
      setPopups([]);
    } else {
      setPopups((data as PopupRow[]) ?? []);
    }

    setLoading(false);
  }, [restaurantId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchPopup = (id: string, patch: Partial<PopupRow>) => {
    setPopups((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const addPopup = useCallback(async () => {
    setError(null);
    setSaving(true);
    try {
      const nextPos = popups.length ? Math.max(...popups.map((p) => p.position ?? 0)) + 1 : 0;

      const payload = {
        restaurant_id: restaurantId,
        is_active: false,
        title: "",
        content: "",
        image_url: null,
        btn_type: "close" as BtnType,
        btn_label: "Zamknij",
        btn_url: "",
        position: nextPos,
      };

      const { data, error: e } = await supabase
        .from("restaurant_popups")
        .insert(payload)
        .select("id,restaurant_id,is_active,title,content,image_url,btn_type,btn_label,btn_url,position")
        .single();

      if (e) throw e;

      setPopups((prev) => [...prev, data as PopupRow].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
    } catch (e: any) {
      setError(e?.message || "Nie udało się dodać popupu.");
    } finally {
      setSaving(false);
    }
  }, [popups, restaurantId, supabase]);

  const saveOne = useCallback(
    async (p: PopupRow) => {
      setError(null);
      setSaving(true);
      try {
        const payload = {
          is_active: !!p.is_active,
          title: p.title || "",
          content: p.content || "",
          image_url: p.image_url,
          btn_type: (p.btn_type || "close") as BtnType,
          btn_label: p.btn_label || "Zamknij",
          btn_url: p.btn_url || "",
          position: Number.isFinite(p.position) ? p.position : 0,
        };

        const { error: e } = await supabase
          .from("restaurant_popups")
          .update(payload)
          .eq("id", p.id)
          .eq("restaurant_id", restaurantId);

        if (e) throw e;
      } catch (e: any) {
        setError(e?.message || "Błąd zapisu popupu.");
      } finally {
        setSaving(false);
      }
    },
    [restaurantId, supabase]
  );

  const removeOne = useCallback(
    async (id: string) => {
      if (!confirm("Usunąć ten popup?")) return;
      setError(null);
      setSaving(true);
      try {
        const { error: e } = await supabase
          .from("restaurant_popups")
          .delete()
          .eq("id", id)
          .eq("restaurant_id", restaurantId);

        if (e) throw e;

        setPopups((prev) => prev.filter((p) => p.id !== id));
      } catch (e: any) {
        setError(e?.message || "Błąd usuwania popupu.");
      } finally {
        setSaving(false);
      }
    },
    [restaurantId, supabase]
  );

  const move = useCallback(
    async (id: string, dir: "up" | "down") => {
      const idx = popups.findIndex((p) => p.id === id);
      if (idx < 0) return;
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= popups.length) return;

      const a = popups[idx];
      const b = popups[swapIdx];

      // swap positions locally
      const next = [...popups];
      next[idx] = { ...a, position: b.position };
      next[swapIdx] = { ...b, position: a.position };
      next.sort((x, y) => (x.position ?? 0) - (y.position ?? 0));
      setPopups(next);

      // persist (2 updates)
      try {
        await Promise.all([
          supabase
            .from("restaurant_popups")
            .update({ position: b.position })
            .eq("id", a.id)
            .eq("restaurant_id", restaurantId),
          supabase
            .from("restaurant_popups")
            .update({ position: a.position })
            .eq("id", b.id)
            .eq("restaurant_id", restaurantId),
        ]);
      } catch {
        // jeśli coś pójdzie nie tak, najprościej przeładuj
        void load();
      }
    },
    [popups, restaurantId, supabase, load]
  );

  const handleImageUpload = useCallback(
    async (popupId: string, e: React.ChangeEvent<HTMLInputElement>) => {
      try {
        if (!e.target.files || e.target.files.length === 0) return;
        setUploadingId(popupId);
        setError(null);

        const file = e.target.files[0];
        const fileExt = file.name.split(".").pop() || "jpg";
        const fileName = `${restaurantId}/${popupId}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage.from("popups").upload(fileName, file);
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("popups").getPublicUrl(fileName);
        patchPopup(popupId, { image_url: data.publicUrl });
      } catch (e: any) {
        setError("Błąd podczas wgrywania zdjęcia: " + (e?.message || e));
      } finally {
        setUploadingId(null);
        if (e.target) e.target.value = "";
      }
    },
    [restaurantId, supabase]
  );

  if (loading) return <div className="p-4 text-sm text-gray-500">Ładowanie...</div>;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4 text-slate-900">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Pop-upy (Slider)</h3>
          <p className="text-xs text-slate-500">
            Możesz mieć wiele aktywnych popupów – na stronie pokażą się jako slajdy (kolejność = pozycja).
          </p>
        </div>

        <button
          onClick={() => void addPopup()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Plus size={18} /> Dodaj popup
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {popups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-600">
          Brak popupów. Kliknij „Dodaj popup”.
        </div>
      ) : (
        <div className="space-y-4">
          {popups.map((p, idx) => {
            const uploading = uploadingId === p.id;

            return (
              <div key={p.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-4 bg-slate-50/50 border-b border-slate-100">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">
                      {p.title?.trim() ? p.title : `Popup #${idx + 1}`}
                    </div>
                    <div className="text-xs text-slate-500">Pozycja: {p.position ?? idx}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void move(p.id, "up")}
                      disabled={saving || idx === 0}
                      className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                      title="Przesuń w górę"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void move(p.id, "down")}
                      disabled={saving || idx === popups.length - 1}
                      className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                      title="Przesuń w dół"
                    >
                      <ArrowDown size={16} />
                    </button>

                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!p.is_active}
                        onChange={(e) => patchPopup(p.id, { is_active: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-emerald-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
                      <span className="ml-3 text-sm font-medium text-gray-900">
                        {p.is_active ? "Aktywny" : "Wyłączony"}
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={() => void removeOne(p.id)}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      title="Usuń popup"
                    >
                      <Trash2 size={16} /> Usuń
                    </button>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Nagłówek</label>
                      <input
                        type="text"
                        value={p.title}
                        onChange={(e) => patchPopup(p.id, { title: e.target.value })}
                        placeholder="np. Zestawy Wigilijne"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Treść</label>
                      <textarea
                        value={p.content}
                        onChange={(e) => patchPopup(p.id, { content: e.target.value })}
                        rows={3}
                        placeholder="Opisz szczegóły..."
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                    <h4 className="text-sm font-bold text-slate-800">Przycisk</h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Akcja</label>
                        <select
                          value={p.btn_type}
                          onChange={(e) => patchPopup(p.id, { btn_type: e.target.value as BtnType })}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                        >
                          <option value="close">Tylko &quot;Zamknij&quot;</option>
                          <option value="link">Przekieruj do linku</option>
                          <option value="call">Zadzwoń</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Tekst na guziku</label>
                        <input
                          type="text"
                          value={p.btn_label}
                          onChange={(e) => patchPopup(p.id, { btn_label: e.target.value })}
                          placeholder="np. Sprawdź ofertę"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                    </div>

                    {p.btn_type === "link" && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                          <LinkIcon size={12} /> Link docelowy
                        </label>
                        <input
                          type="text"
                          value={p.btn_url}
                          onChange={(e) => patchPopup(p.id, { btn_url: e.target.value })}
                          placeholder="np. https://sushitutaj.pl/menu/zestawy"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Wklej pełny link.</p>
                      </div>
                    )}

                    {p.btn_type === "call" && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                          <Phone size={12} /> Numer telefonu
                        </label>
                        <input
                          type="text"
                          value={p.btn_url}
                          onChange={(e) => patchPopup(p.id, { btn_url: e.target.value })}
                          placeholder="np. 500123456 (albo puste = domyślny numer lokalu na froncie)"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          Jeśli puste – na froncie możesz użyć numeru restauracji.
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Obrazek</label>

                    <div className="flex flex-col gap-4">
                      {p.image_url ? (
                        <div className="relative w-full bg-gray-50 rounded-xl overflow-hidden border border-slate-200 group">
                          <Image
                            src={p.image_url}
                            alt="Podgląd"
                            width={800}
                            height={500}
                            className="w-full h-auto object-contain"
                            unoptimized
                          />
                          <button
                            onClick={() => patchPopup(p.id, { image_url: null })}
                            className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                            title="Usuń zdjęcie"
                            type="button"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 text-slate-400">
                          <div className="flex flex-col items-center">
                            <ImageIcon size={24} />
                            <span className="text-xs mt-1">Brak zdjęcia</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        <label
                          className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition shadow-sm ${
                            uploading ? "opacity-50 pointer-events-none" : ""
                          }`}
                        >
                          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                          <span>{uploading ? "Wgrywanie..." : "Wybierz plik"}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => void handleImageUpload(p.id, e)}
                            disabled={uploading}
                          />
                        </label>
                        <span className="text-xs text-slate-500">Zalecane: JPG, PNG, WebP</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                    <button
                      onClick={() => void saveOne(p)}
                      disabled={saving || uploading}
                      className="flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition shadow-md"
                      type="button"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      Zapisz ten popup
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
