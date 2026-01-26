"use client";

import React, { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import {
  Plus,
  Trash2,
  GripVertical,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
} from "lucide-react";

// ===== Typy =====
type Option = {
  id: string;
  name: string;
  price_modifier: number; // grosze
  position: number;
  is_active: boolean;
};

type OptionGroup = {
  id: string;
  name: string;
  type: "radio" | "checkbox";
  min_select: number;
  max_select: number;
  options: Option[];
};

const zlToCents = (priceStr: string) => {
  const cents = Math.round(parseFloat(String(priceStr || "0").replace(",", ".")) * 100);
  return Number.isFinite(cents) ? cents : 0;
};

const centsToZl = (cents?: number | null) => ((cents ?? 0) / 100).toFixed(2);

export default function AddonOptionsForm({ restaurantSlug }: { restaurantSlug: string | null }) {
  const supabase = getSupabaseBrowser();

  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  // Dane
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Nowa grupa
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupType, setNewGroupType] = useState<"radio" | "checkbox">("radio");
  const [isCreating, setIsCreating] = useState(false);

  // Accordion (paski rozwijane)
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Drafty edycji (inline)
  const [draftGroupNames, setDraftGroupNames] = useState<Record<string, string>>({});
  const [draftOptionNames, setDraftOptionNames] = useState<Record<string, string>>({});
  const [draftOptionPrices, setDraftOptionPrices] = useState<Record<string, string>>({});

  // Dodawanie opcji per grupa
  const [newOptByGroup, setNewOptByGroup] = useState<
    Record<string, { name: string; priceZl: string }>
  >({});

  // 1) Restaurant ID
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!restaurantSlug) return;

      const { data, error } = await supabase
        .from("restaurants")
        .select("id")
        .eq("slug", restaurantSlug)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("AddonOptionsForm: błąd pobierania restaurantId", error);
        setRestaurantId(null);
        return;
      }

      setRestaurantId(data?.id ?? null);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, supabase]);

  // 2) Fetch groups
  const fetchGroups = useCallback(async () => {
    if (!restaurantId) return;

    setLoading(true);

    const { data: groupsData, error } = await supabase
      .from("option_groups")
      .select(
        `
        id,
        name,
        type,
        min_select,
        max_select,
        created_at,
        options (
          id, name, price_modifier, position, is_active
        )
      `
      )
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Błąd pobierania grup:", error);
      setGroups([]);
      setLoading(false);
      return;
    }

    const formatted: OptionGroup[] = (groupsData || []).map((g: any) => ({
      ...g,
      options: (g.options || [])
        .map((o: any) => ({
          ...o,
          is_active: o.is_active !== false,
        }))
        .sort((a: any, b: any) => (a.position || 0) - (b.position || 0)),
    }));

    setGroups(formatted);

    // init drafty (żeby inputy były kontrolowane i nie "skakały")
    const groupNameMap: Record<string, string> = {};
    const optNameMap: Record<string, string> = {};
    const optPriceMap: Record<string, string> = {};
    formatted.forEach((g) => {
      groupNameMap[g.id] = g.name;
      g.options.forEach((o) => {
        optNameMap[o.id] = o.name;
        optPriceMap[o.id] = centsToZl(o.price_modifier);
      });
    });

    setDraftGroupNames(groupNameMap);
    setDraftOptionNames(optNameMap);
    setDraftOptionPrices(optPriceMap);

    // domyślnie otwórz pierwszą grupę, jeśli nic nie jest otwarte
    setOpen((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const first = formatted[0]?.id;
      return first ? { [first]: true } : {};
    });

    setLoading(false);
  }, [restaurantId, supabase]);

  useEffect(() => {
    if (!restaurantId) return;
    void fetchGroups();
  }, [restaurantId, fetchGroups]);

  // ===== Grupy =====
  const handleAddGroup = useCallback(async () => {
    if (!newGroupName.trim() || !restaurantId) return;

    setIsCreating(true);

    const { error } = await supabase.from("option_groups").insert({
      restaurant_id: restaurantId,
      name: newGroupName.trim(),
      type: newGroupType,
      min_select: newGroupType === "radio" ? 1 : 0,
      max_select: 1,
    });

    if (error) {
      alert("Nie udało się dodać grupy: " + error.message);
    } else {
      setNewGroupName("");
      await fetchGroups();
    }

    setIsCreating(false);
  }, [newGroupName, restaurantId, newGroupType, supabase, fetchGroups]);

  const handleDeleteGroup = useCallback(
    async (groupId: string) => {
      if (
        !confirm(
          "Czy na pewno usunąć tę grupę i wszystkie jej opcje? To usunie je również z przypisanych produktów."
        )
      )
        return;

      const { error } = await supabase.from("option_groups").delete().eq("id", groupId);

      if (error) alert("Błąd usuwania: " + error.message);
      else await fetchGroups();
    },
    [supabase, fetchGroups]
  );

  const handleUpdateGroupName = useCallback(
    async (groupId: string) => {
      const nextName = (draftGroupNames[groupId] ?? "").trim();
      if (!nextName) return;

      const current = groups.find((g) => g.id === groupId);
      if (!current) return;
      if (current.name === nextName) return;

      // optimistic
      setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name: nextName } : g)));

      const { error } = await supabase.from("option_groups").update({ name: nextName }).eq("id", groupId);

      if (error) {
        alert("Nie udało się zapisać nazwy grupy: " + error.message);
        await fetchGroups();
      }
    },
    [draftGroupNames, groups, supabase, fetchGroups]
  );

  // ===== Opcje =====
  const handleAddOption = useCallback(
    async (groupId: string) => {
      const draft = newOptByGroup[groupId] || { name: "", priceZl: "" };
      const name = (draft.name || "").trim();
      if (!name) return;

      const group = groups.find((g) => g.id === groupId);
      const maxPos = group?.options?.reduce((m, o) => Math.max(m, o.position || 0), 0) ?? 0;

      const { error } = await supabase.from("options").insert({
        group_id: groupId,
        name,
        price_modifier: zlToCents(draft.priceZl || "0"),
        position: maxPos + 1,
        is_active: true,
      });

      if (error) {
        alert("Błąd dodawania opcji: " + error.message);
        return;
      }

      setNewOptByGroup((prev) => ({ ...prev, [groupId]: { name: "", priceZl: "" } }));
      await fetchGroups();
    },
    [newOptByGroup, groups, supabase, fetchGroups]
  );

  const handleDeleteOption = useCallback(
    async (optionId: string) => {
      if (!confirm("Usunąć tę opcję?")) return;
      const { error } = await supabase.from("options").delete().eq("id", optionId);
      if (error) alert("Błąd usuwania opcji: " + error.message);
      else await fetchGroups();
    },
    [supabase, fetchGroups]
  );

  const handleUpdateOptionName = useCallback(
    async (optionId: string) => {
      const nextName = (draftOptionNames[optionId] ?? "").trim();
      if (!nextName) return;

      // optimistic
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          options: g.options.map((o) => (o.id === optionId ? { ...o, name: nextName } : o)),
        }))
      );

      const { error } = await supabase.from("options").update({ name: nextName }).eq("id", optionId);

      if (error) {
        alert("Nie udało się zapisać nazwy opcji: " + error.message);
        await fetchGroups();
      }
    },
    [draftOptionNames, supabase, fetchGroups]
  );

  const handleUpdatePrice = useCallback(
    async (optionId: string) => {
      const priceStr = draftOptionPrices[optionId] ?? "0";
      const cents = zlToCents(priceStr);

      // optimistic
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          options: g.options.map((o) => (o.id === optionId ? { ...o, price_modifier: cents } : o)),
        }))
      );

      const { error } = await supabase.from("options").update({ price_modifier: cents }).eq("id", optionId);

      if (error) {
        alert("Nie udało się zapisać ceny: " + error.message);
        await fetchGroups();
      }
    },
    [draftOptionPrices, supabase, fetchGroups]
  );

  const toggleOptionActive = useCallback(
    async (optionId: string, next: boolean) => {
      // optimistic
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          options: g.options.map((o) => (o.id === optionId ? { ...o, is_active: next } : o)),
        }))
      );

      const { error } = await supabase.from("options").update({ is_active: next }).eq("id", optionId);

      if (error) {
        alert("Nie udało się zmienić statusu opcji: " + error.message);
        await fetchGroups();
      }
    },
    [supabase, fetchGroups]
  );

  // ===== UI =====
  if (!restaurantSlug) {
    return <div className="text-sm text-slate-500">Wybierz restaurację, aby edytować opcje.</div>;
  }

  if (!restaurantId) {
    return <div className="text-sm text-slate-500">Ładowanie konfiguracji...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 1) KREATOR NOWEJ GRUPY */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col lg:flex-row gap-4 items-end shadow-sm">
        <div className="flex-1 w-full">
          <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">
            Nazwa nowej grupy
          </label>
          <input
            className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400"
            placeholder="np. Smaki soków, Wariant Pepsi, Dodatki do pizzy..."
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddGroup()}
          />
        </div>

        <div className="w-full lg:w-60">
          <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">Typ wyboru</label>
          <select
            className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={newGroupType}
            onChange={(e) => setNewGroupType(e.target.value as any)}
          >
            <option value="radio">Jeden (Radio) — np. smak</option>
            <option value="checkbox">Wiele (Checkbox) — np. dodatki</option>
          </select>
        </div>

        <button
          onClick={handleAddGroup}
          disabled={isCreating || !newGroupName.trim()}
          className="w-full lg:w-auto bg-slate-900 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-50 transition shadow-sm"
        >
          {isCreating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
          Dodaj
        </button>
      </div>

      {loading && <div className="text-center py-8 text-slate-400">Ładowanie grup...</div>}

      {!loading && groups.length === 0 && (
        <div className="text-center py-10 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
          Brak zdefiniowanych grup. Dodaj pierwszą powyżej (np. Smaki soków).
        </div>
      )}

      {/* 2) LISTA GRUP – podłużne paski (accordion) */}
      <div className="space-y-4">
        {groups.map((group) => {
          const isOpen = !!open[group.id];
          const typeLabel = group.type === "radio" ? "Radio (1 wybór)" : "Checkbox (wiele)";
          const optCount = group.options.length;

          return (
            <div
              key={group.id}
              className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
            >
              {/* Pasek nagłówka */}
<div className="px-4 py-3 flex items-center gap-3 bg-slate-50/60 border-b border-slate-100">
  {/* Toggle akordeonu – tylko tutaj */}
  <button
    type="button"
    aria-label={isOpen ? "Zwiń" : "Rozwiń"}
    onClick={() => setOpen((p) => ({ ...p, [group.id]: !isOpen }))}
    className="flex items-center gap-2 shrink-0 text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
  >
    {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
  </button>

  {/* Nazwa grupy (inline edit) */}
  <div className="min-w-0 flex-1">
    <input
      value={draftGroupNames[group.id] ?? group.name}
      onChange={(e) =>
        setDraftGroupNames((prev) => ({ ...prev, [group.id]: e.target.value }))
      }
      onBlur={() => void handleUpdateGroupName(group.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraftGroupNames((prev) => ({ ...prev, [group.id]: group.name }));
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className="w-full bg-transparent font-bold text-slate-800 outline-none text-base truncate cursor-text rounded-md px-1 -mx-1 focus:bg-white focus:ring-2 focus:ring-emerald-500"
      title="Kliknij i edytuj nazwę grupy"
    />

    <div className="mt-0.5 flex flex-wrap gap-2 items-center text-[11px] text-slate-500">
      <span className="uppercase tracking-wide font-semibold">
        {group.type === "radio" ? "Radio (1 wybór)" : "Checkbox (wiele)"}
      </span>
      <span className="text-slate-300">•</span>
      <span>{group.options.length} opcji</span>
      <span className="text-slate-300">•</span>
      <span className="uppercase tracking-wide">
        min: {group.min_select} / max: {group.max_select}
      </span>
    </div>
  </div>

  {/* Akcje */}
  <div className="flex items-center gap-1 shrink-0">
    <button
      type="button"
      onClick={() => void handleDeleteGroup(group.id)}
      className="text-slate-400 hover:text-rose-600 p-2 hover:bg-rose-50 rounded-xl transition"
      title="Usuń całą grupę"
    >
      <Trash2 size={16} />
    </button>
  </div>
</div>

              {/* Treść rozwijana */}
              {isOpen && (
                <div className="p-4 space-y-4">
                  {/* Lista opcji */}
                  <div className="space-y-2">
                    {group.options.length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-4 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                        Brak opcji. Dodaj pierwszą poniżej.
                      </p>
                    ) : (
                      group.options.map((option) => {
                        const active = option.is_active !== false;

                        return (
                          <div
                            key={option.id}
                            className={`
                              flex items-center gap-2 p-2 rounded-xl border transition
                              ${active ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200 opacity-75"}
                            `}
                          >
                            <GripVertical size={14} className="text-slate-300 cursor-grab active:cursor-grabbing" />

                            {/* Toggle active */}
                            <button
                              type="button"
                              onClick={() => void toggleOptionActive(option.id, !active)}
                              className={`
                                inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold border
                                ${active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}
                              `}
                              title={active ? "Wyłącz opcję" : "Włącz opcję"}
                            >
                              {active ? <Eye size={14} /> : <EyeOff size={14} />}
                              {active ? "Aktywne" : "Wyłączone"}
                            </button>

                            {/* Nazwa opcji (inline edit) */}
                            <div className="flex-1 min-w-0">
                              <input
                                value={draftOptionNames[option.id] ?? option.name}
                                onChange={(e) =>
                                  setDraftOptionNames((prev) => ({ ...prev, [option.id]: e.target.value }))
                                }
                                onBlur={() => void handleUpdateOptionName(option.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                                  if (e.key === "Escape") {
                                    setDraftOptionNames((prev) => ({ ...prev, [option.id]: option.name }));
                                    (e.currentTarget as HTMLInputElement).blur();
                                  }
                                }}
                                className="w-full bg-transparent outline-none font-medium text-slate-800 truncate"
                                title="Kliknij i edytuj nazwę opcji"
                              />
                            </div>

                            {/* Cena */}
                            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
                              <span className="text-[10px] text-slate-400">+</span>
                              <input
                                className="w-16 text-right text-xs font-semibold outline-none text-slate-900 bg-transparent"
                                value={draftOptionPrices[option.id] ?? centsToZl(option.price_modifier)}
                                onChange={(e) =>
                                  setDraftOptionPrices((prev) => ({ ...prev, [option.id]: e.target.value }))
                                }
                                onBlur={() => void handleUpdatePrice(option.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                                  if (e.key === "Escape") {
                                    setDraftOptionPrices((prev) => ({
                                      ...prev,
                                      [option.id]: centsToZl(option.price_modifier),
                                    }));
                                    (e.currentTarget as HTMLInputElement).blur();
                                  }
                                }}
                              />
                              <span className="text-[10px] text-slate-400">zł</span>
                            </div>

                            {/* Usuń opcję */}
                            <button
                              onClick={() => void handleDeleteOption(option.id)}
                              className="text-slate-300 hover:text-rose-600 p-2 rounded-lg hover:bg-rose-50 transition"
                              title="Usuń opcję"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Dodawanie opcji */}
                  <div className="pt-3 border-t border-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_110px] gap-2">
                      <input
                        value={newOptByGroup[group.id]?.name ?? ""}
                        onChange={(e) =>
                          setNewOptByGroup((prev) => ({
                            ...prev,
                            [group.id]: { ...(prev[group.id] ?? { name: "", priceZl: "" }), name: e.target.value },
                          }))
                        }
                        placeholder="Nazwa opcji (np. Pomarańcza)"
                        className="w-full px-3 py-2 text-sm border border-slate-300 bg-white rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400"
                        autoComplete="off"
                      />

                      <input
                        value={newOptByGroup[group.id]?.priceZl ?? ""}
                        onChange={(e) =>
                          setNewOptByGroup((prev) => ({
                            ...prev,
                            [group.id]: { ...(prev[group.id] ?? { name: "", priceZl: "" }), priceZl: e.target.value },
                          }))
                        }
                        placeholder="Cena (zł)"
                        inputMode="decimal"
                        className="w-full px-3 py-2 text-sm border border-slate-300 bg-white rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400"
                      />

                      <button
                        type="button"
                        onClick={() => void handleAddOption(group.id)}
                        className="bg-slate-900 text-white px-3 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition"
                      >
                        <Plus size={16} />
                        Dodaj
                      </button>
                    </div>

                    <p className="mt-2 text-[11px] text-slate-500">
                      Tip: nazwy i ceny zapisują się po wyjściu z pola (blur) lub Enter.
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}