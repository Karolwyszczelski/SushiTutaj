"use client";

import React, { useEffect, useRef } from "react";

type Snowflake = {
  x: number;
  y: number;
  r: number;
  speedY: number;
  speedX: number;
  opacity: number;
};

interface SeasonalSnowProps {
  /** Możesz w razie czego sterować z zewnątrz, domyślnie włączone */
  enabled?: boolean;
}

export default function SeasonalSnow({ enabled = true }: SeasonalSnowProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { innerWidth: w, innerHeight: h } = window;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const flakes: Snowflake[] = [];
    const baseCount = prefersReducedMotion ? 40 : 90;
    const maxFlakes =
      window.innerWidth < 768 ? Math.round(baseCount * 0.6) : baseCount;

    const randomFlake = (): Snowflake => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 1 + Math.random() * 2.4,
      speedY: 0.5 + Math.random() * 1.5,
      speedX: -0.3 + Math.random() * 0.6,
      opacity: 0.35 + Math.random() * 0.55,
    });

    for (let i = 0; i < maxFlakes; i++) {
      flakes.push(randomFlake());
    }

    const render = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = "#ffffff";

      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];

        ctx.globalAlpha = f.opacity;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();

        f.y += f.speedY;
        f.x += f.speedX;

        // lekkie "falowanie"
        f.x += Math.sin((f.y / h) * Math.PI * 2) * 0.05;

        // respawn, gdy spadnie poza ekran
        if (f.y - f.r > h) {
          flakes[i] = {
            ...randomFlake(),
            y: -10 - Math.random() * 40,
          };
        } else if (f.x + f.r < 0) {
          f.x = w + f.r;
        } else if (f.x - f.r > w) {
          f.x = -f.r;
        }
      }

      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[40]"
      aria-hidden="true"
    />
  );
}
