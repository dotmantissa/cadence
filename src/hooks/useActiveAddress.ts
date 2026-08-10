"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

/**
 * Single source of truth for "is there a usable wallet, and what is its
 * address" across the app. Privy owns auth; wagmi owns the active signer.
 * We prefer wagmi's active account (that's what transactions use) and fall
 * back to Privy's first wallet while the bridge settles.
 *
 * The address is lowercased and memoized. Without this it flaps between
 * wagmi's checksummed address and Privy's copy of the SAME wallet — two
 * different strings for one wallet — and since it feeds every read hook's
 * `args`, each flap resets those query keys, re-blanks their data, and
 * remounts every stream/request card (the flicker loop). viem accepts any
 * casing for address args, so lowercasing is safe and every counterparty
 * comparison in the UI already lowercases both sides.
 */
export function useActiveAddress() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { address: wagmiAddress } = useAccount();

  const raw = wagmiAddress ?? (wallets[0]?.address as string | undefined);
  const address = useMemo(
    () => (raw ? (raw.toLowerCase() as `0x${string}`) : undefined),
    [raw]
  );

  // A returning user is `authenticated` the instant Privy rehydrates its stored
  // session, but wagmi surfaces the active `address` a beat later. During that
  // gap the user is fully logged in yet has no address — and a page that reads
  // that as "logged out" flashes the connect screen for ~a second before the
  // dashboard. `settling` marks exactly that window.
  const settling = ready && authenticated && !address;

  // Guard against a wallet that never reconnects (e.g. an external wallet whose
  // site permission was revoked, so the address never arrives): after a grace
  // period we stop reporting `restoring`, letting the connect gate reappear so
  // the user can re-link instead of watching an endless spinner.
  const [graceElapsed, setGraceElapsed] = useState(false);
  useEffect(() => {
    if (!settling) {
      setGraceElapsed(false);
      return;
    }
    const t = setTimeout(() => setGraceElapsed(true), 6000);
    return () => clearTimeout(t);
  }, [settling]);

  return {
    ready,
    authenticated,
    address: authenticated ? address : undefined,
    connected: ready && authenticated && !!address,
    // True while we're still bringing the session/wallet up and can't yet
    // conclude the user is logged out. Pages hold a loading state on this
    // instead of rendering the connect gate, so a logged-in refresh goes
    // warming-up → dashboard with no connect-button flash in between.
    restoring: !ready || (settling && !graceElapsed),
  };
}
