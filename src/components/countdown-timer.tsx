"use client";

import { useEffect, useState } from "react";

interface CountdownTimerProps {
  nextRunAt: string; // ISO string
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "Sebentar lagi...";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} jam ${String(minutes).padStart(2, "0")} menit`;
  }
  if (minutes > 0) {
    return `${minutes} menit ${String(seconds).padStart(2, "0")} detik`;
  }
  return `${seconds} detik`;
}

export function CountdownTimer({ nextRunAt }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState<number>(() => new Date(nextRunAt).getTime() - Date.now());

  useEffect(() => {
    const target = new Date(nextRunAt).getTime();
    const tick = () => setRemaining(target - Date.now());

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextRunAt]);

  if (remaining <= 0) {
    return <span className="text-emerald-600 dark:text-emerald-400">Sebentar lagi...</span>;
  }

  return <span>{formatDuration(remaining)}</span>;
}
