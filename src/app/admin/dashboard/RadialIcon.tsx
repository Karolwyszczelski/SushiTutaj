"use client";

import React from "react";

interface RadialIconProps {
  percentage: number; // 0-100
  size?: number;      // szerokość / wysokość w px
}

/**
 * Rysuje pełny okrąg wypełniony zależnie od percentage (0-100).
 * Kolor wypełnienia: <50% zielony, <80% pomarańczowy, >=80% czerwony.
 */
export function RadialIcon({ percentage, size = 48 }: RadialIconProps) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (circumference * percentage) / 100;

  // Dobór koloru dynamicznego
  let strokeColor = "#10B981"; // tailwind green-500
  if (percentage >= 50 && percentage < 80) strokeColor = "#F59E0B"; // amber-500
  if (percentage >= 80) strokeColor = "#EF4444"; // red-500

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {/* Tło okręgu */}
      <circle
        cx="50"
        cy="50"
        r={radius}
        stroke="#e5e7eb" // gray-200
        fill="none"
        strokeWidth="10"
      />
      {/* Wypełnienie */}
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth="10"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
      />
      {/* Ewentualnie tekst w środku – jeśli chcesz wyświetlać np. {percentage}% */}
      {/* 
      <text
        x="50"
        y="55"
        textAnchor="middle"
        fill="#111"
        fontSize="18"
        fontWeight="bold"
      >
        {Math.round(percentage)}%
      </text>
      */}
    </svg>
  );
}
