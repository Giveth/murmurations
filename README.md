# Murmuration — theDAO/log

Governance signalling for [TheDAO](https://thedao.fund) Security Fund badge
holders. Murmuration lets the ETHSecurity Badge holders coordinate on the
direction of TheDAO: they propose security issues and directions ("murmurs")
and allocate a credit budget across them with **quadratic** or
**token-weight** voting. Every ballot is a wallet-signed EIP-712 message, and
each round's result is anchored on-chain as a Merkle root so anyone can verify
the tally independently.

**Live:** https://murmur.thedao.fund

---

## How it works

- **Wallet-gated roles.** Your role is derived from the connected wallet: an
  on-chain `balanceOf` read against the eligibility token decides whether you're
  a *badge holder*; a hardcoded allowlist marks *admins*; everyone else is a
  *visitor*. No accounts, no passwords.
- **Signed ballots.** Casting a vote produces an EIP-712 typed-data signature
  over your allocations. The server re-verifies the signature, re-checks badge
  eligibility on-chain, and validates the budget before storing the ballot.
- **Quadratic or token-weight.** Each round picks a mode. In QV every extra
  point on an option costs more; in token-weight 1 vote = 1 credit.
- **Verifiable tallies.** After a round closes, the canonical set of ballots is
  hashed into a Merkle root and committed to the `TheDAOLogTallyCommit`
  contract. The app can re-derive the root in your browser and compare it
  against the chain — tampering shows up as a mismatch.
- **Identity PFPs + incognito mode.** Badge holders get a deterministic
  profile picture; anonymous voters (the ones derived through the ETHSecurity
  voting-badge app) render an incognito avatar instead.

## Tech stack

| Layer        | Tech                                                            |
| ------------ | -------------------------------------------------------------- |
| Frontend     | React 18, Vite, wagmi, viem, RainbowKit, TanStack Query        |
| Backend      | Fastify (Node, ESM), `@fastify/cors`                            |
| Storage      | PostgreSQL (`pg`)                                               |
| Chain        | Arbitrum One (eligibility + tally commits), Ethereum mainnet (PFP identity) |
| Contracts    | Solidity + OpenZeppelin (ERC-721 + AccessControl)              |
| Pinning      | Pinata (IPFS, optional)                                         |
| Tests        | Vitest + Testing Library + jsdom                                |
| Deploy       | Docker Compose + Caddy, images on GHCR                          |

## Architecture

```
Browser (Vite SPA)
   │  signs EIP-712 ballots, reads balanceOf on-chain
   ▼
Fastify API  (server/api.mjs, :7101)
   │  verifies signatures + eligibility, stores ballots
   ├─► PostgreSQL              (server/db.mjs — proposals + ballots)
   ├─► Pinata / IPFS           (optional ballot pinning)
   ├─► GitHub                  (optional: import/export issues)
   └─► Arbitrum One            (Merkle-root commits, badge reads)
```

In production, **Caddy** terminates TLS, serves the built SPA, and
reverse-proxies `/api/*` to the Fastify container. In development, Vite (`:7100`)
proxies `/api` to the local Fastify server (`:7101`).

## Repository layout

```
src/                 React SPA (main.tsx wallet gate, app.jsx UI, eligibility, votingApi)
server/              Fastify API (api.mjs) + Postgres layer (db.mjs)
contracts/           TheDAOSecurityBadge.sol, TheDAOLogTallyCommit.sol
source-jsx/          Design-prototype JSX that build-app.mjs compiles into src/app.jsx
scripts/             Deploy / mint / migration / verification scripts
public/assets/       PFPs, portraits, brand assets, on-chain mapping snapshots
tests/               Vitest suites (server/ + client/)
API.md               Public read-API reference
TESTING.md           Test suite docs
DEPLOYMENT_GHCR.md   Production deploy via GHCR + Docker Compose
```

## Getting started

### Prerequisites

- Node 20+ and [pnpm](https://pnpm.io) 9 (`packageManager` is pinned in `package.json`)
- Docker (for local Postgres) — or your own Postgres instance

### Install

```bash
pnpm install
```

### Configure

```bash
cp .env.example .env
# edit .env — at minimum DATABASE_URL; integrations (Pinata, GitHub,
# deployer key) are optional and disabled when left blank.
```

### Run (development)

```bash
pnpm db:up      # start local Postgres (docker compose) on host port 15432
pnpm server     # Fastify API on :7101
pnpm dev        # Vite SPA on :7100  (proxies /api → :7101)
```

Open http://127.0.0.1:7100 and connect a wallet.

### Build

```bash
pnpm build      # production SPA build into dist/
pnpm start      # serve the API (server/api.mjs)
```

## Testing

```bash
pnpm test            # run the suite once
pnpm test:watch      # watch mode
pnpm test:coverage   # coverage report (text + HTML in ./coverage)
```

No database or wallet is needed — Postgres, on-chain reads, IPFS, GitHub, and
the wallet client are all mocked, while EIP-712 signatures use real viem test
keys so verification is genuinely exercised. See [TESTING.md](./TESTING.md) for
the full breakdown.

## Smart contracts

Compiled with `solc` from `contracts/` and deployed via the scripts in
`scripts/`. Current deployments:

| Contract                  | Chain         | Address |
| ------------------------- | ------------- | ------- |
| TheDAOSecurityBadge (ERC-721, eligibility) | Arbitrum One  | `0x32d664ca9ea4bad60b2b8ed61dec30692df43ac9` |
| TheDAOLogTallyCommit (Merkle root registry) | Arbitrum One  | `0x6b6cefa25fa3ce9623806a86a08c62e24520513c` |
| ETHSecurity Badge (PFP identity)            | Ethereum mainnet | `0xf67c0ade41c607efebf198f9d6065ab1ec5ad4cd` |

Holding ≥1 eligibility badge (`balanceOf > 0`) makes a wallet a badge holder.
`TheDAOLogTallyCommit` is a write-once registry: one Merkle root per proposal,
set after the vote closes.

## API

The read API is public and CORS-open — no auth required to read proposals,
tallies, ballots, and on-chain commit status. Write paths require a
wallet-signed ballot. Full reference in [API.md](./API.md):

```bash
curl https://murmur.thedao.fund/api/proposals
```

## Deployment

Production images are built on GitHub Actions, pushed to GHCR, and rolled out to
the VPS via Docker Compose (Caddy + app + Postgres). See
[DEPLOYMENT_GHCR.md](./DEPLOYMENT_GHCR.md).

## License

No license has been declared yet. Until one is added, all rights are reserved —
add a `LICENSE` file before relying on this code in other projects.
