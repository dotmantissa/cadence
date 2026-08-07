"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  initialAccrued: bigint;
  ratePerSecond: bigint;
  active: boolean;
  /** "ink" renders on a dark card, "paper" on a light one */
  tone?: "ink" | "paper";
  size?: "sm" | "lg";
}

/**
 * Interpolates the on-chain accrued value client-side using the known
 * rate-per-second so the number ticks smoothly without polling. Pauses when
 * the tab is hidden and honours prefers-reduced-motion (snaps, no rAF churn).
 */
export function StreamTicker({
  initialAccrued,
  ratePerSecond,
  active,
  tone = "ink",
  size = "lg",
}: Props) {
  const [display, setDisplay] = useState(initialAccrued);
  const originRef = useRef({ time: 0, value: initialAccrued });

  useEffect(() => {
    if (!active || ratePerSecond === 0n) {
      setDisplay(initialAccrued);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    originRef.current = { time: performance.now(), value: initialAccrued };

    if (reduce) {
      setDisplay(initialAccrued);
      return;
    }

    let raf = 0;
    const frame = () => {
      const { time, value } = originRef.current;
      const elapsedMs = performance.now() - time;
      const whole = value + BigInt(Math.floor(elapsedMs / 1000)) * ratePerSecond;
      const partial = BigInt(
        Math.floor(Number(ratePerSecond) * ((elapsedMs % 1000) / 1000))
      );
      setDisplay(whole + partial);
      raf = requestAnimationFrame(frame);
    };

    function onVis() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        originRef.current = { time: performance.now(), value: display };
        raf = requestAnimationFrame(frame);
      }
    }

    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAccrued, ratePerSecond, active]);

  const dollars = Number(display) / 1_000_000;
  const whole = Math.floor(dollars).toLocaleString();
  const frac = String(Math.floor((dollars % 1) * 1_000_000)).padStart(6, "0");

  // The dark card is a fixed, theme-independent panel, so its text must use the
  // fixed panel foreground — not the theme-following `paper`, which flips to a
  // near-black in dark mode and vanishes against the panel.
  const wholeColor = tone === "ink" ? "text-panel-foreground" : "text-ink";
  const bigText = size === "lg" ? "text-4xl" : "text-3xl";
  const fracText = size === "lg" ? "text-2xl" : "text-xl";

  return (
    <div className="font-mono tabular-nums">
      <span className={`${bigText} font-semibold tracking-tight ${wholeColor}`}>
        ${whole}
      </span>
      <span className={`${fracText} font-semibold text-volt-bright`}>
        .{frac}
      </span>
    </div>
  );
}
