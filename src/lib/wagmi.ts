import { http } from "wagmi";
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
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0]),
  },
  ssr: true,
});
