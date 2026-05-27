import { ethers } from "ethers";
import type { NetworkConfig } from "./types";

const defaultChainId = 50_312;
const configuredChainId = Number(process.env.NEXT_PUBLIC_SOMNIA_CHAIN_ID ?? defaultChainId);
const chainId = Number.isFinite(configuredChainId) ? configuredChainId : defaultChainId;

export const networkConfig: NetworkConfig = {
  name: "Somnia Shannon Testnet",
  chainId,
  chainHex: `0x${chainId.toString(16)}`,
  rpcUrl:
    process.env.NEXT_PUBLIC_SOMNIA_RPC_URL ?? "https://api.infra.testnet.somnia.network/",
  explorerUrl:
    process.env.NEXT_PUBLIC_SOMNIA_EXPLORER_URL ?? "https://shannon-explorer.somnia.network/",
  nativeCurrency: {
    name: "Somnia Test Token",
    symbol: "STT",
    decimals: 18,
  },
  requestDepositWei: ethers.parseEther("0.12").toString(),
  platformAddress: "0x7407cb35a17D511D1Bd32dD726ADb8D5344ECbE3",
  defaultWillAddress: process.env.NEXT_PUBLIC_DEFAULT_WILL_ADDRESS || undefined,
};
