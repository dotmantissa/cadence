# Cadence

Real-time payroll streaming on Arc testnet. Employers deposit USDC once and employees get paid every second — no waiting for payday, no bank transfers, no delays.

**Live app:** https://cadence-phi-ochre.vercel.app

---

## What it does

Traditional payroll pays you once a month (or once a week if you're lucky). Cadence flips that model: the moment your employer sets up a stream, USDC starts flowing to your wallet continuously. You can withdraw whatever you've earned at any point, and it arrives in about 350ms on Arc.

For employers, it's just as simple. You deposit a lump sum upfront, set a daily rate for each employee, and Cadence handles the rest. Your dashboard shows live runway — exactly how long each stream can run before the funds run out — so you always know where you stand.

Everything runs on a smart contract. No company holds your money.

---

## How it works

1. The employer connects their wallet and creates a stream, setting the employee's wallet address, total amount, and how long the stream should run.
2. Cadence calculates the per-second rate and starts streaming USDC immediately.
3. The employee connects their wallet on the employee dashboard and sees their earnings accumulating in real time.
4. The employee clicks **Withdraw** whenever they want. Funds arrive in about 350ms.
5. The employer can top up a stream with more funds, or cancel it at any time (unused funds are returned).

---

## Network

Cadence runs on **Arc Testnet**.

| Setting | Value |
|---|---|
| Network name | Arc Testnet |
| Chain ID | 5042002 |
| RPC URL | https://rpc.testnet.arc.network |
| Block explorer | https://testnet.arcscan.app |
| Currency | USDC |

Add this network to MetaMask manually, or it will be prompted automatically when you connect to the app.

### Deployed contracts

| Contract | Address |
|---|---|
| PayrollManager | `0x667Bc462AA0Bc3e22691F6A638eae330A580D560` |
| USDC (system contract) | `0x3600000000000000000000000000000000000000` |

---

## Running locally

### Requirements

- Node.js 20+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for contract work)
- MetaMask or any browser wallet

### Frontend

```bash
# Install dependencies
npm install

# Create your local env file
echo "NEXT_PUBLIC_PAYROLL_ADDRESS=0x667Bc462AA0Bc3e22691F6A638eae330A580D560" > .env.local

# Start the dev server
npm run dev
```

Open http://localhost:3000.

### Contracts

```bash
# Build
make build

# Run tests
make test

# Simulate a deploy (no broadcast)
make deploy-dry

# Deploy to Arc testnet (requires PRIVATE_KEY and ARC_RPC_URL set in .env)
make deploy
```

---

## Project structure

```
cadence/
├── contracts/
│   ├── src/
│   │   └── PayrollManager.sol    core payroll logic
│   ├── test/
│   │   └── PayrollManager.t.sol  6 Forge tests
│   └── script/
│       └── Deploy.s.sol          deployment script
├── src/
│   ├── app/
│   │   ├── page.tsx              landing page
│   │   ├── employer/page.tsx     employer dashboard
│   │   └── employee/page.tsx     employee dashboard
│   ├── components/
│   │   ├── StreamCard.tsx        per-stream display with live ticker
│   │   ├── CreateStreamModal.tsx new stream form
│   │   ├── TopUpModal.tsx        add funds to a stream
│   │   └── ConnectWallet.tsx     wallet connect / disconnect button
│   ├── hooks/
│   │   └── usePayroll.ts         all wagmi read/write hooks
│   └── lib/
│       ├── contracts.ts          ABIs and addresses
│       ├── chains.ts             Arc testnet chain definition
│       └── utils.ts              USDC formatting, rate conversions
└── Makefile
```

---

## Tech stack

- **Smart contracts** — Solidity, Foundry
- **Frontend** — Next.js 15, TypeScript, Tailwind CSS
- **Wallet / onchain** — wagmi v2, viem, MetaMask
- **Network** — Arc Testnet (Chain ID 5042002, 350ms finality)
- **Hosting** — Vercel

---

## Notes

- USDC on Arc uses **6 decimals** as an ERC-20, even though the network uses USDC as its native gas token (18 decimals internally). All amounts in this app are in 6-decimal USDC.
- Streams can only be created and topped up by the employer who owns them.
- Cancelling a stream returns all unstreamed funds to the employer's wallet.
- The live per-second ticker in the UI is client-side interpolation — it smooths the display between on-chain polls rather than polling the RPC on every animation frame.
