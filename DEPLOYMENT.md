# theDAO/log — Deployment Guide for Kay

This is the operator's runbook for taking the dapp from the current
testbed (Tailscale Funnel on a Windows machine) to production hosting
under Giveth ownership. Pair this with `HANDOFF.md`, which covers the
architecture and the verification model — this doc is the deploy-day
walkthrough.

The recommended target is **Railway** (~$5–10/mo, hobby tier), but the
checklist applies to Render or Fly.io with minor wording changes. The
app is platform-agnostic Node 20 + pnpm.

---

## 0. What you'll receive in the handover package

Zep will get you:

1. **GitHub access** — push rights to a Giveth-owned repo. If the repo
   doesn't exist yet, mirror `thedaolog-vite` to `Giveth/thedaolog`
   (or similar). Don't include `node_modules`, `.secrets`, or `data/`.
2. **Two secrets** (paste into the host's secret manager, never commit):
   - `PINATA_JWT` — Pinata key, current value in the testbed's
     `.secrets/env.json`. See HANDOFF.md §3 if you want to re-issue a
     fresh JWT under a Giveth-owned Pinata account, which is the
     cleaner option.
   - `DEPLOYER_PRIVATE_KEY` — the deployer/minter wallet's private
     key (current value at
     `0x16D89551D8635341bdB6a3dAEdc57e0ca43C42d4`, key file
     `.secrets/thedaolog_deployer.json`). You will replace this wallet
     during cleanup, but it stays in use until you do.
3. **Decision: domain** — confirm with Zep/Griff which subdomain to
   point at the deploy. Plausible options: `thedaolog.giveth.io`,
   `log.thedao.fund`, `vote.thedao.fund`. DNS changes go through
   whoever holds the parent domain.
4. **Decision: who replaces the deployer wallet** — generate a Giveth
   ops wallet (Safe multisig recommended, or a single-sig burner if
   you want lower friction for the periodic `commit` tx). You'll
   transfer the on-chain roles to this wallet at the end.

---

## 1. Required code changes before deploying

The current `server/api.mjs` reads two secrets from hardcoded Windows
file paths. Three small patches make it cloud-portable while preserving
local-dev behavior. Do these on a feature branch and PR them before
your first deploy.

### 1a. `server/api.mjs` — read `PINATA_JWT` from env first

Around line 90:

```diff
 async function loadPinataJwt() {
   if (_pinataJwt !== null) return _pinataJwt;
+  if (process.env.PINATA_JWT) {
+    _pinataJwt = process.env.PINATA_JWT;
+    return _pinataJwt;
+  }
   try {
     const { readFile } = await import("node:fs/promises");
     const env = JSON.parse(await readFile("C:/Users/Xerxes/Xerxes-Claude/.secrets/env.json", "utf8"));
     _pinataJwt = env.PINATA_JWT || "";
   } catch {
     _pinataJwt = "";
   }
   return _pinataJwt;
 }
```

### 1b. `server/api.mjs` — read deployer key from env first

Around line 218:

```diff
 async function getDeployerAccount() {
   if (_deployerAccount) return _deployerAccount;
+  if (process.env.DEPLOYER_PRIVATE_KEY) {
+    _deployerAccount = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
+    return _deployerAccount;
+  }
   const keyFile = "C:\\Users\\Xerxes\\Xerxes-Claude\\.secrets\\thedaolog_deployer.json";
   const { readFile } = await import("node:fs/promises");
   const { privateKey } = JSON.parse(await readFile(keyFile, "utf8"));
   _deployerAccount = privateKeyToAccount(privateKey);
   return _deployerAccount;
 }
```

### 1c. `server/api.mjs` — bind to `0.0.0.0` on the host

Last line of the file:

```diff
-await app.listen({ port: PORT, host: "127.0.0.1" });
+await app.listen({ port: PORT, host: process.env.HOST ?? "127.0.0.1" });
```

On Railway/Render/Fly, set `HOST=0.0.0.0`. Locally, omit it and you
stay on loopback like today.

### 1d. Static file serving (decide one of two paths)

The current Fastify API only serves `/api/*`. The Vite SPA is a
separate dev process. In production you have two reasonable options.

**Option A — single Node service serves everything (simpler, recommended for first deploy).**

Add `@fastify/static` to `dependencies`:

```bash
pnpm add @fastify/static
```

Append to `server/api.mjs` *before* the `app.listen` call:

```js
if (process.env.NODE_ENV === "production") {
  const { default: fastifyStatic } = await import("@fastify/static");
  await app.register(fastifyStatic, {
    root: path.join(ROOT, "dist"),
    prefix: "/",
  });
  app.setNotFoundHandler((_req, reply) => reply.sendFile("index.html"));
}
```

Then `pnpm build` (produces `dist/`) and run `NODE_ENV=production node server/api.mjs`. One port, one process.

**Option B — split into two services (SPA on Cloudflare Pages / Vercel, API on Railway).**

Frontend deploys statically to a CDN, API runs on a Node host, and the SPA proxies `/api/*` to the API host via a `_redirects` file or platform routing. Faster page loads but more moving parts. Pick this only if you want the CDN benefits.

The rest of this guide assumes Option A.

### 1e. Add a `start` script to `package.json`

```diff
 "scripts": {
   "dev": "vite --port 7100 --host 127.0.0.1",
   "build": "vite build",
+  "start": "node server/api.mjs",
   "preview": "vite preview --port 7100 --host 127.0.0.1"
 }
```

Railway and most platforms look for `pnpm start` by convention.

### 1f. Pin Node version

```diff
+"engines": {
+  "node": ">=20 <23"
+},
 "scripts": { ... }
```

Same Node major across testbed and prod avoids surprises.

---

## 2. Railway deploy (concrete steps)

Assuming Option A above (single service).

1. **Project**: railway.com → New Project → Deploy from GitHub repo →
   pick the Giveth thedaolog repo.

2. **Build & start commands**: Railway auto-detects pnpm from
   `pnpm-lock.yaml`. Confirm in Settings:
   - Build: `pnpm install --frozen-lockfile && pnpm build`
   - Start: `pnpm start`

3. **Environment variables** (Settings → Variables):
   ```
   NODE_ENV=production
   HOST=0.0.0.0
   PORT=7101
   PINATA_JWT=eyJ...                # the JWT
   DEPLOYER_PRIVATE_KEY=0x...       # the deployer key (no quotes)
   ```
   Railway also auto-injects its own `PORT` for routing; the line
   above is a default for when you run locally with the same env.

4. **Persistent volume**: Settings → Volumes → Add. Mount at `/app/data`
   (or wherever your repo root + `data/` resolves to in the container).
   Size: 1 GB is overkill but cheapest. The current testbed is using
   ~8 KB of ballot/proposal JSON. You will outgrow this only if you
   end up storing tens of thousands of ballots — which would also be
   the signal to migrate to Postgres (see HANDOFF.md §10).

5. **Custom domain**: Settings → Domains → Add custom domain. Paste
   the chosen subdomain. Railway returns a CNAME target — give that
   to whoever holds the parent DNS (Giveth's Cloudflare or similar).
   Railway issues a Let's Encrypt cert automatically once the CNAME
   resolves.

6. **First deploy**: push to `main`. Watch the build logs. The build
   step runs `vite build` and outputs `dist/`. The start step boots
   Fastify which now serves both `/api/*` and the SPA.

7. **Smoke test on the live URL**:
   - Open the domain → should load the WalletGate.
   - Connect a wallet that holds a BUIDLER badge → should land on
     `F2App`.
   - Open a proposal, cast a test vote, sign in the wallet popup → API
     should return 200 and the new ballot should appear in
     `/api/proposals/<id>/ballots`.
   - Hit `https://<domain>/api/proposals` directly — should return
     the proposals list as JSON.

---

## 3. DNS, SSL, and cutover

DNS swing is the only externally-visible step in the migration. Order matters.

1. **Pre-cutover**: deploy is live at the Railway-generated URL
   (`<project>.up.railway.app`). Confirm everything works there
   first. The Tailscale funnel at
   `desktop-dvvupq4.tail301743.ts.net:10000` keeps serving in parallel.

2. **DNS swing**: point the chosen domain (e.g. `thedaolog.giveth.io`)
   at Railway. SSL provisions automatically.

3. **Soft launch**: announce the new URL. Leave the funnel running for
   a few days as a fallback. Any deep-linked references in past
   announcements still resolve.

4. **Hard decommission** (after a week of clean traffic): on the
   Windows host, run `tailscale funnel reset --https=10000` to free
   the slot for whatever comes next, and disable the
   `GreenlightFunnelHealth` scheduled task entry for the thedaolog
   processes (or delete the task entirely if no other apps use it).

---

## 4. On-chain ownership cleanup

The deployer/minter wallet at `0x16D89551D8635341bdB6a3dAEdc57e0ca43C42d4`
currently holds `MINTER_ROLE` on the badge and is `admin` on the
TallyCommit contract. Until you replace it, anyone with that
`.secrets/thedaolog_deployer.json` file can mint badges and post Merkle
roots. That includes whoever has access to the Windows testbed.

Replace it once your Railway deploy is stable.

1. **Generate the Giveth ops wallet**. Either a fresh single-sig or a
   Safe multisig on Arbitrum One. Note the address.

2. **Update the Railway env var**: set `DEPLOYER_PRIVATE_KEY` to the
   new wallet's key (or if multisig, leave the env unset for now; the
   API's commit endpoint will need a separate flow that proposes the
   tx to the Safe instead of sending it directly — minor follow-up
   work, see HANDOFF.md §10).

3. **Badge contract — replace minter** (Arbiscan, Write tab on
   `0x32d664ca9ea4bad60b2b8ed61dec30692df43ac9`):
   - Connect with Zep's admin wallet
     (`0x72315dddeb862cD484b9F37d37952eC9080557cd`).
   - `grantRole(MINTER_ROLE, <Giveth ops wallet>)`.
     `MINTER_ROLE` = `keccak256("MINTER_ROLE")` =
     `0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6`
     (use that exact bytes32 in the input).
   - `revokeRole(MINTER_ROLE, 0x16D89551D8635341bdB6a3dAEdc57e0ca43C42d4)`.

4. **TallyCommit contract — replace admin** (Arbiscan, Write tab on
   `0x6b6cefa25fa3ce9623806a86a08c62e24520513c`):
   - Connect with the deployer wallet (since it's the current admin).
   - `transferAdmin(<Giveth ops wallet>)`.

5. **Verify**: re-read `hasRole(MINTER_ROLE, 0x16D8…42d4)` → expect
   `false`. Re-read `admin()` on TallyCommit → expect the new address.

6. **Burn the old key**: the Xerxes-side `.secrets/thedaolog_deployer.json`
   file can be deleted once you've confirmed the new wallet works
   end-to-end (mint a test badge, run a test commit). Until then keep
   it as a fallback.

---

## 5. Post-deploy operations

### Minting BUIDLER badges to new addresses

Same flow as HANDOFF.md §8, but run from Kay's machine (or wherever
holds the new deployer key):

```bash
# Edit scripts/mint-batch-4.mjs to point at the new key file or env var,
# then:
node scripts/mint-batch-4.mjs
```

Costs ~$0.01–0.05 per mint on Arbitrum (single `safeMintBatch` tx).

### Closing a vote + posting on-chain Merkle commit

After a proposal's deadline:

```bash
curl -X POST https://<your-domain>/api/proposals/<proposal-id>/commit
```

The API computes the Merkle root from canonical-ordered ballots and
submits the `commit(proposalId, root, ballotCount)` tx with the
deployer wallet. Tx hash comes back in the response. Once mined, the
in-dapp Verify panel shows ✓ "On-chain root matches".

### Backups

The only persistent state is `data/ballots.json` and `data/proposals.json`.
Railway's volume gets snapshotted by Railway, but for belt-and-braces:

- A nightly cron that `git pull`s the data into a private Giveth repo
  (or pushes to S3) is a solid pattern.
- Alternatively, every accepted ballot already auto-pins to IPFS via
  Pinata if `PINATA_JWT` is set. Ballots can be reconstructed from
  IPFS even if the JSON files vanish.

### Monitoring

Railway gives you basic uptime + CPU/memory dashboards out of the
box. For external uptime monitoring, point UptimeRobot at
`https://<your-domain>/api/proposals` — it should always return 200
JSON. Alert on >2 consecutive 5xx or >5s response time.

### Logs

`railway logs` from the CLI, or the Logs tab in the dashboard.
Important things to grep for:

- `[pinata]` — Pinata pin success / failure.
- `not_a_badgeholder` — expected for non-badge-holding callers.
- `verify_failed` — signature didn't match.
- Any 500 — bug, file an issue.

---

## 6. Sanity checklist before declaring done

- [ ] Code changes from §1 merged and deployed.
- [ ] Railway service is up at custom domain with valid SSL.
- [ ] Wallet connect → sign → /api/.../vote returns 200, ballot
      visible in `/api/.../ballots`.
- [ ] Pinata pin is logged for that test ballot (`[pinata] pinned`).
- [ ] On-chain `commit` works end-to-end on a throwaway proposal:
      curl POST → tx hash → Verify panel shows green.
- [ ] Tailscale funnel still running as fallback. Note the planned
      decommission date.
- [ ] Badge `MINTER_ROLE` moved off the testbed deployer wallet.
- [ ] TallyCommit `admin` moved off the testbed deployer wallet.
- [ ] DNS pointing at Railway (not the funnel).
- [ ] Backup strategy in place (volume snapshots + Pinata pin chain at
      minimum).

When all of these are checked, the testbed is no longer load-bearing.
Reach out to Zep/Griff (or Xerxes via Telegram) for anything that
surprises you.

---

## 7. Open questions to confirm with Zep before deploy day

1. Domain — which subdomain, and who owns the parent DNS?
2. New deployer wallet — single-sig or Safe multisig? If multisig, the
   commit endpoint needs a small refactor to propose-not-send.
3. Pinata account — keep the Xerxes-issued JWT or rotate to a
   Giveth-owned Pinata account before launch? Cleaner is to rotate now.
4. Repo location — push to `Giveth/thedaolog` or a different name?
5. Voting badge metadata `name()` mismatch ("theDAO Security Badge"
   on-chain vs "Giveth BUIDLER" display) — leave as is, or schedule a
   redeploy of the badge contract? Cosmetic only, but visible in
   Etherscan.
