"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Smoothly counts a display value toward a per-second rate, client-side.
 * Used for the marketing hero (no chain data). Pauses when tab hidden.
 */
export function useLiveCounter(start: number, ratePerSecond: number) {
  const [value, setValue] = useState(start);
  const raf = useRef(0);
  const origin = useRef({ t: 0, v: start });

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    origin.current = { t: performance.now(), v: start };

    if (reduce) {
      setValue(start);
      return;
    }

    const tick = (now: number) => {
      const elapsed = (now - origin.current.t) / 1000;
      setValue(origin.current.v + elapsed * ratePerSecond);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf.current);
      } else {
        origin.current = { t: performance.now(), v: origin.current.v };
        raf.current = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [start, ratePerSecond]);

  return value;
}
