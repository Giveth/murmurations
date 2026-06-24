# Security overview (for reviewers)

This guide orients a security reviewer: what the app does, what it trusts,
where the security-critical code is, and how to report a finding.

## One-line premise

Murmurations is a **governance signaling** app. It holds and moves **no
funds**. Its job is to collect wallet-signed opinions ("ballots") from
**eligible** wallets and tally them. So the security surface is:

1. **Are signatures verified correctly?** (a forged/replayed signature must
   not count as a vote or an authorized action)
2. **Is eligibility enforced server-side?** (the client UI is convenience —
   the server must independently decide who may vote/submit/delete)
3. **Is the tally honest?** (budget math, soft-deletes, no double-counting)

## In scope

- EIP-712 signature verification and the type schemas — client
  [`src/votingApi.ts`](src/votingApi.ts), server
  [`server/api.mjs`](server/api.mjs) (`verifyAdminAction`,
  `verifyOptionDelete`, the `IssueSubmission`/`Ballot` verification).
- Eligibility — server-side badge `balanceOf` reads and the per-round gate;
  client mirror in [`src/eligibility.ts`](src/eligibility.ts) and
  `canVoteInRound` in [`src/app.jsx`](src/app.jsx).
- Write endpoints — `/vote`, `/options` (POST/DELETE), `/proposals`
  (POST/DELETE). See [API.md](API.md).
- Tally + budget integrity — quadratic/token-weight math, the duplicate
  guard, and soft-delete (deleted options must not break already-signed
  ballots or escape the budget).
- Authorization — admin allowlist; creator-or-admin option deletion.

## Out of scope / external trust

- The eligibility **badge ERC-721 contracts** are external, already deployed;
  the app only reads `balanceOf`. Their internals aren't this repo.
- **RPC providers** are trusted to return honest chain reads.
- **Infrastructure/deploy** (the VPS, Docker, Caddy, GHCR) — see
  [DEPLOYMENT_GHCR.md](DEPLOYMENT_GHCR.md).
- The optional on-chain **TallyCommit** contract anchors a finalized root;
  the live tally is derived from the stored signed ballots regardless.

## Trust assumptions (by design)

- Admins are a server-side allowlist; an admin can create/delete rounds and
  delete any option.
- A round names an eligibility token/badge; holding it (read on-chain) is what
  grants voting/submission rights for that round.
- Every signed payload carries a `nonce` + short `deadline` to bound replay;
  `OptionDelete` binds the `optionId` it authorizes.
- Soft-delete is intentional: removing an option preserves prior ballots'
  signatures and refunds the points to voters.

## Where to start

1. `server/api.mjs` — the `/vote` handler and the three verify helpers. This
   is where a forged/replayed signature or a missing eligibility re-check
   would bite hardest.
2. The client/server **eligibility agreement** — `canVoteInRound`
   (`src/app.jsx`) vs the server's badge check. A mismatch (client says yes,
   server says no, or vice versa) is the kind of bug we've fixed before.
3. Budget + soft-delete math — confirm allocations can't exceed budget and
   deleted options can't double-count or strand points.

## Naming note

The repository is being renamed `thedaolog` → `murmurations`. A few
load-bearing names still read `thedaolog` on purpose (the Postgres database
name, the GHCR image names, the deploy workflow) — those are infra, not
product, and changing them is a migration, not a rename. The EIP-712 signing
domain is already `murmurations`. See the README for details.

## Reporting

Please report findings privately to the maintainers rather than opening a
public issue, and allow time to remediate before any disclosure. Include the
affected file/endpoint, a reproduction, and the impact.
