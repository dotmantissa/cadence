/**
 * Compare an on-chain participant address with addresses verified by Privy.
 * The caller-supplied address is never used to build this list.
 */
export function hasVerifiedWallet(
  walletAddresses: readonly string[],
  address: string
): boolean {
  const target = address.toLowerCase();
  return walletAddresses.some((wallet) => wallet.toLowerCase() === target);
}
