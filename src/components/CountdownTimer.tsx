// components/CountdownTimer.tsx
"use client";

import { useEffect, useState } from "react";

interface CountdownTimerProps {
  targetTime: string; // ISO timestamp
}

export default function CountdownTimer({ targetTime }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const target = new Date(targetTime).getTime();
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const diff = target - now;
      setTimeLeft(diff > 0 ? diff : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  const minutes = Math.floor(timeLeft / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

  return (
    <div className="text-lg font-mono">
      {minutes}:{seconds < 10 ? "0" : ""}{seconds}
    </div>
  );
}
