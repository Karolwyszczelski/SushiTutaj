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
    <div className="w-full rounded-xl border border-black/10 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <Utensils size={16} className="shrink-0 opacity-70" />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight truncate">
              Pałeczki
            </div>
            <div className="text-[11px] text-black/50 leading-tight hidden sm:block">
              0 = bez pałeczek
            </div>
          </div>
        </div>

        <div className="shrink-0 inline-flex items-center rounded-xl border border-black/10 overflow-hidden">
          <button
            type="button"
            onClick={dec}
            disabled={v <= min}
            className={clsx(
              "h-9 w-9 grid place-items-center",
              v <= min ? "opacity-40 cursor-not-allowed" : "hover:bg-black/5"
            )}
            aria-label="Mniej pałeczek"
          >
            <Minus size={16} />
          </button>

          <div className="h-9 w-10 grid place-items-center text-sm font-semibold tabular-nums border-x border-black/10">
            {v}
          </div>

          <button
            type="button"
            onClick={inc}
            disabled={v >= max}
            className={clsx(
              "h-9 w-9 grid place-items-center",
              v >= max ? "opacity-40 cursor-not-allowed" : "hover:bg-black/5"
            )}
            aria-label="Więcej pałeczek"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
