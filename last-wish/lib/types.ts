export type WillStatus =
  | "Active"
  | "VerificationPending"
  | "Confirmed"
  | "Failed"
  | "Claimed";

export interface LastWishSnapshot {
  contractAddress: string;
  testator: string;
  heir: string;
  obituaryUrl: string;
  obituaryQuery: string;
  minConfidencePct: number;
  status: WillStatus;
  requestId: string;
  verdict: string;
  confirmedAt: number;
  balanceWei: string;
  requestDepositWei: string;
  platformAddress: string;
}

export interface PendingTx {
  id: string;
  action: "deploy" | "fund" | "verify" | "claim" | "reset";
  label: string;
  hash?: string;
  status: "awaiting-signature" | "submitted" | "confirmed" | "failed";
  error?: string;
  contractAddress?: string;
}

export interface NetworkConfig {
  name: string;
  chainId: number;
  chainHex: `0x${string}`;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  requestDepositWei: string;
  platformAddress: string;
  defaultWillAddress?: string;
}
