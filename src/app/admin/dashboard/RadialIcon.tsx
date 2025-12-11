"use client";

import React from "react";

interface RadialIconProps {
  percentage: number; // 0–100
  size?: number;      // szerokość / wysokość w px
}

/**
 * Kompaktowy „gauge” kołowy do kart KPI w dashboardzie.
 * - 0–49%  → turkus
 * - 50–79% → żółty
 * - 80–100% → róż/czerwony
 */
export function RadialIcon({ percentage, size = 48 }: RadialIconProps) {
  const pct = Math.max(0, Math.min(100, percentage ?? 0));

  const radius = 42;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (circumference * pct) / 100;

  let strokeColor = "#22d3ee"; // cyan-400
  if (pct >= 50 && pct < 80) strokeColor = "#facc15"; // amber-400
  if (pct >= 80) strokeColor = "#fb7185"; // rose-400

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${pct}%`}
    >
      <defs>
        {/* tło „tracku” */}
        <linearGradient id="radial-track" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#020617" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        {/* delikatny gradient na pasku postępu */}
        <linearGradient id="radial-progress" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={strokeColor} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0.85} />
        </linearGradient>
      </defs>

      {/* zewnętrzny cień / aura */}
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
        fill="url(#radial-track)"
        stroke="#1f2937" // slate-800
        strokeWidth={strokeWidth}
      />

      {/* pasek postępu */}
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke="url(#radial-progress)"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
      />

      {/* wewnętrzny krążek pod tekst */}
      <circle
        cx="50"
        cy="50"
        r={radius - strokeWidth}
        fill="#020617"
        opacity={0.9}
      />

      {/* wartość procentowa */}
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
    </svg>
  );
}
