import { defineChain } from "viem";
import { browserSafeRpcHttp } from "./rpc-endpoints";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    // The browser talks only to same-origin `/api/rpc` (which proxies to Circle's
    // primary + mirrors server-side), so no third-party domain appears in the
    // browser's request log for an extension to block and no CORS preflight runs.
    // Server-side (SSR) talks direct to the upstreams — faster, and nothing blocks.
    // Privy's embedded wallet client reads `.default.http[0]` for its own signer
    // transport, so this same-origin path covers both our public reads and embedded
    // writes. External wallets (MetaMask, Coinbase, etc.) are untouched — their
    // write path uses their own EIP-1193 provider and their own RPC setting.
    default: {
      http: browserSafeRpcHttp(),
      webSocket: ["wss://rpc.drpc.testnet.arc.io"],
    },
    public: {
      http: browserSafeRpcHttp(),
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
