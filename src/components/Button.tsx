"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Magnetic } from "./motion/primitives";
import { cn } from "@/lib/utils";

type Variant = "volt" | "ink" | "ghost" | "paper";

interface Props {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: Variant;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  magnetic?: boolean;
  full?: boolean;
}

const styles: Record<Variant, string> = {
  volt: "bg-volt text-white hover:bg-volt-bright shadow-[0_8px_30px_-6px_rgba(43,68,231,0.6)]",
  ink: "bg-ink text-paper hover:bg-ink-soft",
  paper: "bg-paper text-ink hover:bg-paper-dim border border-black/10",
  ghost: "bg-transparent text-ink hover:bg-black/5 border border-black/10",
};

export function Button({
  children,
  href,
  onClick,
  variant = "volt",
  className = "",
  type = "button",
  disabled = false,
  magnetic = true,
  full = false,
}: Props) {
  const inner = (
    <motion.span
      whileTap={{ scale: 0.96 }}
      className={cn(
        "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full px-6 py-3 text-sm font-medium transition-colors duration-300 ease-liquid",
        styles[variant],
        full && "w-full",
        disabled && "pointer-events-none opacity-40",
        className
      )}
    >
      <span className="relative z-10 inline-flex items-center gap-2">
        {children}
      </span>
      {/* liquid sheen on hover */}
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-liquid group-hover:translate-x-full" />
    </motion.span>
  );

  const content = magnetic ? <Magnetic strength={0.25}>{inner}</Magnetic> : inner;

  if (href) {
    return (
      <Link href={href} className={cn("inline-block", full && "w-full")}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn("inline-block bg-transparent", full && "w-full")}
    >
      {content}
    </button>
  );
}
