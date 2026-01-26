"use client";

import React, { useId, useMemo } from "react";

interface RadialIconProps {
  percentage: number; // 0–100
  size?: number; // px
  label?: string; // np. "Nowe zamówienia"
  showText?: boolean; // domyślnie true
}

/**
 * Kompaktowy „gauge” kołowy do kart KPI w dashboardzie.
 * Uwaga: używamy unikalnych ID gradientów (useId), żeby wiele ikon na stronie nie „kradło” sobie defs.
 */
export function RadialIcon({
  percentage,
  size = 48,
  label,
  showText = true,
}: RadialIconProps) {
  const uid = useId();

  const pct = useMemo(() => {
    const n = Number(percentage);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }, [percentage]);

  // stałe w układzie viewBox 100x100
  const radius = 42;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (circumference * pct) / 100;

  const strokeColor = useMemo(() => {
    if (pct >= 80) return "#fb7185"; // rose-400
    if (pct >= 50) return "#facc15"; // amber-400
    return "#22d3ee"; // cyan-400
  }, [pct]);

  const trackId = `radial-track-${uid}`;
  const progressId = `radial-progress-${uid}`;

  const aria = label ? `${label}: ${Math.round(pct)}%` : `${Math.round(pct)}%`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={aria}
      focusable="false"
    >
      <defs>
        <linearGradient id={trackId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#020617" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>

        <linearGradient id={progressId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={strokeColor} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0.85} />
        </linearGradient>
      </defs>

      {/* aura */}
      <circle
        cx="50"
        cy="50"
        r={radius + strokeWidth / 2}
        fill="none"
        stroke="#020617"
        strokeWidth={4}
        opacity={0.6}
      />

      {/* track */}
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill={`url(#${trackId})`}
        stroke="#1f2937" // slate-800
        strokeWidth={strokeWidth}
      />

      {/* progress */}
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={`url(#${progressId})`}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
      />

      {/* inner */}
      <circle
        cx="50"
        cy="50"
        r={radius - strokeWidth}
        fill="#020617"
        opacity={0.92}
      />

      {showText && (
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#e5e7eb"
          fontSize="18"
          fontWeight="600"
        >
          {Math.round(pct)}%
        </text>
      )}
    </svg>
  );
}
