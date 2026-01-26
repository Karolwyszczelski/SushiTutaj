"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

export default function RotatingPlate() {
  const [spin, setSpin] = useState(false);

  useEffect(() => {
    const tick = () => {
      setSpin(true);
      const to = setTimeout(() => setSpin(false), 1850);
      return () => clearTimeout(to);
    };
    // pierwszy obrót po krótkiej chwili, potem co 12s
    let clear: (() => void) | undefined = tick();
    const id = setInterval(() => { clear?.(); clear = tick(); }, 12000);
    return () => { clear?.(); clearInterval(id); };
  }, []);

  return (
    <div className="pointer-events-none select-none relative mx-auto mt-10 sm:mt-16 w-[260px] sm:w-[420px] aspect-square">
      <Image
        src="/assets/plate.png"
        alt="Zestaw sushi"
        fill
        priority
        className={clsx("object-contain drop-shadow-2xl will-change-transform", spin && "plate-spin")}
      />
    </div>
  );
}
