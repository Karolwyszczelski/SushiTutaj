"use client";

import React, { useCallback } from "react";
import { Minus, Plus, Utensils } from "lucide-react";
import clsx from "clsx";

type Props = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
};

export function ChopsticksControl({ value, onChange, min = 0, max = 10 }: Props) {
  const v = Number.isFinite(value) ? value : 0;

  const setClamped = useCallback(
    (next: number) => {
      const n = Math.max(min, Math.min(max, Math.round(next)));
      onChange(n);
    },
    [min, max, onChange]
  );

  const dec = () => setClamped(v - 1);
  const inc = () => setClamped(v + 1);

  return (
    <div className="w-full rounded-2xl border border-white/10 lg:border-black/10 bg-white/[0.03] lg:bg-gray-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 lg:bg-white flex items-center justify-center">
            <Utensils size={18} className="text-[#a61b1b]" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">
              Pałeczki
            </div>
            <div className="text-xs text-white/50 lg:text-black/50 leading-tight">
              0 = bez pałeczek
            </div>
          </div>
        </div>

        <div className="shrink-0 inline-flex items-center rounded-xl bg-white/10 lg:bg-white overflow-hidden border border-white/10 lg:border-black/10">
          <button
            type="button"
            onClick={dec}
            disabled={v <= min}
            className={clsx(
              "h-10 w-10 grid place-items-center transition-colors",
              v <= min ? "opacity-40 cursor-not-allowed" : "hover:bg-white/10 lg:hover:bg-gray-100 active:scale-95"
            )}
            aria-label="Mniej pałeczek"
          >
            <Minus size={18} />
          </button>

          <div className="h-10 w-12 grid place-items-center text-base font-bold tabular-nums border-x border-white/10 lg:border-black/10">
            {v}
          </div>

          <button
            type="button"
            onClick={inc}
            disabled={v >= max}
            className={clsx(
              "h-10 w-10 grid place-items-center transition-colors",
              v >= max ? "opacity-40 cursor-not-allowed" : "hover:bg-white/10 lg:hover:bg-gray-100 active:scale-95"
            )}
            aria-label="Więcej pałeczek"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
