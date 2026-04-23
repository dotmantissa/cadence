import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format USDC amount (6 decimals) to human-readable string */
export function formatUsdc(amount: bigint, decimals = 2): string {
  const value = Number(amount) / 1_000_000;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Convert USDC display amount (e.g. "100.50") to 6-decimal bigint */
export function parseUsdc(display: string): bigint {
  const n = parseFloat(display);
  if (isNaN(n)) return 0n;
  return BigInt(Math.round(n * 1_000_000));
}

/** Seconds → human-readable runway string */
export function formatRunway(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (seconds < 86400) return `${h}h ${m}m`;
  const d = Math.floor(seconds / 86400);
  return `${d}d ${h % 24}h`;
}

/** Daily/monthly equivalent from rate-per-second (6 decimals) */
export function rateToDaily(ratePerSecond: bigint): string {
  return formatUsdc(ratePerSecond * 86400n);
}

export function rateToMonthly(ratePerSecond: bigint): string {
  return formatUsdc(ratePerSecond * 2592000n); // 30 days
}

/** Human-friendly daily rate → ratePerSecond bigint (6 decimals) */
export function dailyRateToPerSecond(dailyUsdc: string): bigint {
  return parseUsdc(dailyUsdc) / 86400n;
}

/** Shorten address 0x1234...5678 */
export function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
