"use client";

import Link from "next/link";
import { Logo } from "../Logo";

export function Footer() {
  return (
    <footer className="relative border-t border-white/10 bg-panel text-panel-foreground">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo tone="paper" />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-panel-foreground/50">
              Real-time payments on Arc. Deposit once, pay by the second, and let
              anyone you pay cash out on their own schedule.
            </p>
          </div>

          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-panel-foreground/40">
              the app
            </p>
            <ul className="mt-5 space-y-3 text-sm">
              <li>
                <Link href="/payer" className="text-panel-foreground/70 transition-colors hover:text-panel-foreground">
                  Pay
                </Link>
              </li>
              <li>
                <Link href="/payee" className="text-panel-foreground/70 transition-colors hover:text-panel-foreground">
                  Get paid
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-panel-foreground/40">
              the chain
            </p>
            <ul className="mt-5 space-y-3 text-sm">
              <li>
                <a
                  href="https://testnet.arcscan.app"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-panel-foreground/70 transition-colors hover:text-panel-foreground"
                >
                  Block explorer
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dotmantissa/cadence"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-panel-foreground/70 transition-colors hover:text-panel-foreground"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.1.7.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
                  </svg>
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://x.com/cadenceonarc"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-panel-foreground/70 transition-colors hover:text-panel-foreground"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  X
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row sm:items-center">
          <p className="text-xs text-panel-foreground/40">
            Cadence runs on Arc Testnet. Not financial advice, obviously.
          </p>
          <p className="font-mono text-xs text-panel-foreground/40">
            chain 5042002 // usdc native
          </p>
        </div>
      </div>
    </footer>
  );
}
