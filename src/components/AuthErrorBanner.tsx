"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { useProfileContext } from "./ProfileProvider";

/**
 * Global notice for a refused login. When someone tries to sign in with an
 * email that is already bound to a wallet account, we log them straight back
 * out (in useProfile) and set an auth error; this surfaces it as a dismissible
 * banner so they know to use their wallet instead of guessing why it failed.
 */
export function AuthErrorBanner() {
  const { authError, clearAuthError } = useProfileContext();

  return (
    <AnimatePresence>
      {authError && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 top-4 z-[60] flex justify-center px-4"
        >
          <div className="flex max-w-md items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 shadow-lg backdrop-blur">
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            <p className="leading-relaxed">{authError}</p>
            <button
              onClick={clearAuthError}
              aria-label="Dismiss"
              className="ml-1 shrink-0 rounded-full p-1 text-red-600/70 transition-colors hover:bg-red-500/10 hover:text-red-600"
            >
              <X size={15} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
