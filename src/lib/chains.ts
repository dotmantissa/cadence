import { defineChain } from "viem";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    // Browser-facing endpoints MUST answer the CORS preflight, or every viem read
    // (application/json POST) is blocked and the UI flickers empty on each poll.
    //
    // Circle's "primary" host rpc.testnet.arc.io returns 400 with NO
    // Access-Control-Allow-* headers on OPTIONS, so it is unusable from the browser
    // even though server-side curl to it returns 200 (which masked this in probes).
    // The three docs-listed provider mirrors below all pass preflight
    // (blockdaemon: `*`; drpc/quicknode: echo Origin). Order is by measured
    // robustness under sustained multi-hook polling: blockdaemon and drpc never
    // rate-limit; quicknode is fastest but is the ONLY one that returns HTTP 429
    // under bursts, so it sits last as a fast-path fallback rather than primary.
    // See docs.arc.io/arc/references/rpc-endpoints.
    default: {
      http: [
        "https://rpc.blockdaemon.testnet.arc.io",
        "https://rpc.drpc.testnet.arc.io",
        "https://rpc.quicknode.testnet.arc.io",
      ],
      webSocket: ["wss://rpc.drpc.testnet.arc.io"],
    },
    public: {
      http: [
        "https://rpc.blockdaemon.testnet.arc.io",
        "https://rpc.drpc.testnet.arc.io",
        "https://rpc.quicknode.testnet.arc.io",
      ],
      webSocket: ["wss://rpc.drpc.testnet.arc.io"],
    },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  // Standard Multicall3 deployment. Lets viem/wagmi aggregate many view calls
  // into a single eth_call so a page full of stream cards resolves in one trip
  // instead of a per-read waterfall.
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
  testnet: true,
});
