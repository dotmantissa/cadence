"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface Props {
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  /**
   * When false, clicking the backdrop and pressing Escape do NOT close the
   * modal — only the X button (or the caller) can. Use for flows where an
   * accidental dismiss would lose in-progress work. Defaults to true.
   */
  dismissable?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Make the modal wider for content-heavy views like statements. */
  wide?: boolean;
}

/** Shared modal shell: dark scrim, spring-in panel, escape + scroll lock. */
export function Modal({
  title,
  onClose,
  closeDisabled,
  dismissable = true,
  children,
  className = "",
  wide = false,
}: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable && !closeDisabled) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, closeDisabled, dismissable]);

  return (
    <AnimatePresence>
      <motion.div
        key="scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={() => dismissable && !closeDisabled && onClose()}
        className="fixed inset-0 z-50 flex items-center justify-center bg-panel/50 p-4 backdrop-blur-sm"
      >
        <motion.div
          key="panel"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full ${
            wide ? "max-w-5xl" : "max-w-md"
          } overflow-hidden rounded-none border border-ink/10 bg-paper p-6 shadow-[0_40px_100px_-40px_rgba(23,22,24,0.5)] ${className}`}
        >
          <div className="flex items-center justify-between">
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
          <div className="mt-5">{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
