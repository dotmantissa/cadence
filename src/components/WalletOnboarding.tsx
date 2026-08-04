"use client";

import { useState } from "react";
import {
  usePrivy,
  useWallets,
  useCreateWallet,
  useImportWallet,
  useLogout,
} from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  KeyRound,
  ShieldCheck,
  Loader2,
  ArrowLeft,
  LogOut,
  Eye,
  EyeOff,
} from "lucide-react";

/**
 * Onboarding gate for the email login route. It appears only when someone is
 * authenticated with Privy but has no wallet yet (i.e. they logged in with
 * email instead of connecting one). They pick: mint a fresh embedded wallet on
 * Arc, or import a key they already hold — either way Privy secures the secret
 * in its TEE and binds it to the account. Cadence never sees or stores the key.
 */
export function WalletOnboarding() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const { importWallet } = useImportWallet();
  const { logout } = useLogout();

  const [mode, setMode] = useState<"choose" | "import">("choose");
  const [busy, setBusy] = useState<null | "create" | "import">(null);
  const [privateKey, setPrivateKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const show = ready && authenticated && wallets.length === 0;

  async function handleCreate() {
    setError(null);
    setBusy("create");
    try {
      await createWallet();
      // wallets updates, `show` flips false, modal unmounts.
    } catch (e) {
      setError(niceError(e, "Could not spin up a wallet. Give it another go."));
      setBusy(null);
    }
  }

  async function handleImport() {
    setError(null);
    const key = privateKey.trim();
    if (!/^(0x)?[0-9a-fA-F]{64}$/.test(key)) {
      setError("That does not look like a private key. It should be 64 hex characters.");
      return;
    }
    setBusy("import");
    try {
      // Privy takes the key into its secure enclave (TEE) and binds the
      // resulting Ethereum embedded wallet to this account. We only hand it the
      // key; we never persist or log it.
      await importWallet({
        privateKey: key.startsWith("0x") ? key : `0x${key}`,
      });
      setPrivateKey("");
    } catch (e) {
      setError(niceError(e, "Import failed. Double check the key and try again."));
      setBusy(null);
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-panel/70 p-4 backdrop-blur-md"
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
              <AnimatePresence mode="wait">
                {mode === "choose" ? (
                  <motion.div
                    key="choose"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                  >
                    <p className="font-mono text-xs uppercase tracking-widest text-volt-bright">
                      one last thing
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                      You are in. Now grab a wallet.
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-panel-foreground/55">
                      You need somewhere for the money to land. Make a fresh one
                      on Arc, or bring a wallet you already run. Privy locks the
                      key in its secure enclave either way.
                    </p>

                    <div className="mt-6 space-y-3">
                      <button
                        onClick={handleCreate}
                        disabled={busy !== null}
                        className="group flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:border-volt/50 hover:bg-white/[0.08] disabled:opacity-50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-volt text-white">
                          {busy === "create" ? (
                            <Loader2 size={18} className="animate-spin" />
                          ) : (
                            <Sparkles size={18} />
                          )}
                        </span>
                        <span>
                          <span className="block text-sm font-semibold">
                            Generate a fresh Arc wallet
                          </span>
                          <span className="block text-xs text-panel-foreground/50">
                            Made in a second, nothing to install
                          </span>
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          setError(null);
                          setMode("import");
                        }}
                        disabled={busy !== null}
                        className="group flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:border-volt/50 hover:bg-white/[0.08] disabled:opacity-50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-volt-bright">
                          <KeyRound size={18} />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold">
                            Import a wallet I already have
                          </span>
                          <span className="block text-xs text-panel-foreground/50">
                            Bring your key, Privy takes it from here
                          </span>
                        </span>
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="import"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                  >
                    <button
                      onClick={() => {
                        setMode("choose");
                        setError(null);
                      }}
                      className="mb-4 inline-flex items-center gap-1.5 text-xs text-panel-foreground/50 transition-colors hover:text-panel-foreground"
                    >
                      <ArrowLeft size={13} /> back
                    </button>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      Import your wallet
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-panel-foreground/55">
                      Paste your private key. It goes straight into Privy&apos;s
                      secure enclave and gets bound to your account. Cadence never
                      sees it, stores it, or logs it.
                    </p>

                    <label className="mt-5 block">
                      <span className="mb-1.5 block text-xs uppercase tracking-widest text-panel-foreground/40">
                        Private key
                      </span>
                      <div className="relative">
                        <input
                          type={reveal ? "text" : "password"}
                          value={privateKey}
                          onChange={(e) => setPrivateKey(e.target.value)}
                          placeholder="0x…"
                          autoComplete="off"
                          spellCheck={false}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 pr-11 font-mono text-sm text-panel-foreground outline-none transition-colors placeholder:text-panel-foreground/25 focus:border-volt"
                        />
                        <button
                          type="button"
                          onClick={() => setReveal((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-panel-foreground/40 transition-colors hover:text-panel-foreground"
                          aria-label={reveal ? "Hide key" : "Show key"}
                        >
                          {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </label>

                    <button
                      onClick={handleImport}
                      disabled={busy !== null || privateKey.trim().length === 0}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-volt py-3.5 text-sm font-medium text-white transition-colors hover:bg-volt-bright disabled:opacity-40"
                    >
                      {busy === "import" ? (
                        <>
                          <Loader2 size={16} className="animate-spin" /> Securing it
                        </>
                      ) : (
                        <>
                          <KeyRound size={16} /> Import and bind to my account
                        </>
                      )}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </p>
              )}

              <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-panel-foreground/40">
                  <ShieldCheck size={13} className="text-volt-bright" />
                  Secured by Privy
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

function niceError(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = String((e as { message: unknown }).message);
    if (m && m.length < 140) return m;
  }
  return fallback;
}
