# Murmurations — HTTP API

The backend ([`server/api.mjs`](server/api.mjs), Fastify) exposes a
**public read API** plus a set of **signed write endpoints**. Reads need no
auth and are CORS-open. Every write (create a round, submit a direction,
delete a direction, cast a vote) requires an **EIP-712 signature** from the
acting wallet — there are no API keys or sessions, and no funds ever move.

Base URL:
- Production: `https://murmur.thedao.fund/api`
- Staging: `https://desktop-dvvupq4.tail301743.ts.net:10000/api`

`GET /api` returns a live, self-describing index of the endpoints.

---

## Read endpoints (public, no auth)

### `GET /api/proposals`
All rounds (lightweight public view). Soft-deleted options are omitted.
```json
{ "proposals": [ { "id": "r-...", "title": "...", "votingMode": "quadratic",
  "budget": 100, "options": [{ "id": 1, "label": "..." }], "deadline": "ISO",
  "opensAt": "ISO|null", "tokenAddress": "0x..", "tokenChainId": 1,
  "deletedOptionIds": [] } ] }
```

### `GET /api/proposals/:id`
One round, plus the **live tally** (points per option, deleted options
excluded) and the voter count.
```json
{ "proposal": { "...": "...", "deletedOptionIds": [3] },
  "tally": { "1": 12, "2": 7 },
  "voterCount": 5 }
```

### `GET /api/proposals/:id/ballots`
Every signed ballot cast on a round — the audit trail. Each entry is
`{ ballot, signature, signedAt, badgeBalance }`. Anyone can independently
re-verify a signature against `(DOMAIN, Ballot type, ballot, signature)` and
recover the signer.

### `GET /api/proposals/:id/commit` · `GET /api/proposals/:id/local-root`
On-chain Merkle root + count, and the locally-recomputed root, for
independent tally verification.

### `GET /api/health`
`{ "ok": true }`

---

## Write endpoints (EIP-712 signed)

Every write carries a wallet signature that the server verifies with viem's
`verifyTypedData`, recovers the signer, and authorizes. Each signed payload
includes a `nonce` and a `deadline` (~5-minute signing window) to bound
replay. See [EIP-712 signing](#eip-712-signing) for the exact type schemas.

### `POST /api/proposals/:id/vote` — cast a ballot
The vote itself. Body: `{ ballot, signature }` where `ballot` is a signed
`Ballot`. The server independently checks: signature recovers to
`ballot.voter`; the voter is **eligible** for this round (holds the required
badge, read on-chain via `balanceOf`); the round is open (`opensAt`/
`deadline`); and the allocations fit the `budget`. Re-signing **replaces** the
voter's previous ballot for that round. No transaction, nothing spent.

### `POST /api/proposals/:id/options` — submit a direction
Body: `{ label, body, submission, signature, githubUrl? }` where `submission`
is a signed `IssueSubmission`. The server verifies the signature recovers to
`submission.submitter` and that the submitter **holds the round's eligibility
badge** (admins bypass the badge check for setup). Duplicate names are
rejected (`409 duplicate_option`, case/whitespace-insensitive); submissions
after the deadline are rejected (`voting_closed`). The stored option records
`submittedBy`.

### `DELETE /api/proposals/:id/options/:optionId` — remove a direction
Body: `{ optionDeleteAuth }` (a signed `OptionDelete`, with `optionId` inside
the signed payload so a captured signature can't be replayed against a
different option). **Authorized for an admin OR the option's original
`submittedBy`** — the signature is verified to recover to the actor, so it
can't be spoofed. This is a **soft delete**: the option is marked `deleted`
(not erased), so already-cast ballots stay signature-valid; the tally/budget
skip deleted options and voters recover the points they had on them.

### `POST /api/proposals` — create a round (admin)
Body: the round fields + `{ adminAuth }` (a signed `AdminAction`,
`action: "create_proposal"`). The recovered signer must be in the server's
**admin allowlist**.

### `DELETE /api/proposals/:id` — delete a round (admin)
Body: `{ adminAuth }` (`action: "delete_proposal"`). Admin allowlist only.
Removes the round and its ballots.

---

## EIP-712 signing

Domain (off-chain signatures; `chainId` matches the wallet's active chain at
sign time, not where any contract lives):
```
{ name: "murmurations", version: "1", chainId: 1 }
```

Types ([`src/votingApi.ts`](src/votingApi.ts) client side, mirrored in
[`server/api.mjs`](server/api.mjs) server side):

| Type | Used by | Fields |
| --- | --- | --- |
| `Ballot` | cast a vote | `voter`, `proposalId`, `allocations[]` (`{issueId, points}`), `budget`, `deadline`, `nonce` |
| `IssueSubmission` | submit a direction | `submitter`, `proposalId`, `label`, `body`, `nonce`, `deadline` |
| `OptionDelete` | delete a direction | `action`, `proposalId`, `optionId`, `actor`, `nonce`, `deadline` |
| `AdminAction` | create/delete a round | `action`, `proposalId`, `actor`, `nonce`, `deadline` |

Replay/abuse protection: every payload carries a `nonce` (timestamp) and a
`deadline` (~5 min); `OptionDelete` binds the `optionId`; the server
re-derives eligibility and budget rather than trusting client claims.

---

## Auth model at a glance

| Action | Signature | Who's authorized |
| --- | --- | --- |
| Read anything | none | anyone |
| Cast / change a vote | `Ballot` | any wallet eligible for the round |
| Submit a direction | `IssueSubmission` | any wallet holding the round's badge (admins bypass) |
| Delete a direction | `OptionDelete` | the direction's creator, or an admin |
| Create / delete a round | `AdminAction` | admin allowlist only |

## Quick examples
```bash
curl https://murmur.thedao.fund/api/proposals
curl https://murmur.thedao.fund/api/proposals/r-abc123
```
