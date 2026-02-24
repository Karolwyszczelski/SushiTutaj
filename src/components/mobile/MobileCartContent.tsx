// src/components/mobile/MobileCartContent.tsx
"use client";

import React, { useMemo, useState, useEffect } from "react";
import Image from "next/image";
import { ShoppingBag, Trash2, Plus, Minus, ChevronRight } from "lucide-react";
import useCartStore from "@/store/cartStore";
import { useMobileNavStore } from "@/store/mobileNavStore";

interface MobileCartContentProps {
  onClose: () => void;
}

/* ── helpers ── */
const MIN_ORDER = 50; // minimum order value for delivery (zł)

const slugify = (s: string) =>
  s
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** resolve product image with fallback chain */
function resolveImg(item: { name: string; image_url?: string }): string {
  if (
    item.image_url &&
    (item.image_url.startsWith("http") || item.image_url.startsWith("/"))
  )
    return item.image_url;
  const base = `/assets/menuphoto/${slugify(item.name)}`;
  return `${base}.webp`; // will fall through to onError handler
}

function polishItems(n: number): string {
  if (n === 1) return "pozycja";
  if (n >= 2 && n <= 4) return "pozycje";
  return "pozycji";
}

export default function MobileCartContent({ onClose }: MobileCartContentProps) {
  const items = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const removeWholeItem = useCartStore((s) => s.removeWholeItem);
  const addItem = useCartStore((s) => s.addItem);
  const openCheckoutModal = useCartStore((s) => (s as any).openCheckoutModal);

  const total = useMemo(() => {
    return items.reduce((sum, item) => {
      const price =
        typeof item.price === "number"
          ? item.price
          : parseFloat(String(item.price).replace(",", ".")) || 0;
      return sum + price * (item.quantity || 1);
    }, 0);
  }, [items]);

  const itemCount = useMemo(
    () => items.reduce((n, i) => n + (i.quantity || 1), 0),
    [items]
  );

  const progress = Math.min(1, total / MIN_ORDER);
  const remaining = Math.max(0, MIN_ORDER - total);

  const handleIncrease = (item: (typeof items)[0]) => {
    addItem({
      id: item.id,
      product_id: item.product_id,
      name: item.name,
      price: item.price,
      quantity: 1,
      image_url: item.image_url,
    });
  };

  const handleDecrease = (item: (typeof items)[0]) => {
    removeItem(item.lineId);
  };

  const handleRemove = (item: (typeof items)[0]) => {
    removeWholeItem(item.lineId);
  };

  const handleCheckout = () => {
    onClose();
    setTimeout(() => {
      if (typeof openCheckoutModal === "function") openCheckoutModal();
    }, 300);
  };

  const goToMenu = () => {
    onClose();
    useMobileNavStore.getState().setActiveTab("menu");
  };

  /* ── empty state ── */
  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center px-6 min-h-[60vh]"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        }}
      >
        {/* icon */}
        <div className="relative w-20 h-20 mb-5">
          <div className="absolute inset-0 bg-white/[0.04] rounded-2xl rotate-6" />
          <div className="absolute inset-0 bg-white/[0.06] rounded-2xl -rotate-3 flex items-center justify-center">
            <ShoppingBag className="w-9 h-9 text-white/25" />
          </div>
        </div>

        <h3 className="text-lg font-semibold text-white mb-1.5">
          Twój koszyk jest pusty
        </h3>
        <p className="text-sm text-white/50 text-center mb-8 max-w-[240px]">
          Dodaj coś pysznego z naszego menu — pałeczki czekają!
        </p>

        <button
          type="button"
          onClick={goToMenu}
          className="group flex items-center gap-2 px-7 py-3.5 bg-gradient-to-br from-[#b31217] to-[#7a0b0b] text-white text-[15px] font-semibold rounded-full shadow-[0_4px_20px_rgba(179,18,23,0.35)] active:scale-[0.97] transition-transform"
        >
          Przeglądaj menu
          <ChevronRight className="w-4 h-4 opacity-60 group-active:translate-x-0.5 transition-transform" />
        </button>
      </div>
    );
  }

  /* ── cart with items ── */
  return (
    <div className="flex flex-col h-full max-h-full">
      {/* ── progress bar (minimum order) ── */}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-white/50 font-medium">
            {remaining > 0
              ? `Brakuje ${remaining.toFixed(0)} zł do minimum`
              : "Minimum zamówienia osiągnięte ✓"}
          </span>
          <span className="text-[11px] text-white/40">
            {total.toFixed(0)} / {MIN_ORDER} zł
          </span>
        </div>
        <div className="h-[3px] w-full bg-white/[0.08] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progress * 100}%`,
              background:
                progress >= 1
                  ? "linear-gradient(90deg, #22c55e 0%, #16a34a 100%)"
                  : "linear-gradient(90deg, #c41e1e 0%, #a61b1b 100%)",
            }}
          />
        </div>
      </div>

      {/* ── items list ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-2">
        <div className="space-y-2.5 pb-4">
          {items.map((item) => {
            const price =
              typeof item.price === "number"
                ? item.price
                : parseFloat(String(item.price).replace(",", ".")) || 0;
            const itemTotal = price * (item.quantity || 1);

            return (
              <CartItemRow
                key={item.lineId}
                item={item}
                itemTotal={itemTotal}
                onIncrease={() => handleIncrease(item)}
                onDecrease={() => handleDecrease(item)}
                onRemove={() => handleRemove(item)}
              />
            );
          })}
        </div>
      </div>

      {/* ── sticky footer ── */}
      <div
        className="border-t border-white/[0.06] bg-[#0b0b0b] shrink-0"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        }}
      >
        {/* summary row */}
        <div className="flex items-center justify-between px-4 pt-3 pb-3">
          <div>
            <p className="text-[11px] text-white/45 font-medium">
              Razem ({itemCount} {polishItems(itemCount)})
            </p>
            <p className="text-[22px] font-bold text-white leading-tight tracking-tight">
              {total.toFixed(2)}{" "}
              <span className="text-[15px] font-semibold text-white/60">
                zł
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={remaining > 0}
            className="flex items-center gap-2 px-6 py-3.5 bg-gradient-to-br from-[#b31217] to-[#7a0b0b] text-white text-[15px] font-semibold rounded-full shadow-[0_4px_20px_rgba(179,18,23,0.35)] active:scale-[0.97] transition-all disabled:opacity-40 disabled:active:scale-100"
          >
            Zamów
            <ChevronRight className="w-4 h-4 opacity-70" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CartItemRow — single product line with thumbnail
   ═══════════════════════════════════════════════════════ */

