# Somnia Projects

This folder is the home for every Solidity project in the workspace:
the active hackathon submission (**NERVE**) plus 5 product concepts
that fit the "Last Wish shape" — a pre-funded contract that releases
or forfeits assets when a Somnia agent deterministically verifies a
real-world event from a public source. Each replaces a slow,
centralized, or bureaucratic human process.

NERVE is the live submission (see also `../submission/` for the PRD,
talking points, demo positioning, and roadmap). The other 5 are
documented for future development, content, and as proof of the
design space the Somnia Agent primitive opens.

Every project here is a **self-contained Foundry workspace** with its
own `foundry.toml`, contracts, tests, and (for the 5 concepts) a local
copy of the Somnia agent interface + mock platform. They share no
build state and can be cloned out individually.

Build and test any one of them:

```
cd ideas/<project-name> && forge build && forge test
```

Combined status as of 2026-05-23: **26/26 tests passing**
(`nerve` 8 · `last-wish` 3 · `promise-bond` 4 · `grant-vesting` 4 ·
`cve-bounty` 3 · `achievement-bounty` 4).

## Projects

| Project | Status | One-line |
|---|---|---|
| [NERVE](./nerve/README.md) | **Live submission** | Autonomous risk desk on Somnia — Foundry contract `RiskDesk` + 4 deterministic TS agents (scout/underwriter/resolver/auditor) that price and resolve event-driven policies via Somnia agent callbacks. |
| [Last Wish](./last-wish/README.md) | Concept + V1 scaffold | Posthumous contracts that execute when the LLM committee verifies your obituary, with optional milestone-conditional disbursements to heirs. |
| [Promise Bond](./promise-bond/README.md) | Concept + V1 scaffold | Pre-commit a stake behind a public promise; LLM verifies the source URL at the deadline; stake returns or forfeits. |
| [Grant Vesting](./grant-vesting/README.md) | Concept + V1 scaffold | Research/OSS grants release in tranches when milestones are publicly verifiable; no human committee. |
| [CVE Bounty](./cve-bounty/README.md) | Concept + V1 scaffold | Security bounties pay automatically when a matching CVE appears on cve.org/NVD; no HackerOne/Immunefi middleman. |
| [Achievement Bounty](./achievement-bounty/README.md) | Concept + V1 scaffold | Anyone pre-funds a reward for someone else's verified personal achievement; pays when the LLM confirms it appears publicly. |

## Shared Pattern

All 5 concepts (and NERVE itself) share four properties:

1. **Pre-funded** — assets are committed up front, not promised after the fact.
2. **Public-event verified** — trigger is a fact observable via a public URL or API.
3. **Deterministic resolution** — Somnia Agent consensus = the same evidence always yields the same verdict.
4. **Replaces a bureaucracy** — lawyers, committees, intermediaries, or trusted operators get cut out.

## Why These Are Somnia-Native

Each project would collapse on:
- Centralized AI APIs (non-deterministic, can't reach consensus)
- Off-chain backends (single point of failure, capturable)
- Existing oracle networks (limited to numeric/structured data)
- ZK-TLS proofs (require provers; brittle on unstructured pages)

Only Somnia's batch-invariant deterministic LLM + public chain-of-thought receipts + self-funding loops make all four practical at once.
