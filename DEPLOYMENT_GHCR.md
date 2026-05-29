# GHCR VPS Deployment

Production images are built on GitHub-hosted runners and pushed to GHCR.
The VPS rollout pulls those images and restarts Docker Compose; it should
not build the app locally.

## GitHub Secrets

Set these repository secrets for `.github/workflows/deploy.yml`:

- `VPS_HOST`: VPS hostname or IP address.
- `VPS_USER`: SSH user with access to Docker Compose in the deploy directory.
- `VPS_SSH_KEY`: private SSH key for `VPS_USER`.
- `VPS_DEPLOY_PATH`: absolute path containing `docker-compose.yml` and `.env`.
- `VPS_PORT`: optional SSH port. Defaults to `22`.
- `GHCR_USERNAME`: required only if GHCR packages are private.
- `GHCR_READ_TOKEN`: required only if GHCR packages are private; use a PAT with `read:packages`.

Optional repository variable or secret:

- `VITE_WALLETCONNECT_PROJECT_ID`: baked into the Caddy/SPA image at build time.

## VPS Setup

The deploy directory is `VPS_DEPLOY_PATH`. If it does not exist, the workflow
creates it and clones `https://github.com/Giveth/thedaolog.git` into it. If it
already exists, it must either be an existing git checkout of this repo or an
empty directory.

Add a production `.env` in `VPS_DEPLOY_PATH` before the first deploy. The
workflow intentionally fails if `.env` is missing so the VPS does not start with
empty production secrets.

For private GHCR packages, the workflow logs Docker in on the VPS before
pulling. For public packages, leave `GHCR_USERNAME` and `GHCR_READ_TOKEN`
unset.

Runtime secrets stay in the VPS `.env`; they are not baked into images:

- `SITE_ADDRESS`
- `PINATA_JWT`
- `GITHUB_TOKEN`
- `THEDAOLOG_GITHUB_REPO`
- `DEPLOYER_PRIVATE_KEY`

## Rollout

The workflow runs on pushes to `main` and via manual dispatch. It builds and
pushes:

- `ghcr.io/giveth/thedaolog-app:latest`
- `ghcr.io/giveth/thedaolog-caddy:latest`
- commit-SHA tags for both images

Then the VPS runs:

```bash
export IMAGE_TAG=<commit-sha-tag>
docker compose pull app caddy
docker compose up -d --remove-orphans
docker image prune -f
```
