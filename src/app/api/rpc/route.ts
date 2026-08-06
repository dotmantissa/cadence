import { NextResponse } from "next/server";
import { ARC_RPC_UPSTREAMS } from "@/lib/rpc-endpoints";

// Server-side fetch to public Arc RPC — always dynamic, Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin JSON-RPC relay for the BROWSER READ PATH.
 *
 * The client (wagmi/viem public client) POSTs its JSON-RPC here instead of to an
 * Arc RPC host directly. Why: the Circle primary fails browser CORS preflight, and
 * the provider-mirror subdomains match ad-blocker filter lists → the browser kills
 * them with net::ERR_BLOCKED_BY_CLIENT and every read starves (blank/flaky cards).
 * A first-party path escapes both: no preflight (same origin) and no third-party
 * host for an extension to block. Server→RPC has neither restriction.
 *
 * Scope — this relay carries ONLY:
 *   (a) the app's public reads (eth_call/eth_getBalance/multicall/… view traffic), and
 *   (b) embedded (Privy) wallet broadcasts, which already run on our own infra.
 * It is NOT a router for external wallets. In wagmi, an injected/external signer's
 * writes go through that wallet's own EIP-1193 provider and its own RPC — they
 * never reach this endpoint, and no user ever changes their wallet's RPC settings.
 *
 * It only ever forwards to the fixed ARC_RPC_UPSTREAMS, so it can't be abused as an
 * open relay to arbitrary hosts. The body is passed through verbatim, so single and
 * batched (array) JSON-RPC requests both work unchanged.
 */
export async function POST(req: Request) {
  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 }
    );
  }

  let lastStatus = 502;
  for (const upstream of ARC_RPC_UPSTREAMS) {
    const controller = new AbortController();
    // Per-upstream ceiling: if one host is slow/hung, fall through to the next
    // rather than making the browser wait out a single dead endpoint.
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(upstream, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: controller.signal,
        // Never let Next cache RPC responses — chain state changes every block.
        cache: "no-store",
      });
      clearTimeout(timer);

      if (!res.ok) {
        // 429 / 5xx from this provider → try the next one.
        lastStatus = res.status;
        continue;
      }

      const text = await res.text();
      return new NextResponse(text, {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    } catch {
      clearTimeout(timer);
      // Network error / abort → try the next upstream.
      continue;
    }
  }

  // Every upstream failed. Shape the error as JSON-RPC so viem surfaces it cleanly
  // instead of throwing on an unparseable body.
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: "All Arc RPC upstreams failed" },
    },
    { status: lastStatus >= 400 ? lastStatus : 502 }
  );
}
