import { Contract, ContractFactory, ethers, JsonRpcProvider } from "ethers";
import artifact from "../out/LastWish.sol/LastWish.json";
import { networkConfig } from "./config";
import type { LastWishSnapshot, WillStatus } from "./types";

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

const statusMap: WillStatus[] = [
  "Active",
  "VerificationPending",
  "Confirmed",
  "Failed",
  "Claimed",
];

export const lastWishAbi = artifact.abi;
export const lastWishBytecode = artifact.bytecode.object;

export const shannonProvider = new JsonRpcProvider(networkConfig.rpcUrl, {
  chainId: networkConfig.chainId,
  name: networkConfig.name,
});

export function getStatusLabel(index: number) {
  return statusMap[index] ?? "Active";
}

export function getLastWishContract(address: string, runner: ethers.ContractRunner) {
  return new Contract(address, lastWishAbi, runner);
}

export function getLastWishFactory(signer: ethers.Signer) {
  return new ContractFactory(lastWishAbi, lastWishBytecode, signer);
}

export async function readLastWishSnapshot(address: string) {
  const normalized = ethers.getAddress(address);
  const code = await shannonProvider.getCode(normalized);
  if (code === "0x") {
    throw new Error("No contract bytecode found at that address on Shannon.");
  }

  const contract = getLastWishContract(normalized, shannonProvider);
  const [
    testator,
    heir,
    obituaryUrl,
    obituaryQuery,
    minConfidencePct,
    statusValue,
    requestId,
    verdict,
    confirmedAt,
    balance,
    requestDeposit,
    platformAddress,
  ] = await Promise.all([
    contract.testator(),
    contract.heir(),
    contract.obituaryUrl(),
    contract.obituaryQuery(),
    contract.minConfidencePct(),
    contract.status(),
    contract.requestId(),
    contract.verdict(),
    contract.confirmedAt(),
    shannonProvider.getBalance(normalized),
    contract.REQUEST_DEPOSIT(),
    contract.PLATFORM(),
  ]);

  const snapshot: LastWishSnapshot = {
    contractAddress: normalized,
    testator: ethers.getAddress(testator as string),
    heir: ethers.getAddress(heir as string),
    obituaryUrl: String(obituaryUrl),
    obituaryQuery: String(obituaryQuery),
    minConfidencePct: Number(minConfidencePct),
    status: getStatusLabel(Number(statusValue)),
    requestId: BigInt(requestId).toString(),
    verdict: String(verdict),
    confirmedAt: Number(confirmedAt),
    balanceWei: balance.toString(),
    requestDepositWei: BigInt(requestDeposit).toString(),
    platformAddress: ethers.getAddress(platformAddress as string),
  };

  return snapshot;
}

export function isWalletAvailable() {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

export async function requestAccounts() {
  const accounts = await window.ethereum?.request({ method: "eth_requestAccounts" });
  return Array.isArray(accounts) ? (accounts as string[]) : [];
}

export async function readAccounts() {
  const accounts = await window.ethereum?.request({ method: "eth_accounts" });
  return Array.isArray(accounts) ? (accounts as string[]) : [];
}

export async function readChainId() {
  const chain = await window.ethereum?.request({ method: "eth_chainId" });
  if (typeof chain !== "string") return undefined;
  return Number.parseInt(chain, 16);
}

export async function getWalletSigner() {
  if (!window.ethereum) {
    throw new Error("No injected wallet found. Open this page in a wallet-enabled browser.");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const network = await provider.getNetwork();
  return {
    provider,
    signer,
    address: await signer.getAddress(),
    chainId: Number(network.chainId),
  };
}

export async function switchToShannon() {
  if (!window.ethereum) {
    throw new Error("No injected wallet found.");
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: networkConfig.chainHex }],
    });
    return;
  } catch (error) {
    const message = extractErrorMessage(error);
    if (!message.includes("4902") && !message.toLowerCase().includes("unrecognized chain")) {
      throw error;
    }
  }

  await window.ethereum.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: networkConfig.chainHex,
        chainName: networkConfig.name,
        nativeCurrency: networkConfig.nativeCurrency,
        rpcUrls: [networkConfig.rpcUrl],
        blockExplorerUrls: [networkConfig.explorerUrl],
      },
    ],
  });
}

export function isUserRejected(error: unknown) {
  const message = extractErrorMessage(error).toLowerCase();
  return message.includes("user rejected") || message.includes("4001");
}

export function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybe = error as { shortMessage?: string; message?: string; reason?: string };
    return maybe.shortMessage ?? maybe.reason ?? maybe.message ?? "Unknown error";
  }
  return "Unknown error";
}
