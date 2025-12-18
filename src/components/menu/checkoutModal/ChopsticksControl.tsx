"use client";


import React from "react";

/* Kontrolka ilości pałeczek – używana w podsumowaniu / koszyku */
function ChopsticksControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(10, n));
  const dec = () => onChange(clamp(value - 1));
  const inc = () => onChange(clamp(value + 1));

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-black">Ilość pałeczek</span>
        <span className="text-[11px] text-black/60">
          0 = nie potrzebuję
        </span>
      </div>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={dec}
          className="h-11 w-11 rounded-[20px] border border-black/20 bg-transparent text-black text-xl flex items-center justify-center"
        >
          –
        </button>
        <div className="min-w-[56px] text-center text-lg font-semibold">
          {value}
        </div>
        <button
          type="button"
          onClick={inc}
          className="h-11 w-11 rounded-full border border-black/20 bg-black text-white text-xl flex items-center justify-center"
        >
          +
        </button>
      </div>
    </div>
  );
}

export { ChopsticksControl };
