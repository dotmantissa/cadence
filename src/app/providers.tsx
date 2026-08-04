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

// Cache-first defaults so revisiting a page paints instantly from the last
// known values and refetches in the background, instead of blanking out and
// waiting on the RPC. Our contract hooks set their own refetchInterval for
// liveness; staleTime only governs the remount flash.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

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
          // Coinbase Smart Wallet does NOT support Arc's custom chain 5042002, so
          // its connector throws "not supported by Coinbase Smart Wallet: 5042002"
          // and never initializes — leaving wagmi stuck at "3 of 4 connectors" past
          // its reconnect timeout. That hung connector makes useAccount()'s address
          // flap undefined↔defined, which churns every read hook's query key and
          // remounts the cards (the flicker/never-loads loop). eoaOnly brings up
          // only the standard Coinbase EOA connector, so the stack settles cleanly.
          externalWallets: {
            coinbaseWallet: { config: { preference: { options: "eoaOnly" } } },
          },
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
