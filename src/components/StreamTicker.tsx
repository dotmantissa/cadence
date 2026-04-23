"use client";

import { useEffect, useState } from "react";
import { formatUsdc } from "@/lib/utils";

interface Props {
  initialAccrued: bigint;
  ratePerSecond: bigint;
  active: boolean;
}

/**
 * Interpolates the on-chain accrued value client-side at ~60fps using the
 * known rate-per-second so the number ticks smoothly without polling.
 */
export function StreamTicker({ initialAccrued, ratePerSecond, active }: Props) {
  const [display, setDisplay] = useState(initialAccrued);
  const startRef = { time: Date.now(), value: initialAccrued };

  useEffect(() => {
    if (!active || ratePerSecond === 0n) {
      setDisplay(initialAccrued);
      return;
    }
    const origin = { time: Date.now(), value: initialAccrued };

    const frame = () => {
      const elapsedMs = Date.now() - origin.time;
      const elapsedSec = BigInt(Math.floor(elapsedMs / 1000));
      const frac = (elapsedMs % 1000) / 1000;
      const whole = origin.value + elapsedSec * ratePerSecond;
      // Interpolate fractional second
      const partial = BigInt(Math.floor(Number(ratePerSecond) * frac));
      setDisplay(whole + partial);
      raf = requestAnimationFrame(frame);
    };

    let raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [initialAccrued, ratePerSecond, active]);

  const dollars = Number(display) / 1_000_000;

  return (
    <div className="font-mono tabular-nums">
      <span className="text-4xl font-bold text-white">
        ${Math.floor(dollars).toLocaleString()}
      </span>
      <span className="text-2xl text-arc-blue font-bold">
        .{String(Math.floor((dollars % 1) * 1_000_000)).padStart(6, "0")}
      </span>
    </div>
  );
}
