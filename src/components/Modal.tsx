"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface Props {
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Make the modal wider for content-heavy views like statements. */
  wide?: boolean;
  /**
   * Panel width. `wide` is kept as an alias for `xl`. Defaults to `md`.
   * md → forms, lg → the batch editor, xl → statements/previews.
   */
  size?: "md" | "lg" | "xl";
}

const SIZE_CLASS: Record<NonNullable<Props["size"]>, string> = {
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-5xl",
};

/**
 * Shared modal shell: dark scrim, spring-in panel, scroll lock.
 *
 * Modals are deliberately X/cancel-only: clicking the backdrop and pressing
 * Escape do nothing, so an accidental click or keypress can never discard
 * in-progress work. Every modal closes through its X button or an explicit
 * cancel action wired to `onClose`.
 */
export function Modal({
  title,
  onClose,
  closeDisabled,
  children,
  className = "",
  wide = false,
  size,
}: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        key="scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-panel/50 p-4 backdrop-blur-sm"
      >
        <motion.div
          key="panel"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
          className={`flex max-h-[90vh] w-full flex-col ${
            SIZE_CLASS[size ?? (wide ? "xl" : "md")]
          } overflow-hidden rounded-none border border-ink/10 bg-paper p-6 shadow-[0_40px_100px_-40px_rgba(23,22,24,0.5)] ${className}`}
        >
          <div className="flex shrink-0 items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tightest text-ink">{title}</h2>
            <button
              onClick={onClose}
              disabled={closeDisabled}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-30"
            >
              <X size={17} />
            </button>
          </div>
          <div className="mt-5 min-h-0 flex-1 overflow-y-auto">{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
