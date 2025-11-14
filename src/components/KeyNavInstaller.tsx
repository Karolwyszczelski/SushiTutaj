// src/components/KeyNavInstaller.tsx
"use client";

import { useEffect } from "react";

const navKeys = new Set(["PageDown", "PageUp", "ArrowDown", "ArrowUp"]);

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return !!target.closest('input, textarea, select, [contenteditable="true"]');
}

export default function KeyNavInstaller() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;          // nie przeszkadzaj w polach edycji
      if (!navKeys.has(e.key)) return;           // reaguj tylko na klawisze nawigacji
      e.preventDefault();                        // blokuj scroll tylko dla tych klawiszy
      // Jeżeli masz swoją nawigację paneli, nasłuchuj na ten event:
      window.dispatchEvent(
        new CustomEvent<"up" | "down">("app:navigate", {
          detail: e.key === "PageUp" || e.key === "ArrowUp" ? "up" : "down",
        })
      );
    };
    window.addEventListener("keydown", handler, { passive: false }); // bez capture
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return null;
}
