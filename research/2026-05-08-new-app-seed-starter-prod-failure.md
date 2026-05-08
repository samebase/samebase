# New App Seed Starter Production Failure

Date: 2026-05-08

Related spec: `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`

## Summary

Production New App creation for `nicu-chiciuc/tmp-newapp-1212341234` failed in
`seed_starter` after GitHub repository creation and vault connection succeeded.

The vault is correctly preserved as a connected GitHub vault, but it has no
default-branch tree, no infrastructure records, and no Convex or Cloudflare
state beyond `not_configured`. This is the Phase 5 backend durability gap: the
user-visible state is clear enough to inspect, but the backend does not yet
retry the idempotent source setup step.

## Production State

Checked from the primary checkout's `apps/noter` directory with
`CONVEX_DEPLOY_KEY=` so `--prod` targets the production deployment.

- Production deployment observed by CLI: `clear-butterfly-858`
- Vault: `k977r7zjf2m9kzvsbemwapg9gh86a2rx`
- Run: `qx7cg6yvsvf0x2z8vs26t3m8p586b0wh`
- Workflow: `jd7dky7p6e4bc2m2z1e36a8et986btp5`
- Repository: `nicu-chiciuc/tmp-newapp-1212341234`
- GitHub repository id: `1233131777`
- Vault state: `connected`
- `convex`: `{ state: "not_configured" }`
- `cloudflare`: `{ state: "not_configured" }`
- `infraState`: `not_started`
- `vaultBranchTrees`: no default-branch tree row
- `vaultInfrastructure`: no row
- `vaultInfrastructureOwnership`: no row

GitHub currently has one commit on `main`:

- `20fcbba95bd472c38f6008f715b2b605725b1391`
- message: `chore: bootstrap branch for starter seeding`
- tree contains only `.noter-seed-bootstrap`

## Failure Evidence

User-visible provisioning events:

1. `validate_connections`: queued and checked provider connections
2. `create_github_repo`: created `nicu-chiciuc/tmp-newapp-1212341234`
3. `create_vault`: connected the Noter vault to GitHub
4. `seed_starter`: started seeding
5. `seed_starter`: failed with `Provisioning failed during seed_starter.`

Raw production logs show:

- `seed:start` for the repo
- `seed:bootstrap_needed` with GitHub's empty repository response
- `seed:failed` with
  `Git Repository is empty. - https://docs.github.com/rest/git/blobs#create-a-blob`

The bootstrap commit succeeded, but the next manifest write still saw GitHub's
empty-repository response. This looks like a short GitHub consistency window
after `createOrUpdateFileContents` creates the first branch commit.

## Likely Fix Shape

Do not retry `create_github_repo` by default.

Make `seed_starter` safe to retry after the empty-repo bootstrap path:

1. Keep the initial `createManifestTree` behavior that detects an empty
   repository and creates the bootstrap commit.
2. After bootstrap, retry `createManifestTree` when GitHub still reports the
   repository as empty.
3. Keep the existing force-update behavior so a later successful starter commit
   replaces the bootstrap-only branch.
4. Add focused tests that simulate empty repo, successful bootstrap, then one or
   more stale empty-repo responses before manifest tree creation succeeds.
5. Once the step is proven idempotent, consider enabling Workflow retry for
   `seed_starter` under Phase 5.

Relevant code:

- `apps/noter/convex/starterSeed.ts`: `seedRepositoryWithStarter`
- `apps/noter/convex/appProvisioningWorkflow.ts`: `seed_starter` currently runs
  with `retry: false`

## Operator Note

For production Convex reads from this repo, use the primary checkout and avoid a
deploy key:

```bash
cd /Users/nicu/dev/my/noter/apps/noter
CONVEX_DEPLOYMENT=<primary-checkout-CONVEX_DEPLOYMENT> CONVEX_DEPLOY_KEY= npx convex run --prod --inline-query '<query>'
```

If Convex prints that it is ignoring `--prod` because of `CONVEX_DEPLOY_KEY`,
the command is pointed at the wrong deployment.
