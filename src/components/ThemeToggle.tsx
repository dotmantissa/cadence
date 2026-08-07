"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

/**
 * Light/dark switch. Renders a neutral placeholder until mounted so the icon
 * never mismatches the pre-paint theme on hydration.
 *
 * On click the incoming theme irises out from the toggle itself in a circular
 * sweep (View Transitions API), so the change cascades across the page from the
 * top-right instead of flipping instantly. Browsers without the API — or users
 * who prefer reduced motion — get the plain instant swap.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setMounted(true), []);

  const dark = theme === "dark";

  function handleToggle() {
    const btn = btnRef.current;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> };
    };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // No View Transitions support (or reduced motion): flip instantly.
    if (!doc.startViewTransition || !btn || reduceMotion) {
      toggle();
      return;
    }

    // Origin = the toggle's own centre (top-right of the layout), so the reveal
    // sweeps down and across from where the user clicked.
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Big enough to reach the farthest viewport corner, so the circle covers
    // the whole page by the end of the sweep.
    const endRadius = Math.hypot(
      Math.max(cx, window.innerWidth - cx),
      Math.max(cy, window.innerHeight - cy)
    );

    const transition = doc.startViewTransition(() => {
      // flushSync so the `.dark` class flip lands in the transition's "after"
      // snapshot rather than a later React commit.
      flushSync(() => toggle());
    });

    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${cx}px ${cy}px)`,
              `circle(${endRadius}px at ${cx}px ${cy}px)`,
            ],
          },
          {
            duration: 520,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            pseudoElement: "::view-transition-new(root)",
          }
        );
      })
      .catch(() => {
        // Transition skipped (e.g. tab hidden): the theme still flipped.
      });
  }

  return (
    <button
      ref={btnRef}
      onClick={handleToggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-ink/10 text-ink/70 transition-colors hover:text-ink"
    >
      {mounted && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={dark ? "moon" : "sun"}
            initial={{ opacity: 0, rotate: -30, scale: 0.6 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 30, scale: 0.6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {dark ? <Moon size={17} /> : <Sun size={18} />}
          </motion.span>
        </AnimatePresence>
      )}
    </button>
  );
}
