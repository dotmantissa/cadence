import { waitForTransactionReceipt } from "@wagmi/core";
import type { Config } from "wagmi";
import type { Hash } from "viem";

/** Wait for inclusion and turn an on-chain revert into a client-side failure. */
export async function waitForSuccessfulReceipt(config: Config, hash: Hash) {
  const receipt = await waitForTransactionReceipt(config, { hash });
  if (receipt.status !== "success") {
    throw new Error("Transaction reverted on-chain");
  }
  return receipt;
}
