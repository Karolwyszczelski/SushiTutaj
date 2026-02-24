// src/components/mobile/MobileBottomSheet.tsx
"use client";

import { useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

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
  const phaseRef = useRef<"closed" | "opening" | "open" | "closing">("closed");
  const rafRef = useRef<number>(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // ── Animate open / close via direct DOM (zero React re-renders) ──
  useEffect(() => {
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !backdrop) return;

    if (isOpen) {
      phaseRef.current = "opening";
      document.body.style.overflow = "hidden";

      // Start off-screen, then slide in on next frame
      sheet.style.transform = "translate3d(0,100%,0)";
      sheet.style.willChange = "transform";
      backdrop.style.opacity = "0";

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!sheetRef.current) return;
          sheet.style.transition = "transform 0.32s cubic-bezier(0.32,0.72,0,1)";
          sheet.style.transform = "translate3d(0,0,0)";
          backdrop.style.transition = "opacity 0.2s ease-out";
          backdrop.style.opacity = "1";
          phaseRef.current = "open";
        });
      });
    } else if (phaseRef.current === "open" || phaseRef.current === "opening") {
      // Animate out
      phaseRef.current = "closing";
      sheet.style.transition = "transform 0.26s cubic-bezier(0.32,0.72,0,1)";
      sheet.style.transform = "translate3d(0,100%,0)";
      backdrop.style.transition = "opacity 0.18s ease-in";
      backdrop.style.opacity = "0";

      const timer = setTimeout(() => {
        phaseRef.current = "closed";
        document.body.style.overflow = "";
        sheet.style.willChange = "";
      }, 280);
      return () => clearTimeout(timer);
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // ── Drag-to-dismiss — pure DOM, no setState ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-sheet-handle]") || target.closest("[data-sheet-header]")) {
      const sheet = sheetRef.current;
      if (sheet) {
        sheet.style.transition = "none"; // disable transition during drag
      }
      dragRef.current = { startY: e.touches[0].clientY, currentY: 0, isDragging: true };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current.isDragging) return;
    const deltaY = e.touches[0].clientY - dragRef.current.startY;
    if (deltaY <= 0) return; // only downward

    dragRef.current.currentY = deltaY;

    // Direct DOM — zero re-renders
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
      // Close
      sheet.style.transition = "transform 0.26s cubic-bezier(0.32,0.72,0,1)";
      sheet.style.transform = "translate3d(0,100%,0)";
      backdrop.style.transition = "opacity 0.18s ease-in";
      backdrop.style.opacity = "0";
      setTimeout(() => onCloseRef.current(), 260);
    } else {
      // Snap back
      sheet.style.transition = "transform 0.26s cubic-bezier(0.32,0.72,0,1)";
      sheet.style.transform = "translate3d(0,0,0)";
      backdrop.style.transition = "opacity 0.15s ease-out";
      backdrop.style.opacity = "1";
    }
    dragRef.current.currentY = 0;
  }, []);

  const animateClose = useCallback(() => {
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (sheet) {
      sheet.style.transition = "transform 0.26s cubic-bezier(0.32,0.72,0,1)";
      sheet.style.transform = "translate3d(0,100%,0)";
    }
    if (backdrop) {
      backdrop.style.transition = "opacity 0.18s ease-in";
      backdrop.style.opacity = "0";
    }
    setTimeout(() => onCloseRef.current(), 260);
  }, []);

  if (!isOpen && phaseRef.current === "closed") return null;

  const heightStyle =
    height === "full"
      ? "calc(100dvh - env(safe-area-inset-top, 0px) - 32px)"
      : height === "half"
      ? "50vh"
      : height === "auto"
      ? "auto"
      : `${height}vh`;

  return (
    <div className="md:hidden fixed inset-0 z-[80]">
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/70"
        style={{ opacity: 0 }}
        onClick={animateClose}
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
          <div data-sheet-handle className="flex justify-center pt-3 pb-1 cursor-grab">
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
                onClick={animateClose}
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
