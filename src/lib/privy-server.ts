import "server-only";

import { PrivyClient } from "@privy-io/server-auth";

/**
 * Server-only Privy client. Uses the app secret, which must NEVER reach the
 * browser bundle — `server-only` makes the build fail loudly if this module is
 * pulled into a client component.
 */
const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;

if (!appId) throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is not set.");
if (!appSecret) throw new Error("PRIVY_APP_SECRET is not set (server-side).");

export const privy = new PrivyClient(appId, appSecret);

export interface Caller {
  /** Privy DID, e.g. did:privy:... */
  privyId: string;
  email: string | null;
  /** Privy's most recently linked wallet, retained for existing user/profile behavior. */
  walletAddress: string | null;
  /** Every verified EVM wallet linked to this Privy user. */
  walletAddresses: string[];
}

function linkedWalletAddresses(user: Awaited<ReturnType<typeof privy.getUser>>): string[] {
  const addresses = user.linkedAccounts
    .filter(
      (account): account is typeof account & { address: string } =>
        (account.type === "wallet" || account.type === "smart_wallet") &&
        typeof account.address === "string"
    )
    .map((account) => account.address.toLowerCase());

  if (user.wallet?.address) addresses.push(user.wallet.address.toLowerCase());
  if (user.smartWallet?.address) addresses.push(user.smartWallet.address.toLowerCase());
  return [...new Set(addresses)];
}

/**
 * Verify the Privy access token on an incoming request and resolve the caller.
 * Reads the bearer token from the Authorization header, verifies its signature
 * against Privy, then fetches the linked email/wallet so we can keep our own
 * users row in sync. Returns null when the request is unauthenticated or the
 * token is invalid/expired — callers should answer 401.
 */
export async function verifyCaller(req: Request): Promise<Caller | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  let userId: string;
  try {
    const claims = await privy.verifyAuthToken(token);
    userId = claims.userId;
  } catch {
    return null;
  }

  // Pull the freshest linked accounts so email/wallet stay current. If this
  // lookup fails we still know who they are from the verified token.
  try {
    const user = await privy.getUser(userId);
    const walletAddresses = linkedWalletAddresses(user);
    return {
      privyId: userId,
      email: user.email?.address ?? null,
      walletAddress: user.wallet?.address ?? null,
      walletAddresses,
    };
  } catch {
    return { privyId: userId, email: null, walletAddress: null, walletAddresses: [] };
  }
}