interface CartItemRowProps {
  item: ReturnType<typeof useCartStore.getState>["items"][0];
  itemTotal: number;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}

function CartItemRow({
  item,
  itemTotal,
  onIncrease,
  onDecrease,
  onRemove,
}: CartItemRowProps) {
  const [imgSrc, setImgSrc] = useState(() => resolveImg(item));
  const [imgError, setImgError] = useState(false);

  /* swipe-to-delete state */
  const [offset, setOffset] = useState(0);
  const [startX, setStartX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startX === null) return;
    const dx = e.touches[0].clientX - startX;
    if (dx < 0) setOffset(Math.max(dx, -90));
  };

  const handleTouchEnd = () => {
    if (offset < -60) {
      onRemove();
    }
    setOffset(0);
    setStartX(null);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* delete bg revealed on swipe */}
      <div className="absolute inset-y-0 right-0 w-24 bg-red-600/90 flex items-center justify-center rounded-r-2xl">
        <Trash2 className="w-5 h-5 text-white" />
      </div>

      {/* card — opaque bg so swipe-red never bleeds through */}
      <div
        className="relative bg-[#161616] rounded-2xl p-3 flex gap-3 transition-transform"
        style={{
          transform: `translateX(${offset}px)`,
          transition: startX !== null ? "none" : "transform 0.25s ease-out",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* thumbnail */}
        {!imgError ? (
          <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-white/[0.04] shrink-0 self-center">
            <Image
              src={imgSrc}
              alt={item.name}
              fill
              className="object-cover"
              sizes="56px"
              onError={() => {
                // try .jpg fallback
                if (imgSrc.endsWith(".webp")) {
                  setImgSrc(imgSrc.replace(".webp", ".jpg"));
                } else {
                  setImgError(true);
                }
              }}
            />
          </div>
        ) : (
          <div className="w-14 h-14 rounded-xl bg-white/[0.04] shrink-0 self-center flex items-center justify-center">
            <span className="text-2xl opacity-30">🍣</span>
          </div>
        )}

        {/* info + stepper row */}
        <div className="flex-1 min-w-0 flex flex-col justify-between gap-1.5 py-0.5">
          {/* top: name + addons */}
          <div>
            <h4 className="text-[13px] font-medium text-white leading-tight line-clamp-2">
              {item.name}
            </h4>
            {item.addons && item.addons.length > 0 && (
              <p className="text-[11px] text-white/40 mt-0.5 truncate">
                + {item.addons.join(", ")}
              </p>
            )}
          </div>

          {/* bottom: price + stepper on same row */}
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold text-white">
              {itemTotal.toFixed(2)}{" "}
              <span className="text-[11px] font-normal text-white/50">zł</span>
            </p>

            {/* quantity stepper */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onDecrease}
                className="w-7 h-7 rounded-lg bg-white/[0.08] flex items-center justify-center active:bg-white/[0.15] transition-colors"
                aria-label="Zmniejsz ilość"
              >
                <Minus className="w-3.5 h-3.5 text-white/70" />
              </button>

              <span className="w-5 text-center text-[13px] font-semibold text-white tabular-nums">
                {item.quantity || 1}
              </span>

              <button
                type="button"
                onClick={onIncrease}
                className="w-7 h-7 rounded-lg bg-white/[0.08] flex items-center justify-center active:bg-white/[0.15] transition-colors"
                aria-label="Zwiększ ilość"
              >
                <Plus className="w-3.5 h-3.5 text-white/70" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
