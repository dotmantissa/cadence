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
    // Reads flow through whatever `arcTestnet.rpcUrls.default.http` resolves to:
    // same-origin `/api/rpc` in the browser (so ad-blockers / privacy extensions
    // have no third-party RPC host to block, and there's no CORS preflight), and
    // the direct Arc upstreams during SSR. The proxy already fails over across
    // Circle-primary + mirrors server-side, so a single browser transport is
    // enough — but we keep the fallback wrapper so SSR (multiple upstreams) still
    // retries. batch:true collapses same-tick reads into one JSON-RPC batch routed
    // through Multicall3, so a page of cards costs ~1-2 round trips, not one per read.
    [arcTestnet.id]: fallback(
      arcTestnet.rpcUrls.default.http.map((url) => http(url, { batch: true })),
      { rank: false }
    ),
  },
  batch: {
    multicall: true,
  },
  // Arc blocks are sub-second (~0.48s) with instant finality; viem's default
  // 4s poll makes tx confirmations feel laggy. 2s keeps waitForTransactionReceipt
  // snappy while halving background block-watch chatter against the public RPC.
  pollingInterval: 2000,
  ssr: true,
});
