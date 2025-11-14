"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";

type R = { id: string; slug: string; name: string; city: string };

export default function CityPicker({ restaurants }: { restaurants: R[] }) {
  const options = useMemo(
    () =>
      restaurants.map((r) => ({
        value: r.slug,
        label: `${r.name} — ${r.city}`,
        search: `${r.name} ${r.city}`.toLowerCase(),
      })),
    [restaurants]
  );

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.search.includes(q)) : options;
  }, [options, query]);

  useEffect(() => { if (idx >= filtered.length) setIdx(0); }, [filtered.length, idx]);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { setOpen(true); return; }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter")     { e.preventDefault(); const pick = filtered[idx]; if (pick) { setValue(pick.value); setOpen(false); } }
    if (e.key === "Escape")    { e.preventDefault(); setOpen(false); }
  };

  if (options.length === 0) return <p className="text-center text-white/70">Brak aktywnych restauracji.</p>;

  return (
    <div ref={rootRef} className="mx-auto max-w-lg sm:max-w-3xl">
      {/* DESKTOP */}
      <div className={clsx(
        "hidden sm:flex items-stretch rounded-full relative",
        "border border-white/15 bg-white/10 backdrop-blur",
        "shadow-[0_10px_30px_rgba(0,0,0,.35)]"
      )}>
        <div className="relative flex-1">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen(v => !v)}
            onKeyDown={onKeyDown}
            className="w-full text-left px-6 py-4 text-base rounded-l-full"
          >
            {value ? options.find(o => o.value === value)?.label : "Wybierz restaurację (Szczytno, Ciechanów, Przasnysz)"}
          </button>

          {open && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-white/10 bg-black/95 backdrop-blur">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setIdx(0); }}
                placeholder="Szukaj miasta lub lokalu…"
                className="w-full bg-transparent px-4 py-3 text-sm outline-none border-b border-white/10"
                onKeyDown={onKeyDown}
              />
              <ul role="listbox" aria-label="Lista restauracji" className="max-h-72 overflow-auto">
                {filtered.map((o, i) => (
                  <li key={o.value}>
                    <button
                      role="option"
                      aria-selected={value === o.value}
                      onMouseEnter={() => setIdx(i)}
                      onClick={() => { setValue(o.value); setOpen(false); }}
                      className={clsx(
                        "w-full text-left px-4 py-3 text-sm hover:bg-white/10",
                        i === idx && "bg-white/10"
                      )}
                    >
                      {o.label}
                    </button>
                  </li>
                ))}
                {filtered.length === 0 && <li className="px-4 py-3 text-sm text-white/60">Brak wyników</li>}
              </ul>
            </div>
          )}
        </div>

        <Link
          prefetch
          href={value ? `/${value}` : "#"}
          aria-disabled={!value}
          className={clsx(
            "px-8 py-4 text-base font-medium flex items-center justify-center",
            "rounded-r-full",
            "bg-gradient-to-r from-[var(--accent-red-dark)] via-[var(--accent-red)] to-[var(--accent-red-dark-2)]",
            "hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-white/40",
            !value && "pointer-events-none opacity-50"
          )}
        >
          Przejdź
        </Link>
      </div>

      {/* MOBILE */}
      <div className="sm:hidden space-y-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-full border border-white/15 bg-white/10 backdrop-blur px-4 py-3 text-center"
        >
          {value ? options.find(o => o.value === value)?.label : "Wybierz restaurację (Szczytno, Ciechanów, Przasnysz)"}
        </button>

        <Link
          prefetch
          href={value ? `/${value}` : "#"}
          aria-disabled={!value}
          className={clsx(
            "block w-full rounded-full text-center px-4 py-3 text-sm font-medium",
            "bg-gradient-to-r from-[var(--accent-red-dark)] via-[var(--accent-red)] to-[var(--accent-red-dark-2)]",
            !value && "pointer-events-none opacity-50"
          )}
        >
          Przejdź
        </Link>

        {open && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <div className="mt-auto rounded-t-3xl bg-black/95 backdrop-blur border-t border-white/10 p-4">
              <div className="h-1 w-10 mx-auto rounded bg-white/20 mb-3" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setIdx(0); }}
                placeholder="Szukaj miasta lub lokalu…"
                className="w-full bg-transparent px-4 py-3 text-base outline-none border border-white/10 rounded-xl"
              />
              <ul role="listbox" className="mt-3 max-h-72 overflow-auto">
                {filtered.map((o, i) => (
                  <li key={o.value}>
                    <button
                      role="option"
                      aria-selected={value === o.value}
                      onClick={() => { setValue(o.value); setOpen(false); }}
                      className={clsx(
                        "w-full text-center px-4 py-3 rounded-xl hover:bg-white/10",
                        i === idx && "bg-white/10"
                      )}
                    >
                      {o.label}
                    </button>
                  </li>
                ))}
                {filtered.length === 0 && <li className="px-4 py-3 text-center text-white/60">Brak wyników</li>}
              </ul>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-3 w-full rounded-full border border-white/15 py-3 text-white/80"
              >
                Zamknij
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
