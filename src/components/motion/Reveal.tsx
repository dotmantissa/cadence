"use client";

import { motion } from "framer-motion";
import { fadeUp } from "./primitives";

interface Props {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  once?: boolean;
}

/** Scroll-triggered fade+rise. Cheap, transform+opacity only. */
export function Reveal({ children, className = "", delay = 0, once = true }: Props) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount: 0.25 }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}
