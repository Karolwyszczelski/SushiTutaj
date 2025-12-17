"use client";

import React, { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Upload, X, Save, ImageIcon, Loader2, Link as LinkIcon, Phone } from "lucide-react";
import Image from "next/image";

export default function PopupSettingsForm({
  restaurantId,
}: {
  restaurantId: string;
}) {
  const supabase = createClientComponentClient();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Stan
  const [active, setActive] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Nowe stany dla przycisków
  const [btnType, setBtnType] = useState("close"); // 'close', 'link', 'call'
  const [btnLabel, setBtnLabel] = useState("");
  const [btnUrl, setBtnUrl] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("restaurants")
        .select("popup_active, popup_title, popup_content, popup_image_url, popup_btn_type, popup_btn_label, popup_btn_url")
        .eq("id", restaurantId)
        .maybeSingle();

      if (data && !error) {
        setActive(data.popup_active || false);
        setTitle(data.popup_title || "");
        setContent(data.popup_content || "");
        setImageUrl(data.popup_image_url || null);
        
        // Ładowanie ustawień przycisku
        setBtnType(data.popup_btn_type || "close");
        setBtnLabel(data.popup_btn_label || "Zamknij");
        setBtnUrl(data.popup_btn_url || "");
      }
      setLoading(false);
    }
    load();
  }, [restaurantId, supabase]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || e.target.files.length === 0) return;
      setUploading(true);
      const file = e.target.files[0];
      const fileExt = file.name.split(".").pop();
      const fileName = `${restaurantId}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("popups")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("popups").getPublicUrl(fileName);
      setImageUrl(data.publicUrl);
    } catch (error: any) {
      alert("Błąd podczas wgrywania zdjęcia: " + error.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removeImage = () => setImageUrl(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("restaurants")
        .update({
          popup_active: active,
          popup_title: title,
          popup_content: content,
          popup_image_url: imageUrl,
          // Zapis nowych pól
          popup_btn_type: btnType,
          popup_btn_label: btnLabel,
          popup_btn_url: btnUrl,
        })
        .eq("id", restaurantId);

      if (error) throw error;
      alert("Zapisano ustawienia pop-up!");
    } catch (error: any) {
      alert("Błąd zapisu: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4 text-sm text-gray-500">Ładowanie...</div>;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6 max-w-2xl text-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
           <h3 className="text-lg font-bold text-slate-900">Pop-up (Promocja)</h3>
           <p className="text-xs text-slate-500">Wyskakujące okienko na stronie głównej</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={active} 
              onChange={(e) => setActive(e.target.checked)} 
              className="sr-only peer" 
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            <span className="ml-3 text-sm font-medium text-gray-900">
              {active ? "Włączony" : "Wyłączony"}
            </span>
          </label>
        </div>
      </div>

      <div className="space-y-4">
        {/* Tytuł & Treść */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Nagłówek</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="np. Zestawy Wigilijne"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Treść komunikatu</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="Opisz szczegóły..."
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
          />
        </div>

        {/* Sekcja Przycisku */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
          <h4 className="text-sm font-bold text-slate-800">Ustawienia przycisku</h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Akcja przycisku</label>
              <select
                value={btnType}
                onChange={(e) => setBtnType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none"
              >
                <option value="close">Tylko "Zamknij"</option>
                <option value="link">Przekieruj do linku</option>
                <option value="call">Zadzwoń do lokalu</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tekst na guziku</label>
              <input
                type="text"
                value={btnLabel}
                onChange={(e) => setBtnLabel(e.target.value)}
                placeholder="np. Sprawdź ofertę"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Pola warunkowe */}
          {btnType === "link" && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <LinkIcon size={12} /> Link docelowy
              </label>
              <input
                type="text"
                value={btnUrl}
                onChange={(e) => setBtnUrl(e.target.value)}
                placeholder="np. https://sushitutaj.pl/menu/zestawy"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
              <p className="text-[10px] text-slate-500 mt-1">Wklej pełny link do podstrony lub zewnętrznej strony.</p>
            </div>
          )}

          {btnType === "call" && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <Phone size={12} /> Numer telefonu
              </label>
              <input
                type="text"
                value={btnUrl}
                onChange={(e) => setBtnUrl(e.target.value)}
                placeholder="Pozostaw puste, aby użyć domyślnego numeru lokalu"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Opcjonalnie wpisz inny numer (np. 500123456). Jeśli puste, system użyje głównego numeru restauracji.
              </p>
            </div>
          )}
        </div>

        {/* Zdjęcie */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Obrazek</label>
          <div className="flex flex-col gap-4">
            {imageUrl ? (
              <div className="relative w-full bg-gray-50 rounded-xl overflow-hidden border border-slate-200 group">
                {/* Podgląd bez przycinania w panelu, żeby admin widział co wrzuca */}
                <Image 
                  src={imageUrl} 
                  alt="Podgląd" 
                  width={600}
                  height={400}
                  className="w-full h-auto object-contain"
                  unoptimized={true} 
                />
                <button
                  onClick={removeImage}
                  className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                  title="Usuń zdjęcie"
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
               <label className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition shadow-sm ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                 {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                 <span>{uploading ? "Wgrywanie..." : "Wybierz plik"}</span>
                 <input 
                   type="file" 
                   accept="image/*" 
                   className="hidden" 
                   onChange={handleImageUpload}
                   disabled={uploading}
                 />
               </label>
               <span className="text-xs text-slate-500">Zalecane: JPG, PNG, WebP</span>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || uploading}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition shadow-md"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? "Zapisywanie..." : "Zapisz zmiany"}
        </button>
      </div>
    </div>
  );
}