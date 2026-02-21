// src/components/mobile/MobileHeroView.tsx
"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useMobileNavStore } from "@/store/mobileNavStore";

interface MobileHeroViewProps {
  onGoToMenu: () => void;
}

/** Teksty per miasto */
const SLOGANS: Record<string, { kicker?: string; title: string; subtitle?: string }> = {
  default: { kicker: "SUSHI TUTAJ", title: "CODZIENNIE ŚWIEŻE SUSHI", subtitle: "Płatność gotówką. Wybierz miasto i przejdź do menu." },
  ciechanow: { kicker: "SUSHI CIECHANÓW", title: "ŚWIEŻE SUSHI W CIECHANOWIE — SMAK JAPONII W CENTRUM MIASTA", subtitle: "Zestawy Maki, Nigiri, Sashimi i wiele więcej – sprawdź menu." },
  przasnysz: { kicker: "SUSHI PRZASNYSZ", title: "NAJLEPSZE SUSHI W PRZASNYSZU — ŚWIEŻO, LOKALNIE, Z PASJĄ", subtitle: "Odkryj zestawy sushi przygotowane na miejscu. Dostawa i odbiór w Przasnyszu." },
  szczytno: { kicker: "SUSHI SZCZYTNO", title: "SUSHI W SZCZYTNIE — AUTENTYCZNY SMAK JAPONII NAD JEZIOREM", subtitle: "Zrób sobie przerwę na sushi. Dostawa i odbiór w sercu Szczytna." },
};

/** Mobile: centralny obrazek z możliwością przesunięcia */
const MOBILE = {
  src: "/assets/hero-mobile.png",
  w: "400px",
  h: "400px",
  x: "0px",
  y: "-10px",
  scale: 1,
};

export default function MobileHeroView({ onGoToMenu }: MobileHeroViewProps) {
  const params = useParams<{ city?: string }>();
  const city = (params?.city || "default").toLowerCase();
  const copy = SLOGANS[city] ?? SLOGANS.default;
  const setActiveTab = useMobileNavStore((s) => s.setActiveTab);

  const goToSet = () => {
    setActiveTab("set");
  };

  return (
    <div 
      className="relative flex flex-col min-h-full bg-[#0b0b0b]"
      style={{
        ["--m-img-w" as string]: MOBILE.w,
        ["--m-img-h" as string]: MOBILE.h,
        ["--m-img-x" as string]: MOBILE.x,
        ["--m-img-y" as string]: MOBILE.y,
        ["--m-img-scale" as string]: MOBILE.scale,
      } as React.CSSProperties}
    >
      {/* Centralny obrazek */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[5]"
        style={{
          width: "var(--m-img-w)",
          height: "var(--m-img-h)",
          transform: `translate(-50%, -50%) translate(var(--m-img-x), var(--m-img-y)) scale(var(--m-img-scale))`,
        }}
      >
        <Image
          src={MOBILE.src}
          alt=""
          fill
          sizes="140vw"
          className="object-contain select-none pointer-events-none"
          priority
        />
      </div>

      {/* Górny blok: logo + tytuł */}
      <div 
        className="relative z-10 flex flex-col items-center px-6 text-center"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        <Image src="/assets/logo.png" alt="Logo" width={84} height={84} priority />
        <h1 className="mt-6 text-xl leading-tight font-normal text-white max-w-[280px]">
          {copy.title}
        </h1>
        {copy.subtitle && (
          <p className="mt-3 text-sm text-white/60 max-w-[260px]">
            {copy.subtitle}
          </p>
        )}
      </div>

      {/* Dolny blok: przyciski - pozycjonowane nad bottom nav */}
      <div 
        className="relative z-10 mt-auto flex flex-col items-center gap-3 px-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 90px)" }}
      >
        <button
          type="button"
          onClick={onGoToMenu}
          className="btn-primary w-full max-w-sm flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          Zobacz menu
        </button>
        <button
          type="button"
          onClick={goToSet}
          className="btn-ghost w-full max-w-sm flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          Zestaw miesiąca
        </button>
        <a
          href="/"
          className="btn-ghost w-full max-w-sm flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {city !== "default" ? "Zmień miasto" : "Wybierz miasto"}
        </a>
      </div>
    </div>
  );
}
