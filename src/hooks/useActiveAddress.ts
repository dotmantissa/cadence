"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

/**
 * Single source of truth for "is there a usable wallet, and what is its
 * address" across the app. Privy owns auth; wagmi owns the active signer.
 * We prefer wagmi's active account (that's what transactions use) and fall
 * back to Privy's first wallet while the bridge settles.
 */
export function useActiveAddress() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { address: wagmiAddress } = useAccount();

  const address =
    wagmiAddress ?? (wallets[0]?.address as `0x${string}` | undefined);

  return {
    ready,
    authenticated,
    address: authenticated ? address : undefined,
    connected: ready && authenticated && !!address,
  };
}
