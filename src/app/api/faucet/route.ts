import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { requireUser, badRequest } from "../_auth";

// Auth relies on runtime headers, so this is always dynamic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Circle's testnet faucet drip endpoint + Arc's blockchain enum value. */
const CIRCLE_DRIPS_URL = "https://api.circle.com/v1/faucet/drips";
const ARC_BLOCKCHAIN = "ARC-TESTNET";

/**
 * One-click testnet funding. When `CIRCLE_API_KEY` is configured, this asks
 * Circle to drip USDC to the caller's wallet on Arc Testnet and the user never
 * leaves the app. When no key is set — or Circle declines (its drips API is
 * gated behind a mainnet-upgraded account) — we answer `{ fallback: true }` so
 * the client opens the public faucet (faucet.circle.com) with the address ready
 * to paste. Either way the button always does something useful.
 *
 * Auth-gated so an anonymous caller can't burn our faucet key or rate limit.
 * POST `{ address }` →
 *   `{ dripped: true }`            — funded server-side, no redirect
 *   `{ rateLimited: true }`        — Circle says this address was funded recently
 *   `{ fallback: true, reason }`   — client should open the public faucet
 */
export async function POST(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("expected a JSON body");
  }
  const address = (body as { address?: unknown })?.address;
  if (typeof address !== "string" || !isAddress(address)) {
    return badRequest("a valid wallet address is required");
  }

  const key = process.env.CIRCLE_API_KEY;
  // No server credential → tell the client to use the public faucet instead.
  if (!key) {
    return NextResponse.json({ fallback: true, reason: "faucet-unconfigured" });
  }

  try {
    const res = await fetch(CIRCLE_DRIPS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        address,
        blockchain: ARC_BLOCKCHAIN,
        // USDC is Arc's native gas token, so `native` funds spendable balance;
        // `usdc` covers the optional ERC-20 view of the same asset.
        native: true,
        usdc: true,
      }),
    });

    // Circle returns 2xx with an empty body on a successful drip.
    if (res.ok) {
      return NextResponse.json({ dripped: true });
    }

    // Rate-limited: this address was funded recently (20 USDC / 2h per chain).
    // Report it as a 200 app-level signal so the client can show a friendly note
    // rather than treating it as a hard error.
    if (res.status === 429) {
      return NextResponse.json({ rateLimited: true, reason: "rate-limited" });
    }

    // Anything else (401/403 mainnet gate, other 4xx/5xx) → public-faucet fallback.
    return NextResponse.json({ fallback: true, reason: `circle-${res.status}` });
  } catch {
    // Network/timeout talking to Circle → fallback rather than a dead button.
    return NextResponse.json({ fallback: true, reason: "circle-unreachable" });
  }
}
