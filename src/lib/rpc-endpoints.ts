/**
 * Arc testnet JSON-RPC upstreams, used ONLY on the server (the `/api/rpc` proxy
 * and any SSR read). The browser never sees these hostnames — see the note below.
 *
 * Why a server-side list at all:
 *  - Circle's primary `rpc.testnet.arc.io` answers POSTs fine server-side but does
 *    NOT pass the browser CORS preflight, so it cannot be called from the client.
 *  - The provider mirrors (`rpc.<provider>.testnet.arc.io`) DO pass preflight, but
 *    their third-party subdomains match ad-blocker / privacy filter lists
 *    (EasyPrivacy et al.), so real users' extensions kill the requests with
 *    net::ERR_BLOCKED_BY_CLIENT — the app then renders blank, flaky cards.
 *
 * The fix: the browser talks only to same-origin `/api/rpc`, which forwards here
 * server-side. No CORS preflight (same-origin), no third-party host to block. So
 * the ORDER here is by raw server-side robustness, not browser-friendliness:
 * Circle primary first, then the mirrors as fallback. quicknode is fastest but the
 * only one that 429s under bursts, so it sits last.
 */
export const ARC_RPC_UPSTREAMS = [
  "https://rpc.testnet.arc.io",
  "https://rpc.blockdaemon.testnet.arc.io",
  "https://rpc.drpc.testnet.arc.io",
  "https://rpc.quicknode.testnet.arc.io",
] as const;

/**
 * The RPC URL(s) any client (wagmi transport, viem public client, Privy's embedded
 * wallet client) should use, resolved per-environment:
 *
 *  - In the BROWSER: a single same-origin `/api/rpc` (absolute, so viem's internal
 *    `new URL(...)` validation is happy). This is the whole fix — the browser never
 *    names a third-party RPC host, so nothing an extension blocks and no CORS
 *    preflight. Broadcasts from an EXTERNAL wallet don't come through here; wagmi
 *    routes those via the wallet's own provider/RPC.
 *  - On the SERVER (SSR/prerender): the direct upstreams. The server has neither a
 *    CORS restriction nor an ad-blocker, so it talks to Arc straight.
 *
 * Evaluated at call time so each environment gets the right value.
 */
export function browserSafeRpcHttp(): string[] {
  if (typeof window !== "undefined") {
    return [`${window.location.origin}/api/rpc`];
  }
  return [...ARC_RPC_UPSTREAMS];
}
