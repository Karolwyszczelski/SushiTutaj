"use client";

import React from "react";
import QRCode from "react-qr-code";
import { accentBtn } from "./shared";

interface ThankYouScreenProps {
  googleReviewUrl: string;
  onClose: () => void;
}

export function ThankYouScreen({ googleReviewUrl, onClose }: ThankYouScreenProps) {
  return (
    <div className="min-h-[320px] flex flex-col items-center justify-center text-center space-y-5 px-4">
      <div className="bg-white/10 lg:bg-white p-4 rounded-2xl shadow flex flex-col items-center gap-2">
        <div className="bg-white p-3 rounded-xl">
          <QRCode value={googleReviewUrl} size={170} />
        </div>
        <p className="text-xs text-white/60 lg:text-black/60 max-w-xs">
          Zeskanuj kod lub kliknij poniższy przycisk, aby ocenić lokal w Google.
        </p>
      </div>

      <h3 className="text-2xl font-bold">Dziękujemy za zamówienie!</h3>
      <p className="text-white/70 lg:text-black/70">
        Potwierdzenie i link do śledzenia wysłaliśmy na Twój adres e-mail.
      </p>

      <div className="flex justify-center gap-3 flex-wrap">
        <a
          href={googleReviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center justify-center px-4 py-2 rounded-xl ${accentBtn}`}
        >
          Zostaw opinię w Google
        </a>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl border border-white/20 lg:border-black/15 text-white lg:text-black"
        >
          Zamknij
        </button>
      </div>
    </div>
  );
}
