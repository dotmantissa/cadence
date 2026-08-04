"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy, useLogout } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import { AtSign, Check, Loader2, ShieldCheck, LogOut, X } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { useProfileContext } from "@/components/ProfileProvider";
import { validateUsername, USERNAME_MAX } from "@/lib/username";

/**
 * Identity gate. Everyone gets a public @handle before they reach the app, new
 * or returning, wallet or email login. Appears whenever an authenticated user
 * has no username on file (existing accounts backfill on their next visit).
 * Blocking on purpose: the only way past is to pick a handle or sign out.
 *
 * Rendered above WalletOnboarding, so an email user with neither sets their
 * handle here, then lands on wallet setup underneath.
 */

type Status = "idle" | "checking" | "available" | "taken" | "invalid";

export function UsernameGate() {
  const { ready, authenticated } = usePrivy();
  const { logout } = useLogout();
  const { api } = useApi();
  const { user, loading, setUser } = useProfileContext();

  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards the async availability check against out-of-order responses.
  const checkSeq = useRef(0);

  const show = ready && authenticated && !loading && !!user && !user.username;

  // Debounced availability check. Format is validated instantly; only a
  // well-formed handle costs a round trip.
  useEffect(() => {
    if (!show) return;
    const raw = value.trim();
    if (raw.length === 0) {
      setStatus("idle");
      setReason(null);
      return;
    }
    const check = validateUsername(raw);
    if (!check.ok) {
      setStatus("invalid");
      setReason(check.error);
      return;
    }
    setStatus("checking");
    setReason(null);
    const seq = ++checkSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await api.checkUsername(check.value);
        if (seq !== checkSeq.current) return; // a newer keystroke won
        if (res.available) {
          setStatus("available");
          setReason(null);
        } else {
          setStatus("taken");
          setReason(res.reason ?? "already taken");
        }
      } catch {
        if (seq !== checkSeq.current) return;
        setStatus("idle");
        setReason(null);
      }
    }, 400);
    return () => clearTimeout(t);
    // api is recreated each render but stable in behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, show]);

  async function handleSubmit() {
    const check = validateUsername(value);
    if (!check.ok) {
      setStatus("invalid");
      setReason(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.setUsername(check.value);
      setUser(res.user); // clears `show`, modal unmounts
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/taken/i.test(msg)) {
        setStatus("taken");
        setReason("already taken");
      } else {
        setError("Could not save that handle. Give it another go.");
      }
      setBusy(false);
    }
  }

  const canSubmit = status === "available" && !busy;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-panel/70 p-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative w-full max-w-md overflow-hidden rounded-4xl border border-white/10 bg-panel p-7 text-panel-foreground shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)]"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-volt/30 blur-3xl" />

            <div className="relative">
              <p className="font-mono text-xs uppercase tracking-widest text-volt-bright">
                pick your handle
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                What should people call you?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-panel-foreground/55">
                This is your @handle across Cadence, how teammates find you and
                tag you on a stream. Lowercase letters, numbers, and underscores.
                You can change it later.
              </p>

              <label className="mt-6 block">
                <span className="mb-1.5 block text-xs uppercase tracking-widest text-panel-foreground/40">
                  Username
                </span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-panel-foreground/40">
                    <AtSign size={16} />
                  </span>
                  <input
                    value={value}
                    onChange={(e) =>
                      // Live-normalize: lowercase and drop anything illegal so
                      // the field only ever holds a legal-shaped handle.
                      setValue(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, "")
                          .slice(0, USERNAME_MAX)
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canSubmit) handleSubmit();
                    }}
                    placeholder="satoshi_streams"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    autoFocus
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 pl-10 pr-11 font-mono text-sm text-panel-foreground outline-none transition-colors placeholder:text-panel-foreground/25 focus:border-volt"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {status === "checking" && (
                      <Loader2 size={16} className="animate-spin text-panel-foreground/40" />
                    )}
                    {status === "available" && (
                      <Check size={16} className="text-emerald-400" />
                    )}
                    {(status === "taken" || status === "invalid") && (
                      <X size={16} className="text-red-400" />
                    )}
                  </span>
                </div>
              </label>

              <div className="mt-2 min-h-[1.25rem] text-xs">
                {status === "available" && (
                  <span className="text-emerald-400">@{value} is yours.</span>
                )}
                {(status === "taken" || status === "invalid") && reason && (
                  <span className="text-red-400">{reason}</span>
                )}
              </div>

              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-volt py-3.5 text-sm font-medium text-white transition-colors hover:bg-volt-bright disabled:opacity-40"
              >
                {busy ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Claiming it
                  </>
                ) : (
                  <>Claim @{value || "handle"}</>
                )}
              </button>

              {error && (
                <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </p>
              )}

              <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-panel-foreground/40">
                  <ShieldCheck size={13} className="text-volt-bright" />
                  Yours across Cadence
                </span>
                <button
                  onClick={() => logout()}
                  className="inline-flex items-center gap-1.5 text-xs text-panel-foreground/40 transition-colors hover:text-panel-foreground"
                >
                  <LogOut size={13} /> Not now, sign out
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
