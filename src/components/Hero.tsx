// src/components/Hero.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Montserrat } from "next/font/google";
import { useEffect, useRef } from "react";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["100", "400", "600", "700", "800"] });

/** Teksty per miasto */
const SLOGANS: Record<string, { kicker?: string; title: string; subtitle?: string }> = {
  default: { kicker: "SUSHI TUTAJ", title: "CODZIENNIE ŚWIEŻE SUSHI", subtitle: "Płatność gotówką. Wybierz miasto i przejdź do menu." },
  ciechanow: { kicker: "SUSHI CIECHANÓW", title: "ŚWIEŻE SUSHI W CIECHANOWIE — SMAK JAPONII W CENTRUM MIASTA", subtitle: "Zestawy Maki, Nigiri, Sashimi i wiele więcej – sprawdź menu." },
  przasnysz: { kicker: "SUSHI PRZASNYSZ", title: "NAJLEPSZE SUSHI W PRZASNYSZU — ŚWIEŻO, LOKALNIE, Z PASJĄ", subtitle: "Odkryj zestawy sushi przygotowane na miejscu. Dostawa i odbiór w Przasnyszu." },
  szczytno: { kicker: "SUSHI SZCZYTNO", title: "SUSHI W SZCZYTNIE — AUTENTYCZNY SMAK JAPONII NAD JEZIOREM", subtitle: "Zrób sobie przerwę na sushi. Dostawa i odbiór w sercu Szczytna." },
};

/** Desktop dekoracje */
const STRIPES = { width: "50px", color: "#0b0b0b)" };
const GUTTER = "100px";
const ORB = {
  size: "320px",
  x: "225px",
  y: "70px",
  stroke: "30px",
  color: "#ffffff",
  innerSize: "calc(var(--orb-size) - 2 * var(--orb-stroke) - 50px)",
  innerColor: "#810404",
};
const IMG = { scale: 1.15, x: "0px", y: "-20px" };
const DECOR_BL = { src: "/assets/hero-decor.png", w: "400px", h: "400px", x: "-100px", y: "-100px", z: 999, opacity: "1" };
const DECOR_TR = { src: "/assets/hero-decor-top.png", w: "400px", h: "400px", x: "-100px", y: "-140px", z: 2, opacity: "1" };
const LEFT_PNG = { src: "/assets/hero-left.png", w: "200px", h: "200px", x: "440px", y: "-20px", z: 4, opacity: "1", scale: 1, rot: "0deg" };

/** Mobile: centralny obrazek z możliwością przesunięcia */
const MOBILE = {
  src: "/assets/hero-mobile.png",
  w: "400px",
  h: "400px",
  x: "0px",   // zmień, aby przesuwać w osi X
  y: "-10px",   // zmień, aby przesuwać w osi Y
  scale: 1,   // skalowanie
};

