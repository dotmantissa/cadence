<div align="center">
  <img src="public/logo.svg" width="64" height="64" alt="Cadence" />
  <h1>Cadence: Real-Time Payments on Arc</h1>
</div>

Fund a stream once and whoever you pay earns by the second. No pay run, no invoice lag, no waiting on a bank. USDC flows continuously and the recipient cashes out whenever they want.

**Live app:** https://cadenceonarc.tech

---

## The problem

Getting paid still runs on someone else's clock. You do the work continuously, but the money arrives in a lump, on a date a calendar decides, often days or weeks after it was earned. Until then your money sits in an account that is not yours. If you need it sooner, the options are an advance, an overdraft, or a loan. None of them are good.

The paying side is not much better. Money leaves in a batch on a fixed date, gets reconciled by hand, and there is no simple way to see how far the balance stretches. Pay someone in another country and you add banking rails, currency conversion, and multi-day settlement on top.

The root of all of it is that money is batched by time. Cadence unbatches it.

## How Cadence solves it

Cadence streams money by the second. The moment a payer opens a stream, USDC starts flowing to the payee's wallet continuously, and the payee can withdraw whatever they have earned at any point. Money that has been earned is money you can hold, not a promise you are waiting on.

Everything runs on a smart contract. The payer deposits the funds up front and the contract releases them second by second at the agreed rate. No company sits in the middle holding the money, and no one can quietly change the terms after the fact. Because it settles in USDC on Arc, a stream to someone across the world works exactly like a stream to someone next door.

For the payer it stays simple. Deposit once, set a rate, and the dashboard shows live runway so you always know how long a stream can run before it needs a top up. Cancel any time and every unstreamed cent goes straight back to your wallet.

Payroll, a contractor invoice, a retainer, or a one-off: the mechanic is the same. Money that moves the way time does.

## How it works

1. The payer connects a wallet and opens a stream, setting the payee's address, the amount, and how long it should run.
2. Cadence works out the per-second rate and starts streaming USDC immediately.
3. The payee opens their dashboard and watches earnings accrue in real time.
4. The payee withdraws whenever they want. The earned balance is already theirs on-chain.
5. The payer can top up a stream with more funds or cancel it at any time. Unstreamed funds return to the payer's wallet on cancel.

A payee can also request a stream from a payer, who accepts the terms as-is or counters with their own. Alongside the live cards, Cadence produces shareable per-stream receipts and full account statements, viewable in-app or downloadable as a branded file, so both sides keep a clean record of what was paid.

## Built on Arc

Cadence is not a generic streaming app that happens to run on Arc. The core promise, earned money you can spend right now, only holds together because of what Arc provides at the protocol level.

- **USDC is the native gas token.** On Arc the dollar you deposit, the dollar that streams, and the gas that moves it are the same asset. The [native and ERC-20 interfaces share one balance](https://docs.arc.io/arc/concepts/stablecoin-native-model) (18 decimals for native accounting, 6 for the ERC-20 view). A payee withdraws USDC by spending a sliver of that same USDC.
- **Sub-second deterministic finality.** Arc's Malachite BFT consensus finalizes every block in under a second with no reorganizations. A withdrawal is irreversible the instant it commits, which is what makes cash-out-anytime real rather than a pending state.
- **Fees denominated in USDC.** Base fees target about a cent and are priced in dollars, not a volatile gas token, so frequent small withdrawals and top ups stay viable instead of being eaten by gas.
- **Canonical USDC system events.** Every balance change emits a standard `Transfer` log (Arc's implementation of [EIP-7708](https://eips.ethereum.org/EIPS/eip-7708)), giving receipts and statements one universal source of truth.
- **Full EVM compatibility.** The `PayrollManager` contract is plain Solidity, built and tested with Foundry and deployed with standard Ethereum tooling.

### Why it can't be built the same way anywhere else

- **The gas token problem, solved only here.** On any other EVM chain the payee earns a stablecoin but needs a separate, volatile gas token just to touch it. Someone paid only in USDC would hold a balance they cannot withdraw without first going and acquiring ETH or the chain's native coin. Arc collapses money and gas into a single asset, so earnings are always spendable. There is no equivalent on Ethereum, an L2, or any other EVM network.
- **Finality that streaming cannot tolerate elsewhere.** "Withdraw what you earned, now" breaks if settlement is probabilistic or delayed. Ethereum L1 finality takes 12 to 15 minutes; optimistic rollups gate withdrawal finality behind a challenge window of roughly seven days. Streaming by the second with instant cash-out needs finality measured in milliseconds, which is Arc's default.
- **Fees that do not punish small moves.** Streaming invites a lot of tiny actions: withdraw a little, top up, cancel. On a volatile gas market a micro-withdrawal can cost more than it is worth, and the price swings with congestion. Arc's stable, dollar-priced fees keep those actions economical.

Put together, the single-asset USDC model, sub-second finality, and stable fees are what turn "paid by the second, spendable by the second" from a demo into something that actually works. Take any one of them away and the product stops making sense.

## Under the hood

- **Smart contract:** a Solidity `PayrollManager`, built and tested with Foundry, holds each stream's escrow and does the per-second accounting on-chain, including native batch stream creation in a single transaction.
- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, and Tailwind CSS, with framer-motion driving the live tickers and motion.
- **Wallet and onchain:** Privy for sign-in and embedded or external wallets, wired through wagmi v2 and viem.
- **Data layer:** a Neon Postgres database via Drizzle ORM keeps off-chain conveniences like usernames, saved payees, notification email, and stream drafts. Nothing that moves money lives off-chain.
- **Email:** Resend sends on-brand account notifications (sign-in, payment started, request received, counter offer, receipt) to anyone who links an address.
- **App routes:** a same-origin RPC proxy keeps browser reads reliable, plus routes for identity resolution and one-click testnet funding.
- **Hosting:** Vercel.

## Notes

- USDC on Arc uses **6 decimals** through its ERC-20 interface, even though the network uses USDC as its native gas token (18 decimals internally). Every amount in this app is 6-decimal USDC.
- Streams can only be created and topped up by the payer who owns them.
- Cancelling a stream returns all unstreamed funds to the payer's wallet.
- The live ticker smooths the display between on-chain updates on the client so it never hammers the RPC on every animation frame.
