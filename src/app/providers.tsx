"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { arcTestnet } from "@/lib/chains";
import { WalletOnboarding } from "@/components/WalletOnboarding";
import { UsernameGate } from "@/components/UsernameGate";
import { ProfileProvider } from "@/components/ProfileProvider";
import { ThemeProvider } from "@/components/ThemeProvider";

const queryClient = new QueryClient();

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <PrivyProvider
        appId={PRIVY_APP_ID}
        config={{
          // Connect an external wallet, or log in with email.
          loginMethods: ["wallet", "email"],
          defaultChain: arcTestnet,
          supportedChains: [arcTestnet],
          // We never auto-spin an embedded wallet. Email users explicitly choose
          // to generate one or import their own during onboarding.
          embeddedWallets: {
            ethereum: { createOnLogin: "off" },
            showWalletUIs: true,
          },
          appearance: {
            theme: "dark",
            accentColor: "#2b44e7",
            logo: "/logo.svg",
            walletChainType: "ethereum-only",
          },
        }}
      >
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={wagmiConfig}>
            <ProfileProvider>
              {children}
              {/* Wallet onboarding first, username gate stacked above it: an email
                  user with neither picks a handle, then sets up a wallet. */}
              <WalletOnboarding />
              <UsernameGate />
            </ProfileProvider>
          </WagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    </ThemeProvider>
  );
}
