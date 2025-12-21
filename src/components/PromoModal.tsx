"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";

type PromoData = {
  active?: boolean | null;
  title?: string | null;
  content?: string | null;
  image_url?: string | null;
  btn_type?: string | null;
  btn_label?: string | null;
  btn_url?: string | null;
};

// NOWE: dane wielu popupów (z DB) — wymagane id do zapamiętania zamknięcia per-popup
export type PromoPopup = {
  id: string;
  title?: string | null;
  content?: string | null;
  image_url?: string | null;
  btn_type?: string | null; // "close" | "link" | "call"
  btn_label?: string | null;
  btn_url?: string | null;
};

function hash32(input: string) {
  // szybki deterministyczny hash do legacy-id
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function normalizePhone(input: string) {
  return String(input || "").replace(/[^\d+]/g, "");
}

function isSafeLink(url: string) {
  const u = (url || "").trim();
  if (!u) return false;
  return u.startsWith("/") || /^https?:\/\//i.test(u);
}

export default function PromoModal({
  data,
  popups,
  restaurantId,
  restaurantPhone,
  delayMs = 1000,
}: {
  // legacy (1 popup)
  data?: PromoData;

  // NOWE (wiele popupów jako slider)
  popups?: PromoPopup[];

  restaurantId?: string | null;
  restaurantPhone?: string | null;

  // opcjonalnie: opóźnienie otwarcia
  delayMs?: number;
}) {
  const storageKey = useMemo(() => {
    return `promo_seen_v2:${restaurantId || "global"}`;
  }, [restaurantId]);

  const items = useMemo<PromoPopup[]>(() => {
    // Priorytet: slider (wiele popupów)
    if (Array.isArray(popups) && popups.length > 0) {
      return popups.filter(
        (p) => p && typeof p.id === "string" && p.id.length > 0
      );
    }

    // Fallback: pojedynczy popup (legacy)
    if (data?.active) {
      const legacyId = `legacy_${hash32(JSON.stringify(data || {}))}`;
      return [
        {
          id: legacyId,
          title: data.title ?? null,
          content: data.content ?? null,
          image_url: data.image_url ?? null,
          btn_type: data.btn_type ?? null,
          btn_label: data.btn_label ?? null,
          btn_url: data.btn_url ?? null,
        },
      ];
    }

    return [];
  }, [popups, data]);

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  // wczytanie zamkniętych popupów
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      setDismissed(new Set(Array.isArray(arr) ? arr : []));
    } catch {
      setDismissed(new Set());
    }
  }, [storageKey]);

  const visible = useMemo(() => {
    return items.filter((p) => !dismissed.has(p.id));
  }, [items, dismissed]);

  // otwieranie po delay (tylko jeśli jest co pokazać)
  useEffect(() => {
    if (visible.length === 0) {
      setIsOpen(false);
      return;
    }

    if (!isOpen) {
      const t = setTimeout(() => setIsOpen(true), delayMs);
      return () => clearTimeout(t);
    }
  }, [visible.length, isOpen, delayMs]);

  // pilnuj indeksu po zmianach listy
  useEffect(() => {
    if (idx >= visible.length) setIdx(0);
  }, [idx, visible.length]);

  const persistDismissed = useCallback(
    (next: Set<string>) => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {}
    },
    [storageKey]
  );

  const dismissCurrent = useCallback(() => {
    const current = visible[idx];
    if (!current) {
      setIsOpen(false);
      return;
    }

    const nextSet = new Set(dismissed);
    nextSet.add(current.id);
    setDismissed(nextSet);
    persistDismissed(nextSet);

    // po usunięciu bieżącego, pokaż pierwszy z pozostałych
    setIdx(0);
  }, [visible, idx, dismissed, persistDismissed]);

  const prev = useCallback(() => {
    setIdx((v) =>
      visible.length ? (v - 1 + visible.length) % visible.length : 0
    );
  }, [visible.length]);

  const next = useCallback(() => {
    setIdx((v) => (visible.length ? (v + 1) % visible.length : 0));
  }, [visible.length]);

  if (!isOpen) return null;
  if (visible.length === 0) return null;

  const p = visible[idx];

  const btnTypeRaw = (p.btn_type || "close").toLowerCase();
  const btnType: "close" | "link" | "call" =
    btnTypeRaw === "link" || btnTypeRaw === "call"
      ? (btnTypeRaw as any)
      : "close";

  const btnLabel = (p.btn_label || "").trim() || "Zamknij";
  const url = (p.btn_url || "").trim();

  let href = "#";
  let target: string | undefined;
  let rel: string | undefined;
  let isDisabledAction = false;

  if (btnType === "link") {
    if (isSafeLink(url)) {
      href = url;
      if (/^https?:\/\//i.test(url)) {
        target = "_blank";
        rel = "noopener noreferrer";
      }
    } else {
      isDisabledAction = true;
      href = "#";
    }
  }

  if (btnType === "call") {
    const phoneToCall = normalizePhone(url || restaurantPhone || "");
    if (phoneToCall) {
      href = `tel:${phoneToCall}`;
    } else {
      isDisabledAction = true;
      href = "#";
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 pb-4 pt-20 sm:p-6">
      {/* Tło */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={dismissCurrent}
      />

      {/* Kontener (outer bez overflow-hidden, żeby X mógł wyjść poza box) */}
      <div className="relative w-full max-w-md">
        {/* Close: mobile nad boxem, desktop poza boxem po prawej */}
        <button
          onClick={dismissCurrent}
          className="
            absolute z-50 flex h-9 w-9 items-center justify-center rounded-full
            bg-white text-black shadow-md hover:bg-gray-100 transition active:scale-95
            right-2 top-[-35px]
            sm:right-[-40px] sm:top-3
          "
          aria-label="Zamknij"
        >
          <X size={20} />
        </button>

        {/* Box */}
        <div className="bg-white shadow-2xl rounded-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 max-h-[70vh]">
          {/* Nagłówek slidera */}
          {visible.length > 1 && (
            <div className="px-5 sm:px-6 pt-4 pb-2 text-xs text-gray-500 flex items-center justify-between">
              <span>
                Promocje:{" "}
                <strong className="text-gray-700">{idx + 1}</strong> /{" "}
                {visible.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={prev}
                  className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white h-8 w-8 hover:bg-gray-50"
                  aria-label="Poprzedni"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white h-8 w-8 hover:bg-gray-50"
                  aria-label="Następny"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Przewijalna zawartość */}
          <div className="overflow-y-auto overscroll-contain custom-scrollbar flex-1">
            {/* Obraz */}
            {p.image_url && (
              <div className="w-full bg-gray-50 relative">
                <Image
                  src={p.image_url}
                  alt={p.title || "Promocja"}
                  width={800}
                  height={600}
                  className="w-full h-auto object-contain block"
                  unoptimized={true}
                />
              </div>
            )}

            {/* Tekst */}
            <div className="p-5 sm:p-6 text-center">
              {p.title && (
                <h3 className="mb-3 text-xl sm:text-2xl font-bold text-gray-900 leading-tight">
                  {p.title}
                </h3>
              )}

              {p.content && (
                <div className="prose prose-sm mx-auto text-gray-600 whitespace-pre-wrap mb-6 leading-relaxed">
                  {p.content}
                </div>
              )}

              {/* CTA */}
              <div className="pt-2 pb-2">
                {btnType === "close" ? (
                  <button
                    onClick={dismissCurrent}
                    className="w-full rounded-xl bg-gray-100 py-3.5 text-sm font-bold text-gray-800 hover:bg-gray-200 active:bg-gray-300 transition"
                  >
                    {btnLabel}
                  </button>
                ) : (
                  <a
                    href={href}
                    target={target}
                    rel={rel}
                    onClick={(e) => {
                      if (isDisabledAction) {
                        e.preventDefault();
                        dismissCurrent();
                        return;
                      }
                      dismissCurrent();
                    }}
                    className={`block w-full rounded-xl py-3.5 text-sm font-bold text-white transition shadow-lg ${
                      isDisabledAction
                        ? "bg-gray-300 cursor-not-allowed shadow-none"
                        : "bg-[#de1d13] hover:opacity-90 active:scale-[0.98] shadow-red-100"
                    }`}
                  >
                    {btnLabel}
                  </a>
                )}
              </div>

              {/* kropki */}
              {visible.length > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  {visible.map((pp, i) => (
                    <button
                      key={pp.id}
                      type="button"
                      onClick={() => setIdx(i)}
                      className={`h-2.5 w-2.5 rounded-full ${
                        i === idx ? "bg-gray-900" : "bg-gray-300"
                      }`}
                      aria-label={`Slajd ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
