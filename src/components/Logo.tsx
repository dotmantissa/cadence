"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  withWordmark?: boolean;
  tone?: "ink" | "paper";
}

/** Animated waveform mark. The path draws itself in and breathes. */
export function Logo({ className = "", withWordmark = true, tone = "ink" }: Props) {
  const stroke = "#2b44e7";
  const box = tone === "ink" ? "#171618" : "#ffffff";
  const word = tone === "ink" ? "text-ink" : "text-paper";

  return (
    <Link
      href="/"
      className={cn("group inline-flex items-center gap-2.5", className)}
      aria-label="Cadence home"
    >
      <motion.svg
        width="34"
        height="34"
        viewBox="0 0 64 64"
        fill="none"
        whileHover={{ scale: 1.06, rotate: -3 }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
      >
        <rect width="64" height="64" rx="16" fill={box} />
        <motion.path
          d="M13 39C19 39 19 25 25 25C31 25 31 39 37 39C43 39 43 25 51 25"
          stroke={stroke}
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </motion.svg>
      {withWordmark && (
        <span className={cn("text-lg font-semibold tracking-tightest", word)}>
          Cadence
        </span>
      )}
    </Link>
  );
}
