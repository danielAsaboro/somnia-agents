# Last Wish

## One-Line Pitch
Onchain wills that execute automatically when the LLM committee verifies your obituary appears across mainstream news domains, with optional milestone-conditional disbursements to heirs.

## The Shape
- **Who funds:** The testator (you) deposits assets while alive.
- **What event:** Death of testator (primary); heir life milestones (graduation, marriage, home purchase, child birth) for the Conditional Inheritance Trust variant.
- **What Somnia agent verifies it:** `llm_parse_website` against N family-designated obituary URLs (NYT, Legacy.com, local paper, alumni org). Confidence threshold ≥ 0.95. Allowed values: ["confirmed", "not confirmed", "ambiguous"].
- **What triggers:** Asset distribution (lump sum or milestone tranches), publication of final messages, release of pre-encrypted bundles, charity transfers.

## Why This Was Impossible Before
- Centralized "dead-man's switch" services depend on the service outliving the user.
- Crypto guardianship requires trusted multisig — guardians collude, die, or disappear.
- Legal trusts cost $10k+ to set up and require executor humans paid annually.
- No oracle service is willing to take on "verify someone is dead" liability — the legal exposure on a false positive is enormous.

## How Somnia Specifically Enables It
- Multiple validator GPUs reading the same obituary URLs return byte-identical "confirmed" verdicts → fork-resistant, undisputable.
- Public chain-of-thought receipts → heirs can see exactly which URLs were checked, what HTML was parsed, what the verdict reasoning was.
- The contract outlives the testator with mathematical certainty — no operator can shut it down.
- Self-funding: testator deposits a small gas reserve at setup; contract uses it to pay for periodic verification requests.

## V1 Demo Scope
- Single testator, single beneficiary, single asset (STT)
- One obituary URL pattern (e.g., Legacy.com search)
- Manual trigger: anyone can call `verifyObituary()` after the testator is presumed dead
- Lump sum payout on confirmation

## V1++ Scope (Conditional Inheritance Trust)
- Multiple beneficiaries with per-beneficiary milestone schedules
- Each milestone has its own URL pattern + LLM question + min-confidence
- Tranche release per verified milestone; unclaimed milestones eventually fall back to a default heir or charity

## Sample Flow
1. Testator deploys `LastWish` contract with `{ heirs[], milestones[], obituary_urls[], assets }`.
2. Contract holds STT in escrow.
3. Testator passes away.
4. Anyone (typically an heir) calls `verifyObituary()`.
5. Contract issues a Somnia `llm_parse_website` request to each obituary URL.
6. Subcommittee of 5 validators each fetches HTML, classifies "is testator's obituary present?".
7. Consensus = "confirmed" + confidence ≥ 0.95 → contract marks testator deceased.
8. Distribution unlocks. Heir claims immediately (V1) or claims per milestone (V1++).

## User Personas
- Crypto-wealthy individuals without family lawyers.
- Activists/journalists who want guaranteed-public posthumous statements.
- Anyone burned by a slow probate process.
- Sovereign individuals who don't trust any single legal jurisdiction.
- Families with conditional-inheritance preferences (V1++).

## Research Anchors
- WikiLeaks "insurance file" pattern (precommitted-release crypto)
- Vitalik on social recovery wallets
- Sarcophagus DAO (failed because of trusted-node assumption)
- Casa Inheritance (centralized service)
- Estate-planning industry: $200B+/year in fees globally

## Open Questions
- Which obituary domains are most reliable and least Cloudflare-blocked?
- How to handle false positives when same-name individuals die?
- Should heirs submit additional evidence URLs before claim?
- For V1++, how to handle milestones that never happen (timeout to fallback)?
- Should there be a "challenge window" where the testator can prove they're still alive?

## Implementation

Self-contained Foundry project — shares no build state with NERVE or the other concepts.

- Contract: [`contracts/LastWish.sol`](./contracts/LastWish.sol)
- Tests: [`test/LastWish.t.sol`](./test/LastWish.t.sol)
- Build & test: `cd ideas/last-wish && forge build && forge test`

V1 covers: single testator/heir, single obituary URL, ParseWebsite agent
verification with allowed values `["confirmed", "not confirmed", "ambiguous"]`,
lump-sum claim by heir, testator reset after failed verdict.

## Status
Concept draft v1 + working V1 scaffold, 2026-05-23
# somnia-agents