export default function Hero() {
  const params = useParams<{ city?: string }>();
  const city = (params?.city || "default").toLowerCase();
  const copy = SLOGANS[city] ?? SLOGANS.default;

  // rotacja ringów na desktopie
  const heroRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    let ticking = false;
    const update = () => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const total = rect.height + vh;
      const progress = Math.min(Math.max((vh - rect.top) / total, 0), 1);
      const ringDeg = progress * 240;
      const innerDeg = -progress * 240;
      el.style.setProperty("--ring-rot", `${ringDeg}deg`);
      el.style.setProperty("--inner-rot", `${innerDeg}deg`);
      ticking = false;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section
      ref={heroRef}
      id="hero"
      className={`${montserrat.className} relative z-10 overflow-visible text-white`}
      style={
        {
          backgroundColor: "#0b0b0b",
          ["--stripe-w" as any]: STRIPES.width,
          ["--stripe-col" as any]: STRIPES.color,
          ["--gutter" as any]: GUTTER,
          ["--orb-size" as any]: ORB.size,
          ["--orb-x" as any]: ORB.x,
          ["--orb-y" as any]: ORB.y,
          ["--orb-col" as any]: ORB.color,
          ["--orb-stroke" as any]: ORB.stroke,
          ["--orb-inner" as any]: ORB.innerSize,
          ["--orb-inner-col" as any]: ORB.innerColor,
          ["--img-scale" as any]: IMG.scale,
          ["--img-x" as any]: IMG.x,
          ["--img-y" as any]: IMG.y,
          // dekor BL
          ["--decor-w" as any]: DECOR_BL.w,
          ["--decor-h" as any]: DECOR_BL.h,
          ["--decor-x" as any]: DECOR_BL.x,
          ["--decor-y" as any]: DECOR_BL.y,
          ["--decor-z" as any]: DECOR_BL.z,
          ["--decor-opacity" as any]: DECOR_BL.opacity,
          // dekor TR
          ["--decor-tr-w" as any]: DECOR_TR.w,
          ["--decor-tr-h" as any]: DECOR_TR.h,
          ["--decor-tr-x" as any]: DECOR_TR.x,
          ["--decor-tr-y" as any]: DECOR_TR.y,
          ["--decor-tr-z" as any]: DECOR_TR.z,
          ["--decor-tr-opacity" as any]: DECOR_TR.opacity,
          // LEFT PNG
          ["--leftpng-w" as any]: LEFT_PNG.w,
          ["--leftpng-h" as any]: LEFT_PNG.h,
          ["--leftpng-x" as any]: LEFT_PNG.x,
          ["--leftpng-y" as any]: LEFT_PNG.y,
          ["--leftpng-z" as any]: LEFT_PNG.z as unknown as number,
          ["--leftpng-opacity" as any]: LEFT_PNG.opacity as unknown as number,
          ["--leftpng-scale" as any]: LEFT_PNG.scale,
          ["--leftpng-rot" as any]: LEFT_PNG.rot,
          // MOBILE image controls
          ["--m-img-w" as any]: MOBILE.w,
          ["--m-img-h" as any]: MOBILE.h,
          ["--m-img-x" as any]: MOBILE.x,
          ["--m-img-y" as any]: MOBILE.y,
          ["--m-img-scale" as any]: MOBILE.scale,
        } as React.CSSProperties
      }
    >
      {/* --- MOBILE --- */}
      <div className="md:hidden relative min-h-[90svh]">
        {/* centralny obrazek (absolutny, sterowany zmiennymi) */}
        <div
          aria-hidden
          className="absolute"
          style={{
            width: "var(--m-img-w)",
            height: "var(--m-img-h)",
            left: "50%",
            top: "50%",
            transform:
              "translate(-50%, -50%) translate(var(--m-img-x), var(--m-img-y)) scale(var(--m-img-scale))",
            transformOrigin: "center",
            zIndex: 5,
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

        {/* górny blok: logo + tytuł Thin */}
        <div className="absolute inset-x-0 top-20 z-10 flex flex-col items-center px-6 text-center mt-10">
          <Image src="/assets/logo.png" alt="Logo" width={84} height={84} priority />
          <h1 className="mt-10 text-2xl leading-tight font-normal">{copy.title}</h1>
        </div>

        {/* dolny blok: przyciski */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 px-6 mb-[100px]">
          <Link
            href={city !== "default" ? `/${city}#menu` : "/#menu"}
            className="btn-primary w-full max-w-sm text-center"
          >
            Zobacz menu
          </Link>
          <Link
            href="/"
            className="btn-ghost w-full max-w-sm text-center"
          >
            {city !== "default" ? "Zmień miasto" : "Wybierz miasto"}
          </Link>
        </div>
      </div>

      {/* --- DESKTOP --- */}
      {/* paski */}
      <div aria-hidden className="hidden md:block pointer-events-none absolute inset-y-0 left-0 z-0"  style={{ width: "var(--stripe-w)", background: "var(--stripe-col)" }} />
      <div aria-hidden className="hidden md:block pointer-events-none absolute inset-y-0 right-0 z-0" style={{ width: "var(--stripe-w)", background: "var(--stripe-col)" }} />

      {/* dekor: lewy dół */}
      <div
        aria-hidden
        className="hidden md:block pointer-events-none absolute"
        style={{
          left: "calc(var(--stripe-w) + var(--decor-x))",
          bottom: "var(--decor-y)",
          width: "var(--decor-w)",
          height: "var(--decor-h)",
          zIndex: "var(--decor-z)" as unknown as number,
          opacity: "var(--decor-opacity)" as unknown as number,
        }}
      >
        <Image src={DECOR_BL.src} alt="" fill sizes="400px" className="object-contain select-none pointer-events-none" priority />
      </div>

      {/* dekor: prawy góra */}
      <div
        aria-hidden
        className="hidden md:block pointer-events-none absolute"
        style={{
          right: "calc(var(--stripe-w) + var(--decor-tr-x))",
          top: "var(--decor-tr-y)",
          width: "var(--decor-tr-w)",
          height: "var(--decor-tr-h)",
          zIndex: "var(--decor-tr-z)" as unknown as number,
          opacity: "var(--decor-tr-opacity)" as unknown as number,
        }}
      >
        <Image src={DECOR_TR.src} alt="" fill sizes="260px" className="object-contain select-none pointer-events-none" priority />
      </div>

      {/* kontener desktop */}
      <div className="hidden md:block mx-auto w-full max-w-7xl" style={{ paddingLeft: "var(--gutter)", paddingRight: "var(--gutter)" }}>
        <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-8 md:gap-12 py-10 md:py-16">
          {/* lewa: ring + obraz */}
          <div className="relative h-[280px] sm:h-[380px] md:h-[520px]" style={{ marginLeft: "calc(var(--gutter) * -1)" }}>
            {/* LEFT PNG */}
            <div
              aria-hidden
              className="absolute"
              style={{
                left: "var(--leftpng-x)",
                top: "var(--leftpng-y)",
                width: "var(--leftpng-w)",
                height: "var(--leftpng-h)",
                zIndex: "var(--leftpng-z)" as unknown as number,
                opacity: "var(--leftpng-opacity)" as unknown as number,
                transform: "scale(var(--leftpng-scale)) rotate(var(--leftpng-rot))",
                transformOrigin: "top left",
              }}
            >
              <Image src={LEFT_PNG.src} alt="" fill sizes="280px" className="object-contain select-none pointer-events-none" priority />
            </div>

            {/* środek */}
            <div
              aria-hidden
              className="absolute rounded-full will-change-transform z-0"
              style={{
                width: "var(--orb-inner)",
                height: "var(--orb-inner)",
                left: "calc(var(--orb-x) + (var(--orb-size) - var(--orb-inner)) / 2)",
                top: "calc(var(--orb-y) + (var(--orb-size) - var(--orb-inner)) / 2)",
                background: "var(--orb-inner-col)",
                opacity: 0.2,
                transform: "rotate(var(--inner-rot, 0deg))",
                transformOrigin: "50% 50%",
              }}
            />
            {/* ring */}
            <div
              aria-hidden
              className="absolute rounded-full will-change-transform z-[1]"
              style={{
                width: "var(--orb-size)",
                height: "var(--orb-size)",
                left: "var(--orb-x)",
                top: "var(--orb-y)",
                boxShadow: `inset 0 0 0 var(--orb-stroke) var(--orb-col)`,
                opacity: 0.2,
                transform: "rotate(var(--ring-rot, 0deg))",
                transformOrigin: "50% 50%",
              }}
            />
            {/* obraz */}
            <div className="absolute inset-0 origin-left z-[2] pointer-events-none" style={{ transform: "translate(var(--img-x), var(--img-y)) scale(var(--img-scale))" }}>
              <Image src="/assets/hero-hand.png" alt="Zestaw sushi" fill priority sizes="50vw" className="object-left object-contain select-none" />
            </div>
          </div>

          {/* prawa: copy */}
          <div className="relative z-50 text-left md:pl-5 md:-translate-y-2 lg:-translate-y-10">
            {copy.kicker && <p className="tracking-widest text-white/70">{copy.kicker}</p>}
            <h1 className="tracking-tight text-4xl sm:text-5xl lg:text-3xl leading-[1.1] mt-2">{copy.title}</h1>
            {copy.subtitle && <p className="mt-3 text-white/75 max-w-xl">{copy.subtitle}</p>}
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={city !== "default" ? `/${city}#menu` : "/#menu"} className="btn-primary">Zobacz menu</Link>
              <Link href="/" className="btn-ghost">{city !== "default" ? "Zmień miasto" : "Wybierz miasto"}</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
