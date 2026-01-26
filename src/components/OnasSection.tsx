// src/components/OnasSection.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import ReservationModal from "@/components/ReservationModal";

const GUTTER = "170px";
const ACCENT =
  "[background:linear-gradient(180deg,#b31217_0%,#7a0b0b_100%)] shadow-[0_10px_22px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)] ring-1 ring-black/30";

export default function OnasSection() {
  const [isResOpen, setResOpen] = useState(false);

  return (
    <>
      <section
        id="onas"
        className="relative w-full text-white"
        style={{ backgroundColor: "#0b0b0b", ["--gutter" as any]: GUTTER } as React.CSSProperties}
        aria-labelledby="onas-h1"
      >
        {/* boczne pasy */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-0"
          style={{ width: 50, background: "#0b0b0b" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-0"
          style={{ width: 50, background: "#0b0b0b" }}
        />

        {/* --- MOBILE --- */}
        <div className="md:hidden relative z-10 px-6 py-10">
          {/* WYŚRODKOWANE NA MOBILE */}
          <div className="mx-auto w-full max-w-md text-center">
            <p className="text-[11px] uppercase tracking-[0.28em] text-white/60">o nas</p>

            <h1
              id="onas-h1"
              className="mt-3 font-thin tracking-tight leading-[1.15] text-3xl break-words"
              style={{ textWrap: "balance" as any }}
            >
              Robimy sushi jak lubisz — świeżo, szybko, z sercem
            </h1>

            <div className="mt-4 space-y-2 text-white/70 text-sm">
              <p>Ryby i składniki od sprawdzonych dostawców. Rolki zwijane na zamówienie.</p>
              <p>Dostawa w mieście i odbiór osobisty. Rezerwacje on-line.</p>
            </div>

            <p className="mt-5 text-sm text-white/80 leading-relaxed break-words">
              Nasze futomaki, hosomaki, california i nigiri składają się z prostych, jakościowych składników.
              Wpadnij do lokalu albo zamów do domu — zadbamy o detale od kuchni po dostawę.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setResOpen(true)}
                className={`inline-flex w-full items-center justify-center rounded-full px-6 py-3 font-semibold ${ACCENT}`}
                aria-haspopup="dialog"
                aria-expanded={isResOpen}
                aria-controls="reservation-modal"
              >
                Zarezerwuj stolik
              </button>
              <Link
                href="#menu"
                className="inline-flex w-full items-center justify-center rounded-full px-6 py-3 font-semibold border border-white/20 hover:bg-white/10 transition"
              >
                Zobacz menu
              </Link>
            </div>

            <div className="mt-8 relative aspect-[4/3] w-full">
              <Image
                src="/assets/onas.png"
                alt="SUSHI Tutaj — nasze sushi i wnętrze lokalu"
                fill
                sizes="100vw"
                className="object-cover"
                priority
              />
            </div>
          </div>
        </div>

        {/* --- DESKTOP (bez zmian) --- */}
        <div
          className="hidden md:block relative z-10 mx-auto w-full max-w-7xl py-14 md:py-20"
          style={{ paddingLeft: "var(--gutter)", paddingRight: "var(--gutter)" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-12 items-center">
            <div className="md:col-span-7 lg:col-span-7">
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/60">o nas</p>

              <h1
                className="mt-3 font-thin tracking-tight leading-[1.05] text-4xl md:text-4xl xl:text-4xl"
                style={{ textWrap: "balance" as any }}
              >
                Robimy sushi jak lubisz — świeżo, szybko, z sercem
              </h1>

              <div className="mt-4 space-y-2 md:text-base text-white/70 text-1xl">
                <p>Ryby i składniki od sprawdzonych dostawców. Rolki zwijane na zamówienie.</p>
                <p>Dostawa w mieście i odbiór osobisty. Rezerwacje on-line.</p>
              </div>

              <p className="mt-6 text-sm md:text-base text-white/80 leading-relaxed max-w-[70ch]">
                Nasze futomaki, hosomaki, california i nigiri składają się z prostych, jakościowych składników.
                Wpadnij do lokalu albo zamów do domu — zadbamy o detale od kuchni po dostawę.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setResOpen(true)}
                  className={`inline-flex items-center justify-center rounded-full px-6 py-3 font-semibold ${ACCENT}`}
                  aria-haspopup="dialog"
                  aria-expanded={isResOpen}
                  aria-controls="reservation-modal"
                >
                  Zarezerwuj stolik
                </button>
                <Link
                  href="#menu"
                  className="inline-flex items-center justify-center rounded-full px-6 py-3 font-semibold border border-white/20 hover:bg-white/10 transition"
                >
                  Zobacz menu
                </Link>
              </div>
            </div>

            <div className="md:col-span-5 lg:col-span-5 relative">
              <div className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full border border-[red]" />
              <div className="pointer-events-none absolute -left-14 top-10 h-40 w-40 rounded-full border border-white/10" />
              <div className="relative aspect-[16/11] w-full max-h-[800px]">
                <Image
                  src="/assets/onas.png"
                  alt="SUSHI Tutaj — nasze sushi i wnętrze lokalu"
                  fill
                  sizes="(min-width:1024px) 40vw, 100vw"
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {isResOpen && (
        <div className="text-black">
          <ReservationModal
            isOpen={isResOpen}
            onClose={() => setResOpen(false)}
            id="reservation-modal"
          />
        </div>
      )}
    </>
  );
}
