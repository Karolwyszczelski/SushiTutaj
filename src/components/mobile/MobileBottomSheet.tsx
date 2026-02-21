// src/components/mobile/MobileBottomSheet.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Wysokość: "full" = 95vh, "half" = 50vh, "auto" = dopasowanie do treści, number = konkretna wysokość w vh */
  height?: "full" | "half" | "auto" | number;
  /** Czy pokazać uchwyt do przeciągania */
  showHandle?: boolean;
  /** Czy pokazać przycisk X */
  showClose?: boolean;
  /** Czy pokazać nagłówek */
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
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [translateY, setTranslateY] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Animacja wejścia
  useEffect(() => {
    if (isOpen) {
      // Małe opóźnienie żeby animacja zadziałała
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // Zablokuj scroll body gdy sheet jest otwarty
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Reset state przy otwieraniu
  useEffect(() => {
    if (isOpen) {
      setTranslateY(0);
      setIsClosing(false);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    // Tylko na uchwycie lub headerze
    if (target.closest("[data-sheet-handle]") || target.closest("[data-sheet-header]")) {
      setTouchStartY(e.touches[0].clientY);
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY === null) return;
      const deltaY = e.touches[0].clientY - touchStartY;
      // Tylko w dół
      if (deltaY > 0) {
        setTranslateY(deltaY);
      }
    },
    [touchStartY]
  );

  const handleTouchEnd = useCallback(() => {
    if (translateY > 100) {
      // Zamknij jeśli przeciągnięto > 100px
      setIsClosing(true);
      setTimeout(onClose, 300);
    } else {
      setTranslateY(0);
    }
    setTouchStartY(null);
  }, [translateY, onClose]);

  const handleBackdropClick = useCallback(() => {
    setIsClosing(true);
    setTimeout(onClose, 300);
  }, [onClose]);

  const handleCloseClick = useCallback(() => {
    setIsClosing(true);
    setTimeout(onClose, 300);
  }, [onClose]);

  if (!isOpen) return null;

  const heightStyle =
    height === "full"
      ? "calc(100dvh - env(safe-area-inset-top, 0px) - 20px)"
      : height === "half"
      ? "50vh"
      : height === "auto"
      ? "auto"
      : `${height}vh`;

  return (
    <div className="md:hidden fixed inset-0 z-[60]">
      {/* Backdrop */}
      <div
        className={clsx(
          "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-out",
          isVisible && !isClosing ? "opacity-100" : "opacity-0"
        )}
        onClick={handleBackdropClick}
        aria-hidden
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={clsx(
          "absolute inset-x-0 bottom-0 bg-[#0b0b0b] rounded-t-3xl shadow-2xl flex flex-col",
          "transform-gpu",
          touchStartY === null && "transition-transform duration-300 ease-out"
        )}
        style={{
          maxHeight: heightStyle,
          transform: isVisible && !isClosing 
            ? `translateY(${translateY}px)` 
            : "translateY(100%)",
          willChange: touchStartY !== null ? "transform" : "auto",
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
                onClick={handleCloseClick}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                aria-label="Zamknij"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div 
          className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
