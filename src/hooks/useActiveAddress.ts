"use client";

import { useMemo } from "react";
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

  return {
    ready,
    authenticated,
    address: authenticated ? address : undefined,
    connected: ready && authenticated && !!address,
  };
}
