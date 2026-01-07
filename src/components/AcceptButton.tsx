// src/app/components/AcceptButton.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { useSearchParams } from "next/navigation";

type OrderType = "takeaway" | "delivery";

interface Props {
  orderId: string;
  orderType: OrderType;
  onAccept: (minutes: number) => void | Promise<void>;
}

type SettingKey = "prep_time_delivery" | "prep_time_takeaway" | "prep_time_local";
type Settings = Partial<Record<SettingKey, number>>;

const KEYS: SettingKey[] = ["prep_time_delivery", "prep_time_takeaway", "prep_time_local"];

const getCookie = (k: string): string | null => {
  if (typeof document === "undefined") return null;
  const row =
    document.cookie
      .split("; ")
      .find((r) => r.startsWith(`${k}=`) || r.startsWith(`${encodeURIComponent(k)}=`)) || null;
  if (!row) return null;
  const value = row.substring(row.indexOf("=") + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export default function AcceptButton({ orderId, orderType, onAccept }: Props) {
  const supabase = getSupabaseBrowser();
  const searchParams = useSearchParams();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  // zamknij dropdown klik poza i Escape
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (open && popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // pobierz ustawienia dla właściwej restauracji (3 miasta lub global)
  useEffect(() => {
    let stop = false;

    const load = async () => {
      try {
        // 1) Ustal slug restauracji
        const slugParam = searchParams?.get("restaurant")?.toLowerCase() || null;
        const cookieSlug = getCookie("restaurant_slug");
        const slug = slugParam || cookieSlug || "ciechanow";

        // 2) Znajdź restaurant_id
        const { data: rest } = await supabase
          .from("restaurants")
          .select("id, slug")
          .eq("slug", slug)
          .maybeSingle();

        const restaurantId = (rest as any)?.id ?? null;

        // 3) Czytaj ustawienia z restaurant_settings z uwzględnieniem restaurant_id
        //    Fallback: bez filtra jeżeli brak per-restauracja
        const baseQuery = (supabase.from as any)("restaurant_settings")
          .select("setting_key, setting_value")
          .in("setting_key", KEYS);

        const q = restaurantId ? baseQuery.eq("restaurant_id", restaurantId) : baseQuery;
        const { data, error } = await q;

        if (!error && data && data.length) {
          const obj: Settings = {};
          for (const r of data as any[]) {
            const k = String(r.setting_key) as SettingKey;
            if (KEYS.includes(k)) obj[k] = Number.parseInt(String(r.setting_value ?? "0"), 10) || 0;
          }
          if (!stop) setSettings(obj);
          return;
        }

        // 4) Drugi fallback: próbuj z tabeli restaurants (jeśli kolumny istnieją)
        //    prep_time_delivery, prep_time_takeaway, prep_time_local
        if (restaurantId) {
          const { data: rs } = await (supabase.from as any)("restaurants")
            .select("prep_time_delivery, prep_time_takeaway, prep_time_local")
            .eq("id", restaurantId)
            .maybeSingle();

          if (rs) {
            const obj: Settings = {
              prep_time_delivery: Number((rs as any).prep_time_delivery) || 0,
              prep_time_takeaway: Number((rs as any).prep_time_takeaway) || 0,
              prep_time_local: Number((rs as any).prep_time_local) || 0,
            };
            if (!stop) setSettings(obj);
            return;
          }
        }

        // 5) Ostateczny fallback: sensowne domyślne
        if (!stop) {
          setSettings({
            prep_time_delivery: 45,
            prep_time_takeaway: 20,
            prep_time_local: 15,
          });
        }
      } catch {
        if (!stop) {
          setSettings({
            prep_time_delivery: 45,
            prep_time_takeaway: 20,
            prep_time_local: 15,
          });
        }
      }
    };

    void load();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (!settings) {
    return (
      <button
        className="h-10 cursor-wait rounded-md bg-slate-300 px-4 text-sm font-semibold text-white"
        disabled
      >
        Ładowanie…
      </button>
    );
  }

  // domyślny czas wg typu
  const defaultTime =
    orderType === "delivery"
      ? settings.prep_time_delivery || 45
      : settings.prep_time_takeaway || 20;

  // opcje (default jako pierwsza, reszta rosnąco i bez duplikatów)
  const extra = [15, 20, 30, 45, 60, 90];
  const uniq = Array.from(new Set([defaultTime, ...extra])).sort((a, b) => a - b);
  const options = [defaultTime, ...uniq.filter((m) => m !== defaultTime)];

  const accept = async (min: number) => {
    try {
      setBusy(true);
      await onAccept(min);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative inline-flex" ref={popRef}>
      <button
        type="button"
        onClick={() => accept(defaultTime)}
        disabled={busy}
        className="h-10 rounded-l-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-60"
        title={`Akceptuj i ustaw ${defaultTime} min`}
      >
        Akceptuj ({defaultTime} min)
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-haspopup="true"
        aria-expanded={open}
        className="h-10 rounded-r-md border-l border-emerald-500 bg-emerald-600 px-2 text-white hover:bg-emerald-500 disabled:opacity-60"
        title="Zmień czas"
      >
        ▾
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-20 w-44 overflow-hidden rounded-md border bg-white text-slate-900 shadow-lg">
          {options.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => accept(m)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-slate-50"
            >
              <span>{m >= 60 ? `${m / 60} h` : `${m} min`}</span>
              {m === defaultTime && <span className="text-emerald-600">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
