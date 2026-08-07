<div align="center">
  <img src="public/logo.svg" width="64" height="64" alt="Cadence" />
  <h1>Cadence: Real-Time Payroll on Arc</h1>
</div>

Employers deposit USDC once and employees get paid every second. No waiting for payday, no bank transfers, no delays.

**Live app:** https://cadenceonarc.tech

---

## The problem

Payroll is stuck in a monthly rhythm that has nothing to do with when work actually happens. You earn every day but you get paid once a month, so your money sits in someone else's account until a date on a calendar says you can have it. If you need cash before then, your options are an advance, an overdraft, or a payday loan. None of them are good.

The employer side is not much better. A lump sum goes out on a fixed date, gets reconciled by hand, and there is no simple way to see how far the payroll runway stretches. Cross-border teams pile on banking rails, currency conversion, and multi-day settlement.

The root of all of it is that traditional payroll batches time. Cadence unbatches it.

## How Cadence solves it

Cadence streams pay by the second. The moment an employer opens a stream, USDC starts flowing to the employee's wallet continuously, and the employee can withdraw whatever they have earned at any point. Money that has been earned is money you can hold, not a promise you are waiting on.

Everything runs on a smart contract. The employer deposits the funds up front and the contract releases them second by second at the agreed rate. No company sits in the middle holding your money, and no one can quietly change the terms after the fact. Because it settles in USDC on Arc, a stream to a teammate across the world works exactly like a stream to someone next door.

For the employer it stays simple. Deposit a lump sum, set a rate per employee, and the dashboard shows live runway so you always know how long each stream can run before it needs a top up. Cancel any time and every unstreamed cent goes straight back to your wallet.

## How it works

1. The employer connects a wallet and opens a stream, setting the employee's address, the amount, and how long it should run.
2. Cadence works out the per-second rate and starts streaming USDC immediately.
3. The employee opens their dashboard and watches earnings accrue in real time.
4. The employee withdraws whenever they want. The earned balance is already theirs on-chain.
5. The employer can top up a stream with more funds or cancel it at any time. Unstreamed funds return to the employer's wallet on cancel.

Alongside the live cards, Cadence produces shareable per-stream receipts and full account statements, viewable in-app or downloadable as a branded PDF, so both sides keep a clean record of what was paid.

## Under the hood

- **Smart contract:** a Solidity `PayrollManager`, built and tested with Foundry, holds each stream's escrow and does the per-second accounting on-chain.
- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, and Tailwind CSS, with framer-motion driving the live tickers and motion.
- **Wallet and onchain:** Privy for sign-in and embedded or external wallets, wired through wagmi v2 and viem.
- **Data layer:** a Neon Postgres database via Drizzle ORM keeps off-chain conveniences like usernames, saved payees, and stream drafts. Nothing that moves money lives off-chain.
- **App routes:** a same-origin RPC proxy keeps browser reads reliable, plus routes for identity resolution and one-click testnet funding.
- **Hosting:** Vercel.

## Notes

- USDC on Arc uses **6 decimals** through its ERC-20 interface, even though the network uses USDC as its native gas token (18 decimals internally). Every amount in this app is 6-decimal USDC.
- Streams can only be created and topped up by the employer who owns them.
- Cancelling a stream returns all unstreamed funds to the employer's wallet.
- The live ticker smooths the display between on-chain updates on the client so it never hammers the RPC on every animation frame.
