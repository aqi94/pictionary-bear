"use client";

import { useEffect, useState } from "react";

/** A clock that re-renders every `intervalMs`. */
export function useNow(intervalMs = 200) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useCountdown(endsAt: number | null, offset: number) {
  const now = useNow(200);
  if (!endsAt) return 0;
  return Math.max(0, endsAt - (now + offset));
}

export function Timer({ endsAt, totalMs, offset }: { endsAt: number | null; totalMs: number; offset: number }) {
  const remaining = useCountdown(endsAt, offset);
  const secs = Math.ceil(remaining / 1000);
  const frac = totalMs > 0 ? Math.min(1, remaining / totalMs) : 0;
  const urgent = secs <= 10;
  return (
    <div className="flex items-center gap-2" aria-label={`${secs} seconds left`}>
      <div
        className={`font-display font-bold text-2xl tabular-nums w-14 h-14 rounded-full border-3 border-bark flex items-center justify-center ${
          urgent ? "bg-berry text-white" : "bg-honey text-bark"
        }`}
      >
        {secs}
      </div>
      <div className="hidden sm:block w-24 h-3 rounded-full border-2 border-bark overflow-hidden bg-paper">
        <div className={`h-full transition-[width] duration-200 ${urgent ? "bg-berry" : "bg-leaf"}`} style={{ width: `${frac * 100}%` }} />
      </div>
    </div>
  );
}
