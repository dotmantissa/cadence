import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arcTestnet } from "./chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Cadence",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "cadence-arc",
  chains: [arcTestnet],
  ssr: true,
});
