"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp } from "lucide-react";

/**
 * A floating "back to top" control. It stays out of the way until the reader is
 * near the bottom of the page, then fades in at the bottom-right. Clicking it
 * scrolls smoothly back to the top. Purely presentational, no app state.
 */
export function ScrollToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Show once the reader is within one viewport of the bottom, and hide again
    // near the top. rAF-throttled so the scroll handler stays cheap.
    let ticking = false;
    const update = () => {
      const scrolled = window.scrollY;
      const viewport = window.innerHeight;
      const full = document.documentElement.scrollHeight;
      const nearBottom = scrolled + viewport >= full - viewport * 0.6;
      setShow(nearBottom && scrolled > viewport * 0.6);
      ticking = false;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          aria-label="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.9 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.94 }}
          className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-volt text-white shadow-[0_12px_40px_-8px_rgba(43,68,231,0.7)] transition-colors hover:bg-volt-bright"
        >
          <ArrowUp size={18} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
