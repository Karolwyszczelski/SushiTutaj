// src/components/mobile/MobileBottomSheet.tsx
"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { X } from "lucide-react";

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  height?: "full" | "half" | "auto" | number;
  showHandle?: boolean;
  showClose?: boolean;
  showHeader?: boolean;
}

export default function MobileBottomSheet({
  isOpen,
  onClose,
  title,
  children,
  height = "full",
  showHandle = true,
  showClose = true,
  showHeader = true,
}: MobileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startY: 0, currentY: 0, isDragging: false });
  const rafRef = useRef<number>(0);

  // ── DOM presence: mount when opening, unmount after close animation ──
  const [mounted, setMounted] = useState(false);

  // Mount immediately when isOpen becomes true
  useEffect(() => {
    if (isOpen) setMounted(true);
  }, [isOpen]);

  // ── Animate in/out via direct DOM (one single effect) ──
  useEffect(() => {
    if (!mounted) return;
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !backdrop) return;

    if (isOpen) {
      // Lock body scroll
      document.body.style.overflow = "hidden";

      // Force start position (no transition), then animate in
      sheet.style.transition = "none";
      sheet.style.transform = "translate3d(0,100%,0)";
      backdrop.style.transition = "none";
      backdrop.style.opacity = "0";

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!sheetRef.current) return;
          sheet.style.transition =
            "transform 0.32s cubic-bezier(0.32,0.72,0,1)";
          sheet.style.transform = "translate3d(0,0,0)";
          backdrop.style.transition = "opacity 0.2s ease-out";
          backdrop.style.opacity = "1";
        });
      });
    } else {
      // Animate out
      sheet.style.transition =
        "transform 0.28s cubic-bezier(0.32,0.72,0,1)";
      sheet.style.transform = "translate3d(0,100%,0)";
      backdrop.style.transition = "opacity 0.18s ease-in";
      backdrop.style.opacity = "0";

      // Unmount after animation completes
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, mounted]);

  // ── Drag-to-dismiss — pure DOM, zero re-renders ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest("[data-sheet-handle]") ||
      target.closest("[data-sheet-header]")
    ) {
      const sheet = sheetRef.current;
      if (sheet) sheet.style.transition = "none";
      dragRef.current = {
        startY: e.touches[0].clientY,
        currentY: 0,
        isDragging: true,
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current.isDragging) return;
    const deltaY = e.touches[0].clientY - dragRef.current.startY;
    if (deltaY <= 0) return;
    dragRef.current.currentY = deltaY;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const sheet = sheetRef.current;
      const backdrop = backdropRef.current;
      if (!sheet || !backdrop) return;
      sheet.style.transform = `translate3d(0,${deltaY}px,0)`;
      backdrop.style.opacity = String(Math.max(0, 1 - deltaY / 400));
    });
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!dragRef.current.isDragging) return;
    dragRef.current.isDragging = false;
    cancelAnimationFrame(rafRef.current);

    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !backdrop) return;

    if (dragRef.current.currentY > 100) {
      // Dismiss: call onClose directly — let the useEffect handle animation
      onClose();
    } else {
      // Snap back
      sheet.style.transition =
        "transform 0.28s cubic-bezier(0.32,0.72,0,1)";
      sheet.style.transform = "translate3d(0,0,0)";
      backdrop.style.transition = "opacity 0.15s ease-out";
      backdrop.style.opacity = "1";
    }
    dragRef.current.currentY = 0;
  }, [onClose]);

  // ── Don't render anything when fully closed ──
  if (!mounted) return null;

  const heightStyle =
    height === "full"
      ? "calc(100dvh - env(safe-area-inset-top, 0px) - 32px)"
      : height === "half"
      ? "50vh"
      : height === "auto"
      ? "auto"
      : `${height}vh`;

  return (
    // KEY FIX: pointer-events-none when !isOpen prevents the invisible
    // overlay from blocking clicks during the close animation
    <div
      className="md:hidden fixed inset-0 z-[80]"
      style={{ pointerEvents: isOpen ? "auto" : "none" }}
    >
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/70"
        style={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 bg-[#0b0b0b] rounded-t-3xl shadow-2xl flex flex-col transform-gpu"
        style={{
          maxHeight: heightStyle,
          transform: "translate3d(0,100%,0)",
          contain: "layout style paint",
          pointerEvents: "auto",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Handle */}
        {showHandle && (
          <div
            data-sheet-handle
            className="flex justify-center pt-3 pb-1 cursor-grab"
          >
            <div className="w-10 h-1 bg-white/30 rounded-full" />
          </div>
        )}

        {/* Header */}
        {showHeader && (title || showClose) && (
          <div
            data-sheet-header
            className="flex items-center justify-between px-4 py-3 border-b border-white/10"
          >
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20"
                aria-label="Zamknij"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}
