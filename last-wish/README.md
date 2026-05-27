# Last Wish

Standalone Next 16 + TypeScript frontend for the `LastWish` contract in this directory. It is designed for Vercel deployment and talks directly to Somnia Shannon testnet through `ethers` and an injected EIP-1193 wallet.

## What the UI does

- Deploy a new `LastWish` contract from the browser.
- Load and manage any existing deployed `LastWish` contract on Shannon.
- Show the contract lifecycle clearly: `Active`, `VerificationPending`, `Confirmed`, `Failed`, `Claimed`.
- Surface the key estate-specific cautions: demo-only, no legal will substitute, obituary-verification risk.

The Foundry contract remains the source of truth:

- Contract: [`contracts/LastWish.sol`](./contracts/LastWish.sol)
- Tests: [`test/LastWish.t.sol`](./test/LastWish.t.sol)
- ABI used by the UI: [`out/LastWish.sol/LastWish.json`](./out/LastWish.sol/LastWish.json)

## Local development

```bash
cd ideas/last-wish
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

## Environment variables

Client config is public-only in v1. Copy `.env.example` to `.env.local` if needed.

```bash
NEXT_PUBLIC_DEFAULT_WILL_ADDRESS=
NEXT_PUBLIC_SOMNIA_RPC_URL=https://api.infra.testnet.somnia.network/
NEXT_PUBLIC_SOMNIA_EXPLORER_URL=https://shannon-explorer.somnia.network/
NEXT_PUBLIC_SOMNIA_CHAIN_ID=50312
```

Notes:

- `NEXT_PUBLIC_DEFAULT_WILL_ADDRESS` is optional. Leave it blank if you do not want the manage panel to auto-load a contract.
- If the RPC, explorer URL, or chain ID vars are missing, the UI falls back to Shannon defaults.
- No server-side secrets are required for v1.

## Point the UI at an existing deployed will

Two options:

1. Set `NEXT_PUBLIC_DEFAULT_WILL_ADDRESS` before running or deploying the app.
2. Paste a deployed contract address into the manage panel at runtime.

The UI reads:

- `testator`
- `heir`
- `obituaryUrl`
- `obituaryQuery`
- `minConfidencePct`
- `status`
- `requestId`
- `verdict`
- `confirmedAt`
- contract balance

## Wallet and network behavior

- Reads work through the public Shannon RPC, even with no wallet connected.
- Writes require an injected wallet on Somnia Shannon testnet.
- Wrong-network detection is built into the UI, with switch guidance for chain `50312`.

## Vercel deployment

Project settings:

- Root Directory: `ideas/last-wish`
- Install Command: `pnpm install`
- Build Command: `pnpm build`
- Output: default Next.js output

No API routes, backend secrets, or custom server are required for this release.

## Verification

Static checks for the UI:

```bash
pnpm typecheck
pnpm build
```

Contract checks remain available through Foundry:

```bash
forge build
forge test
```
