# Murmuration — Handoff Doc

A token-budget allocator (QV / token-weight) for TheDAO Security Fund.
Voters connect a wallet, sign EIP-712 ballots, server stores them with
the signature so anyone can re-verify in their browser. Optional
on-chain Merkle commit at vote close locks the result against tampering.

Public name: **Murmuration**. The repo name (`thedaolog`) is internal.
The product brands as "Murmuration · theDAO's DAO".

This document covers everything DevOps needs to take the project over.

> **Reading order:** scan this doc first for architecture + the audit
> chain. Then read `DEPLOYMENT.md` for the runbook. Sections 11 and 12
> below cover the design + PFP system added 2026-05 — read those before
> shipping.

---

## 1. Architecture in one diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                       browser (any wallet)                        │
│                                                                  │
│   F2App (React)  ──signTypedData──>  RainbowKit + wagmi           │
│        │                                                          │
│        │ fetch /api/proposals, /api/proposals/:id/ballots, etc.  │
└────────┼─────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│  Vite dev server (port 7100)                                      │
│   • serves the SPA                                                │
│   • proxies /api/* → Fastify on :7101                             │
└────────┬─────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│  Fastify API (server/api.mjs, port 7101)                          │
│   • POST /api/proposals/:id/vote → verify EIP-712, balanceOf,     │
│     QV cost, store ballot in data/ballots.json                    │
│   • GET  /api/proposals/:id/ballots → public audit endpoint       │
│   • POST /api/proposals/:id/commit → compute Merkle root, post    │
│     on-chain via deployer wallet                                  │
│   • Optional Pinata integration: pin every ballot to IPFS         │
└────────┬─────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│  Arbitrum One                                                     │
│   • TheDAOSecurityBadge (ERC-721) at 0x32d6…3ac9                  │
│       — eligibility token. balanceOf > 0 = badgeholder            │
│   • TheDAOLogTallyCommit at 0x6b6c…513c                           │
│       — write-once Merkle root registry (one root per proposal)   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Repo layout

```
thedaolog-vite/
├── src/
│   ├── main.tsx           # React entry, WagmiProvider, RainbowKit, WalletGate
│   ├── wagmi.ts           # wagmi config + connector list (Rabby, MetaMask, etc.)
│   ├── eligibility.ts     # token registry + ERC-721 balanceOf helpers
│   ├── votingApi.ts       # frontend client for the ballot API + signing helper
│   └── app.jsx            # AUTO-GENERATED from the design prototype's JSX
├── server/
│   └── api.mjs            # Fastify ballot API
├── contracts/
│   ├── TheDAOSecurityBadge.sol   # ERC-721 badge (eligibility)
│   └── TheDAOLogTallyCommit.sol  # write-once Merkle root registry
├── scripts/
│   ├── deploy-badge.mjs           # deploys the badge contract
│   ├── deploy-tally-commit.mjs    # deploys the commit contract
│   ├── mint-batch-4.mjs           # example mint script
│   └── test-signed-ballot.mjs     # end-to-end EIP-712 sign + post test
├── data/                  # ballots + proposals (JSON), gitignored
├── public/
│   ├── badge-builder.jpg  # NFT image
│   ├── badge.json         # NFT metadata (referenced by tokenURI)
│   ├── brand.css          # design tokens (do not move)
│   └── assets/            # logos
├── build-app.mjs          # regenerates src/app.jsx from upstream
│                            design-prototype JSX (../thedaolog/*.jsx)
├── HANDOFF.md             # this file
├── package.json
└── vite.config.ts         # vite config (proxy /api → :7101, allowedHosts)
```

`src/app.jsx` is **auto-generated** from `../thedaolog/*.jsx` (the
design prototype's static files) by `build-app.mjs`. When the design
team ships a new zip, drop it in `../thedaolog/`, then run:

```bash
node build-app.mjs
```

That regenerates `src/app.jsx` with all our patches re-applied (copy
fixes, on-chain wiring, sign-confirmation UI, verify panel, etc.).
**Don't edit `src/app.jsx` directly** — your changes will be lost on
the next regeneration.

---

## 3. Required secrets

Two operational secrets the production deploy needs. On migration to
real hosting, generate fresh credentials under Giveth ownership — the
testbed values stay on the windows machine and never get handed over.
DEPLOYMENT.md §0a and §4 cover the rotation flow end-to-end.

| Key | Used by | Purpose | Required? |
|---|---|---|---|
| `GITHUB_TOKEN` | scripts/* | Open PRs, accept invites | only for repo automation |
| `PINATA_JWT` | server/api.mjs | Pin every ballot to IPFS for censorship resistance | optional (silently skipped if absent) |
| `DEPLOYER_PRIVATE_KEY` | server/api.mjs | Sign `safeMintBatch` (badges) and `commit` (Merkle root) txs | required for prod |

During the testbed phase only, all of these live in
**`C:\Users\Xerxes\Xerxes-Claude\.secrets\env.json`** and the deployer
key in **`.secrets/thedaolog_deployer.json`** as `{ privateKey, address }`.
The deployer wallet currently holds `MINTER_ROLE` on the badge contract
and is the admin of the TallyCommit contract. See section 5 for the
on-chain handoff and DEPLOYMENT.md §4 for the operational steps.

### Setting up Pinata (3 minutes)

1. Sign up at [app.pinata.cloud](https://app.pinata.cloud) using a
   `giveth.io` email (so DevOps owns the account from day one).
2. Top-right avatar → API Keys → New Key.
3. Name: `thedaolog`. Scope: `Admin`. Click create.
4. Copy the **JWT** (long string starting with `eyJ...`). Pinata also
   shows an `apiKey` + `apiSecret` — ignore those, we only use the JWT.
5. Add to `.secrets/env.json`:
   ```json
   { "PINATA_JWT": "eyJ...rest-of-jwt" }
   ```
6. Restart the API:
   ```powershell
   $pid = (Get-NetTCPConnection -LocalPort 7101 -State Listen).OwningProcess
   Stop-Process -Id $pid -Force
   Start-Process node -ArgumentList "server/api.mjs" `
     -WorkingDirectory "C:\Users\Xerxes\Xerxes-Claude\thedaolog-vite" -WindowStyle Hidden
   ```
7. Every new ballot from this point auto-pins to IPFS. CIDs appear in
   the `/api/proposals/:id/ballots` response.

Free tier covers ~10,000 votes — far more than Giveth's volume. If/when
you outgrow it: Pinata Picnic plan is $20/mo, same JWT.

---

## 4. Local dev / running everything

Prerequisites: Node ≥ 20, pnpm ≥ 9.

```bash
cd thedaolog-vite
pnpm install
```

Two processes need to run:

```bash
# Terminal 1 — Vite dev server (port 7100)
pnpm dev

# Terminal 2 — Fastify ballot API (port 7101)
node server/api.mjs
```

Visit http://127.0.0.1:7100 — Vite proxies `/api/*` to the Fastify
server automatically.

For long-running stay-up on Windows, the existing
`C:\Users\Xerxes\Xerxes-Claude\.scripts\funnel_healthcheck.ps1`
scheduled task (`GreenlightFunnelHealth`, runs every 15 min) checks
both ports and relaunches them if down. See section 7.

---

## 5. Smart contracts on Arbitrum One

| Contract | Address | Purpose |
|---|---|---|
| TheDAOSecurityBadge (ERC-721) | `0x32d664ca9ea4bad60b2b8ed61dec30692df43ac9` | Eligibility token. balanceOf > 0 = badgeholder. |
| TheDAOLogTallyCommit | `0x6b6cefa25fa3ce9623806a86a08c62e24520513c` | Write-once Merkle root registry. One root per proposal, set after vote close. |

Both deployed by the **deployer wallet** at
`0x16D89551D8635341bdB6a3dAEdc57e0ca43C42d4` (key in
`.secrets/thedaolog_deployer.json`).

**Role assignments:**

- TheDAOSecurityBadge:
  - `DEFAULT_ADMIN_ROLE` — held by **`0x72315dddeb862cD484b9F37d37952eC9080557cd`** (Zep's wallet). Can grant/revoke any role.
  - `MINTER_ROLE` — held by the deployer wallet. Used to call `safeMint(addr)` and `safeMintBatch([addrs])`.
- TheDAOLogTallyCommit:
  - `admin` — held by the deployer wallet. Calls `commit(proposalId, root, ballotCount)`. Can `transferAdmin(newAdmin)` or `renounceAdmin()`.

### Handoff: transferring ownership to Giveth

The target ownership model (executed during first deploy, see
DEPLOYMENT.md §4 for the full step-by-step):

- **`griff.eth`** (`0x839395e20bbB182fa440d08F850E6c7A8f6F0780`) becomes
  sole admin on both contracts. He can grant/revoke roles but never
  signs routine ops txs.
- **A fresh Giveth ops wallet** (generated by whoever takes
  operations, e.g. Kay) holds `MINTER_ROLE` on the badge contract and
  signs the periodic `commit` tx on TallyCommit.
- **The xerxes deployer wallet and Zep's admin wallet** hold no roles
  after the transfer. Their key material gets deleted from the testbed.

The xerxes deployer never gets handed to anyone — Giveth ops generates
its own fresh key. After the transfer is verified on Arbiscan and a
smoke-test mint + commit both succeed with the new wallet, Zep deletes
`.secrets/thedaolog_deployer.json` from the windows machine.

---

## 6. The audit chain (what's verifiable, by whom)

| Property | How a third party verifies | Trust assumption |
|---|---|---|
| Each ballot is cryptographically tied to its claimed voter | Re-run `verifyTypedData` from viem against the public `/api/proposals/:id/ballots` data | None — purely cryptographic |
| Voter held a BUIDLER badge at the time of voting | Read `balanceOf(voter)` on the badge contract on Arbiscan | Trusts Arbitrum One (effectively none) |
| Server hasn't dropped a ballot mid-flight | Voter posts their signed ballot publicly; if missing from the audit endpoint, server is caught | Some — voter has to keep their own copy |
| (With Pinata) Server can't make ballots disappear | Anyone fetches CID from any IPFS gateway | Pinata + IPFS network |
| Final tally hasn't been tampered with after close | Compute Merkle root from public ballots, compare to `TheDAOLogTallyCommit.roots(proposalId)` on Arbiscan | Trusts Arbitrum One |

The verify-yourself UI in the dapp does all of these checks
automatically when a viewer expands "Verify signed ballots" on a vote.

---

## 7. Production hosting — current state and the recommended migration

**Current (testbed):** the dapp runs on a Windows machine in
`C:\Users\Xerxes\Xerxes-Claude\thedaolog-vite`, exposed publicly via
Tailscale Funnel at
**https://desktop-dvvupq4.tail301743.ts.net:10000**. Resilience is via
the `GreenlightFunnelHealth` scheduled task that watches the dev
processes + funnel ingress and relaunches them on failure (every 15
min, silent on success). This survives crashes and Windows reboots
(provided autologon is configured) but NOT extended power-off.

**Recommended migration target** for Giveth ownership:

1. Push code to a Giveth-owned GitHub repo (`Giveth/thedaolog`).
2. Deploy to **Railway** (or Render, Fly.io) on hobby tier (~$5-10/mo):
   - Auto-deploys on push to `main`.
   - Persistent volume mounted at `data/` (the JSON storage).
   - Env vars: `PINATA_JWT` and `DEPLOYER_PRIVATE_KEY`. Generate both
     fresh under Giveth ownership (new Pinata account, new EVM key) —
     do NOT extract the testbed values. See DEPLOYMENT.md §0a.
   - Custom domain: `thedaolog.giveth.io` or `vote.thedao.fund`.
3. Update DNS, point users to the new URL.
4. Decommission the Tailscale funnel.

The codebase is platform-agnostic — `pnpm install && pnpm dev` and
`node server/api.mjs` work identically on Linux/macOS. The only
Windows-specific code is the auto-restart script
(`.scripts/funnel_healthcheck.ps1`), which is irrelevant after
migration since Railway handles process supervision.

---

## 8. Common operations

### Running the test signed-ballot end-to-end

```bash
node scripts/test-signed-ballot.mjs
```

Creates a test proposal, signs a ballot with the deployer wallet, posts
it. Expected outcome: 403 `not_a_badgeholder` (deployer doesn't hold a
BUIDLER), proving sig verify + QV check + budget check all PASSED
upstream of the eligibility gate.

### Minting BUIDLER badges to new addresses

```bash
# Edit scripts/mint-batch-4.mjs to set the recipients, then:
node scripts/mint-batch-4.mjs
```

Costs ~$0.01-0.05 per mint on Arbitrum (single safeMintBatch tx).

### Closing a vote + posting on-chain Merkle commit

After the proposal's deadline passes:

```bash
curl -X POST "https://desktop-dvvupq4.tail301743.ts.net:10000/api/proposals/<proposal-id>/commit"
```

Backend computes the Merkle root from canonical-ordered ballots,
submits to TheDAOLogTallyCommit, returns the tx hash.

Once committed, the Verify panel on the dapp shows ✓ "On-chain root
matches" — that's the strongest tampering-resistance proof.

### Triggering the funnel + process auto-heal manually

```powershell
schtasks /Run /TN GreenlightFunnelHealth
# Tail the log:
Get-Content C:\Users\Xerxes\Xerxes-Claude\.scripts\funnel_healthcheck.log -Tail 20
```

---

## 9. Open follow-ups (not built, scoped for later)

- **"Close + commit" admin button in the UI** — currently the on-chain
  commit is triggered via curl. A button in F2Admin would do
  `POST /api/proposals/:id/commit` from the browser. ~30 min.
- **Tally view from IPFS** — VerifyPanel could optionally fetch ballots
  from IPFS gateways instead of the API, exercising the censorship
  resistance. Needs Pinata configured first. ~1h.
- **TallyCommit admin transfer to a Giveth wallet** — see section 5.
- **Cloud migration** — see section 7.

---

## 10. Glossary

- **BUIDLER badge** — the ERC-721 NFT (symbol TDSB) that gates
  voting. Display name in metadata is "Giveth BUIDLER" though the
  on-chain `name()` is "theDAO Security Badge" (handoff cosmetic
  detail, not worth a redeploy).
- **F2** — internal name for the design prototype that became
  TheDAOlog. "Flow 2." All component names are `F2Something`.
- **EIP-712 typed data** — the signing standard used by Snapshot, OpenSea,
  most DeFi. Allows a wallet popup to show structured data instead of
  an opaque hash.
- **QV (Quadratic Voting)** — voting mechanism where N votes on one
  option costs N² credits from a fixed budget. Encourages spreading
  preference rather than going all-in on one option.

---

Maintainer contact during transition: Xerxes (this AI agent, via
Telegram) or Zep / Griff.

---

## 11. Design + brand (added 2026-05)

The app went through a full rebrand to **Murmuration** with a dark-mode
theme aligned to the thedao.fund marketing site.

### Brand palette (`public/brand.css`)

| Token | Value | Use |
|---|---|---|
| `--dao-blue-950` | `#142e4a` | Hero / app background (landing + Murmuration body) |
| `--surface-app` (dark) | `#28567a` | Page background inside the F2App (matches dao-blue from thedao.fund) |
| `--surface-card` (dark) | `#2c5e86` | Raised card surface (vote options, ballot rows) |
| `--surface-elevated` (dark) | `#1f435f` | Recessed surface (header, past-vote cards) |
| `--dao-red` | `#FF3C38` | Primary CTA + accent |
| `--dao-green` | `#5cb75a` | Success states (✓ Murmur on file, status pills) |

The `.dark-app` class on the F2App outermost div swaps the semantic
tokens (`--surface-app`, `--text-primary`, etc.) to the dark variants.
The landing page (`F2Connect`) stays on the deep navy hero treatment
regardless.

### Background flock

The Đ-flock wallpaper (centroid-clustered translucent Đ squares) sits
behind the app content as ambient brand. Safe zones in F2Chrome's
generator skip the spots where text sits directly on the page bg
(left sidebar columns, page heading bands, "Past votes" heading). Adjust
those zones in `flow2-budget.jsx → F2Chrome → _appDaoSquares` if the
layout shifts.

### Favicon + link previews

`public/favicon.png` (256×256, navy rounded-square with the white Eth
diamond) is the tab icon.

`public/og-image.png` (1200×630, landing page screenshot) is the
OpenGraph + Twitter card image. The meta tags in `index.html` reference
both with **relative URLs** (`/favicon.png`, `/og-image.png`). Most
scrapers (Telegram, Slack, Discord) resolve these correctly; Twitter/X
is stricter and wants absolute URLs. After cutover to the production
domain, swap the OG/Twitter image paths to the full
`https://<prod-domain>/og-image.png` URL.

---

## 12. PFP + incognito system (added 2026-05)

Each ETHSecurity Badge holder gets a unique starling NFT-style profile
picture rendered as a circular avatar in the app header (replacing the
old `BADGE HOLDER` text chip). Click the avatar → fullscreen zoom modal.

### Assets

| Path | Purpose |
|---|---|
| `public/assets/pfps/0001.png … 0200.png` | The 200 PFPs (BAYC-style starlings, 512×512 each, ~130 MB total) |
| `public/assets/incognito.png` | The "spy starling" used for anonymous-side wallets |
| `public/assets/pfp-mapping.json` | Frozen `{ lowerAddr: index }` mapping — sorted holders of the ETHSecurity Badge → PFP index 1..200 |
| `public/assets/incognito-addresses.json` | `{ addresses: [...] }` — wallets that render the incognito PFP |

### Assignment rules (resolution order)

1. **Address in `incognito-addresses.json`** → render `/assets/incognito.png`
2. **Address in `pfp-mapping.json`** → render `/assets/pfps/<NNNN>.png` (strict 1:1, no collisions)
3. **Otherwise** → FNV-1a `hash % 200 + 1` fallback. Allows collisions; meant for BUIDLER test wallets + future holder #201+. Switch to the original `RoleChip` fallback before prod cut-over (`flow2-budget.jsx → BadgePfp → "Resolution order"` comment).

### Production eligibility contract

Murmuration currently checks the **BUIDLER** badge on Arbitrum
(`0x32d664...3ac9`, "tok-buidler" in the token registry) — this is the
*test* contract for ongoing dev. For production, swap eligibility to:

| Field | Value |
|---|---|
| Contract | `0xf67c0ade41c607efebf198f9d6065ab1ec5ad4cd` |
| Name | ETHSecurity Badge |
| Symbol | BADGE |
| Chain | Ethereum Mainnet (chainId 1) |
| Holders today | 200 (exactly — 1:1 with the PFP set) |

The swap is one-line: change the default token registry entry in
`flow2-budget.jsx → F2App` (or the API's `KNOWN_ELIGIBILITY_TOKENS` in
`server/api.mjs`). DEPLOYMENT.md §1g walks through the exact diff.

### Refreshing the PFP mapping

If new badges get minted on the ETHSecurity contract (post-200), or if
holder addresses change:

```bash
cd thedaolog-vite
node scripts/build-pfp-mapping.mjs
```

Reads on-chain Transfer events from `0xf67c0a...d4cd`, computes the
sorted-holder list, writes `public/assets/pfp-mapping.json`. Commit +
deploy.

### Adding incognito addresses

When Zep/Griff hand you the decrypted anon-address list from the
ETHSecurity voting badge app, paste them into the `addresses` array
in `public/assets/incognito-addresses.json` (all lowercase):

```json
{
  "addresses": [
    "0xabc...",
    "0xdef..."
  ]
}
```

Commit + deploy. No code changes needed; wallets in this list will
render `incognito.png` instead of their snapshot PFP.
