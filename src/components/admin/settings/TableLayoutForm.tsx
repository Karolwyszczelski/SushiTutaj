"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { Plus, RotateCw, Trash2, Save, Info } from "lucide-react";

type UUID = string;

type TableRow = {
  id: UUID;
  restaurant_id: UUID;
  name: string | null;
  seats: number | null;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  active: boolean;
};

const GRID = 20;
const snap = (n: number) => Math.round(n / GRID) * GRID;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const DEFAULT_SIZE = { w: 140, h: 90 };
const DEFAULT_SEATS = 2;

export default function TableLayoutForm() {
  const supabase = getSupabaseBrowser();
  const canvasRef = useRef<HTMLDivElement>(null);

  const [restaurantId, setRestaurantId] = useState<UUID | null>(null);
  const [slug, setSlug] = useState<string | null>(null);

  const [rows, setRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<UUID | null>(null);

  const dragRef = useRef<{
    id: UUID | null;
    mode: "move" | "resize" | null;
    startX: number;
    startY: number;
    base: { x: number; y: number; w: number; h: number };
  } | null>(null);

  /* --- ident restauracji --- */
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const r = await fetch("/api/restaurants/ensure-cookie", { cache: "no-store", credentials: "include" });
        const j = await r.json().catch(() => ({}));
        if (!stop) {
          setRestaurantId(j?.restaurant_id ?? null);
          setSlug(j?.restaurant_slug ?? null);
        }
      } catch {
        if (!stop) { setRestaurantId(null); setSlug(null); }
      }
    })();
    return () => { stop = true; };
  }, []);

  /* --- load --- */
  const load = useCallback(async () => {
    if (!restaurantId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("id, restaurant_id, name, seats, x, y, w, h, rotation, active")
        .eq("restaurant_id", restaurantId)
        .order("name", { ascending: true });

      if (error) throw error;

      setRows(
        (data || []).map((r: any) => ({
          ...r,
          name: r.name ?? null,
          seats: r.seats ?? DEFAULT_SEATS,
          rotation: r.rotation ?? 0,
          active: typeof r.active === "boolean" ? r.active : true,
          w: r.w ?? DEFAULT_SIZE.w,
          h: r.h ?? DEFAULT_SIZE.h,
          x: snap(r.x ?? 40),
          y: snap(r.y ?? 40),
        }))
      );
    } catch (e: any) {
      setError(e?.message || "Błąd pobierania układu stołów.");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, supabase]);

  useEffect(() => {
    void load();
    if (!restaurantId) return;

    const ch = supabase
      .channel("public:restaurant_tables:" + restaurantId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurant_tables", filter: `restaurant_id=eq.${restaurantId}` },
        () => void load()
      )
      .subscribe();

    return () => { void supabase.removeChannel(ch); };
  }, [restaurantId, load, supabase]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  /* --- akcje --- */
  const addTable = async () => {
    if (!restaurantId) return;
    try {
      const baseName = "Stół";
      const nextIndex = rows.length + 1;
      const { data, error } = await supabase
        .from("restaurant_tables")
        .insert([{
          restaurant_id: restaurantId,
          name: `${baseName} ${nextIndex}`,
          seats: DEFAULT_SEATS,
          x: 40, y: 40, w: DEFAULT_SIZE.w, h: DEFAULT_SIZE.h,
          rotation: 0, active: true,
        }])
        .select("*")
        .single();

      if (error) throw error;
      setRows((r) => [...r, data as TableRow]);
      setSelectedId((data as TableRow).id);
    } catch (e: any) {
      alert("Nie udało się dodać stołu: " + (e?.message || e));
    }
  };

  const rotateSelected = () => {
    if (!selected) return;
    setRows((all) =>
      all.map((t) => (t.id === selected.id ? { ...t, rotation: (Math.round((t.rotation + 90) / 90) * 90) % 360 } : t))
    );
  };

  const removeSelected = async () => {
    if (!selected) return;
    if (!confirm(`Usunąć „${selected.name || "Stół"}”?`)) return;
    try {
      const { error } = await supabase.from("restaurant_tables").delete().eq("id", selected.id);
      if (error) throw error;
      setRows((r) => r.filter((x) => x.id !== selected.id));
      setSelectedId(null);
    } catch (e: any) {
      alert("Nie udało się usunąć stołu: " + (e?.message || e));
    }
  };

  const saveAll = async () => {
    if (!restaurantId) return;
    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        id: r.id,
        restaurant_id: restaurantId,
        name: r.name || null,
        seats: r.seats ?? DEFAULT_SEATS,
        x: snap(r.x), y: snap(r.y),
        w: Math.max(snap(r.w), GRID), h: Math.max(snap(r.h), GRID),
        rotation: r.rotation ?? 0,
        active: !!r.active,
      }));
      const { error } = await supabase.from("restaurant_tables").upsert(payload, { onConflict: "id" });
      if (error) throw error;
      await load();
    } catch (e: any) {
      alert("Błąd zapisu układu: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  /* --- drag/resize --- */
  const onPointerDown = (e: React.PointerEvent, id: UUID, mode: "move" | "resize") => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    dragRef.current = {
      id, mode,
      startX: e.clientX, startY: e.clientY,
      base: { x: row.x, y: row.y, w: row.w, h: row.h }
    };
    setSelectedId(id);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !canvasRef.current) return;
    const { id, mode, startX, startY, base } = dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const rect = canvasRef.current.getBoundingClientRect();

    setRows((all) =>
      all.map((t) => {
        if (t.id !== id) return t;
        if (mode === "move") {
          const nx = snap(clamp(base.x + dx, 0, Math.max(0, rect.width - t.w)));
          const ny = snap(clamp(base.y + dy, 0, Math.max(0, rect.height - t.h)));
          return { ...t, x: nx, y: ny };
        }
        const nw = snap(clamp(base.w + dx, GRID * 3, rect.width - t.x));
        const nh = snap(clamp(base.h + dy, GRID * 2, rect.height - t.y));
        return { ...t, w: nw, h: nh };
      })
    );
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    }
    dragRef.current = null;
  };

  const editSelected = <K extends keyof TableRow>(key: K, value: TableRow[K]) => {
    if (!selected) return;
    setRows((all) => all.map((t) => (t.id === selected.id ? { ...t, [key]: value } : t)));
  };

  /* --- UI --- */
  return (
    <div className="space-y-4 text-slate-900">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Rezerwacje & Stoły {slug ? `— ${slug}` : ""}</h2>
        <button
          onClick={saveAll}
          disabled={!restaurantId || saving}
          className={clsx(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm",
            !restaurantId || saving
              ? "bg-indigo-600/70 text-white"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          )}
        >
          <Save className="h-4 w-4" />
          Zapisz układ
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={addTable}
          disabled={!restaurantId}
          className={clsx(
            "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold",
            !restaurantId
              ? "bg-white text-slate-400 border-slate-200"
              : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50"
          )}
        >
          <Plus className="h-4 w-4" />
          Dodaj stół
        </button>

        <button
          onClick={rotateSelected}
          disabled={!selected}
          className={clsx(
            "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold",
            !selected
              ? "bg-white text-slate-400 border-slate-200"
              : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50"
          )}
        >
          <RotateCw className="h-4 w-4" />
          Obróć 90°
        </button>

        <button
          onClick={removeSelected}
          disabled={!selected}
          className={clsx(
            "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold",
            !selected
              ? "bg-white text-rose-300 border-slate-200"
              : "bg-white text-rose-600 border-slate-200 hover:bg-rose-50"
          )}
        >
          <Trash2 className="h-4 w-4" />
          Usuń wybrany
        </button>
      </div>

      <div className="rounded-xl border bg-white p-4 text-sm shadow-sm">
        {!selected ? (
          <div className="flex items-center gap-2 text-slate-600">
            <Info className="h-4 w-4" /> Wybierz stół, aby edytować właściwości.
          </div>
        ) : (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <div className="min-w-[220px]">
              <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-600">Nazwa</label>
              <input
                value={selected.name || ""}
                onChange={(e) => editSelected("name", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div className="w-28">
              <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-600">Miejsca</label>
              <input
                type="number" min={1}
                value={selected.seats ?? DEFAULT_SEATS}
                onChange={(e) => editSelected("seats", Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <label className="mt-1 inline-flex select-none items-center gap-2 text-slate-800">
              <input
                type="checkbox"
                checked={!!selected.active}
                onChange={(e) => editSelected("active", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Aktywny
            </label>
            <div className="hidden grow text-slate-500 md:block">
              Przeciągnij stół, aby zmienić pozycję. Fioletowy narożnik — zmiana rozmiaru.
            </div>
          </div>
        )}
      </div>

      <div
        ref={canvasRef}
        className="relative min-h-[540px] select-none overflow-hidden rounded-2xl border bg-white shadow-sm"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={() => setSelectedId(null)}
        style={{ touchAction: "none" }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: "#f8fafc",
            backgroundImage: `repeating-linear-gradient(0deg, #e5e7eb 0, #e5e7eb 1px, transparent 1px, transparent ${GRID}px),
                               repeating-linear-gradient(90deg, #e5e7eb 0, #e5e7eb 1px, transparent 1px, transparent ${GRID}px)`,
          }}
        />

        {rows.map((t) => (
          <div
            key={t.id}
            style={{ transform: `translate(${t.x}px, ${t.y}px) rotate(${t.rotation}deg)`, width: t.w, height: t.h, zIndex: 1 }}
            className={clsx(
              "absolute rounded-xl border p-2 text-xs shadow-sm transition-colors",
              t.id === selectedId ? "border-indigo-600 ring-2 ring-indigo-200" : "border-slate-200",
              t.active ? "bg-amber-50" : "bg-slate-100 opacity-80"
            )}
            onPointerDown={(e) => onPointerDown(e, t.id, "move")}
            onClick={(e) => { e.stopPropagation(); setSelectedId(t.id); }}
            role="button"
            aria-label={t.name || "Stół"}
          >
            <div className="text-[11px] font-semibold text-slate-800">{t.name || "Stół"}</div>
            <div className="text-[11px] text-slate-600">{t.seats || DEFAULT_SEATS} os.</div>
            <div
              onPointerDown={(e) => onPointerDown(e, t.id, "resize")}
              className="absolute bottom-1 right-1 h-3 w-3 cursor-se-resize rounded-sm bg-indigo-500"
              title="Zmień rozmiar"
            />
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Ładowanie…</p>}
    </div>
  );
}
