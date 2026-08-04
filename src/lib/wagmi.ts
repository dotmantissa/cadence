import { http, fallback } from "wagmi";
import { createConfig } from "@privy-io/wagmi";
import { arcTestnet } from "./chains";

/**
 * Wagmi config bridged through Privy. Unlike a vanilla wagmi setup we do NOT
 * register connectors here — Privy owns wallet connection (injected, embedded,
 * imported) and feeds the active wallet to wagmi via PrivyProvider +
 * @privy-io/wagmi's WagmiProvider.
 */
export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  transports: {
    // A CORS-friendly fallback across all three docs-listed .io providers: if the
    // first briefly errors/rate-limits, viem transparently retries the next rather
    // than surfacing a read failure (which would collapse the stream-id list to
    // empty and unmount every card — the flicker loop). batch:true still collapses
    // same-tick reads into one JSON-RPC batch routed through Multicall3, so a page
    // of cards costs ~1-2 round trips, not one per read.
    [arcTestnet.id]: fallback(
      arcTestnet.rpcUrls.default.http.map((url) => http(url, { batch: true })),
      { rank: false }
    ),
  },
  batch: {
    multicall: true,
  },
  // Arc blocks are sub-second (~0.48s) with instant finality; viem's default
  // 4s poll makes tx confirmations and watch-based reads feel laggy. 1s keeps
  // waitForTransactionReceipt snappy without hammering the RPC.
  pollingInterval: 1000,
  ssr: true,
});
