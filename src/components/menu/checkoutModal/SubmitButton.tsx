"use client";

import React from "react";
import { accentBtn } from "./shared";

interface SubmitButtonProps {
  onClick: () => void;
  disabled: boolean;
  submitting: boolean;
  className?: string;
}

export function SubmitButton({
  onClick,
  disabled,
  submitting,
  className = "",
}: SubmitButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`py-2 rounded-xl font-semibold ${accentBtn} disabled:opacity-50 ${className}`}
    >
      {submitting ? (
        <span className="flex items-center justify-center gap-2">
          <span className="h-4 w-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
          Przetwarzanie...
        </span>
      ) : (
        "✅ Zamawiam"
      )}
    </button>
  );
}
