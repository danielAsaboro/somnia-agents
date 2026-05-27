import { ethers } from "ethers";

export function shortAddress(value: string, head = 6, tail = 4) {
  if (!value) return "Unknown";
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function shortHash(value: string) {
  return shortAddress(value, 10, 8);
}

export function formatStt(wei: bigint | string, digits = 4) {
  const value = typeof wei === "string" ? BigInt(wei) : wei;
  const formatted = Number(ethers.formatEther(value));
  if (!Number.isFinite(formatted)) return "0";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(formatted);
}

export function formatDateTime(timestampSeconds: number) {
  if (!timestampSeconds) return "Not yet confirmed";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZoneName: "short",
  }).format(new Date(timestampSeconds * 1000));
}

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
