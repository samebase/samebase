# Cloudflare Worker Create/Connect Live Test Matrix

Date: 2026-07-06 Branch: `codex-cloudflare-worker-phase-4`

This matrix tracks live verification for the Cloudflare Worker create/connect feature after Phase 4
split the flow into Worker attachment, Workers Builds wiring, and Convex deploy-key wiring.

This is historical evidence from 2026-07-06. CF-01 and CF-09 did not wait for the durable workflows,
so they do not prove the current full app-creation contract. That contract now belongs to
`vault-create-app.live.spec.ts`, in the test named
`creates and fully provisions a temporary app, then removes its resources`. It uses names that start
with `tmp-<worktree-id>-app-create`.

## User Stories

| ID    | User story                                                                                           | Expected behavior                                                                                                                                                                                                             | Evidence target                                                                                                                                                               | Status                        |
| ----- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| CF-01 | Create a new Samebase app from `/new-app` with GitHub, Convex, and Cloudflare connected.             | GitHub repo, Convex deployment, Cloudflare Worker, Workers Builds triggers, Convex deploy-key env vars, and production domain are created; dashboard reaches ready.                                                           | The historical `creates a temporary app` run checked the immediate dashboard result. The current owner named above waits for durable completion.                              | Historical, not current proof |
| CF-02 | Create/connect a Cloudflare Worker for an existing GitHub vault that does not yet have Cloudflare.   | Manual attach/create creates only the Worker row; it does not silently wire GitHub Builds or Convex deploy keys.                                                                                                              | `connects an existing repository...` creates a Worker first, then verifies `Cloudflare is not connected to this GitHub repository.` and no `Set Convex deploy keys` action.   | Passed                        |
| CF-03 | Wire GitHub repo to an attached Worker.                                                              | `Connect GitHub repo` runs `wire_builds`, creates/records Workers Builds triggers, and does not require Convex.                                                                                                               | Same live story clicks `Connect GitHub repo` before Convex exists; focused Convex tests cover the no-Convex backend path.                                                     | Passed                        |
| CF-04 | Wire Convex deploy keys after the vault has Convex and connected Builds.                             | `Set Convex deploy keys` runs `wire_convex_build_access`, creates prod+preview deploy keys, patches both `CONVEX_DEPLOY_KEY` and `PREVIEW_CONVEX_DEPLOY_KEY` on the production and preview triggers, and marks the row ready. | Same live story creates Convex after Builds wiring and clicks `Set Convex deploy keys`; backend tests assert both deploy-key names on every trigger and no `VITE_CONVEX_URL`. | Passed                        |
| CF-05 | Discover existing Workers in the Cloudflare dialog.                                                  | Same repo + same normalized root is recommended/selectable; same repo + different root is visible as a root mismatch; different repo and blocked Workers cannot be submitted.                                                 | `cloudflareResources.test.ts`, `cloudflareMutations.convex.test.ts`, and dashboard component tests cover the classification; no destructive live inventory rewrite.           | Passed by automated tests     |
| CF-06 | Handle a missing/stale Workers Builds trigger failure.                                               | A current missing-trigger failure shows `Cloudflare's saved Workers Builds trigger is missing.` with `Connect GitHub repo`; a stale failure after a newer Worker observation can proceed to deploy-key repair.                | `vault-dashboard-visual.spec.ts` Linux visual run plus backend tests cover the repair state and stale-observation branch.                                                     | Passed by automated tests     |
| CF-07 | Run with local API-key seeded provider connections, not only OAuth.                                  | New-app and manual Cloudflare flows work from the worktree local backend seeded with API keys.                                                                                                                                | Both live stories passed on localhost using the worktree local backend and API-key provider setup.                                                                            | Passed                        |
| CF-08 | Fail safely when provider prerequisites are absent or invalid.                                       | UI blocks unavailable actions or surfaces user-facing failure; no partial external resource is kept unless explicitly attached and safe.                                                                                      | Existing negative backend/UI tests cover absent/invalid provider paths; live destructive auth invalidation was skipped.                                                       | Passed by automated tests     |
| CF-09 | Cleanup temporary resources.                                                                         | Dashboard delete removes only tmp GitHub/Convex/Cloudflare resources that Samebase owns; selected-existing Workers are not deleted.                                                                                           | The historical run submitted dashboard deletion but did not wait for durable workflow completion. The current owner requires stable loaded vault absence.                     | Historical, not current proof |
| CF-10 | Block existing Workers that already belong to a different repo or a different root in the same repo. | Dialog classification makes same-repo/different-root visible, disables or blocks unsafe selection, and backend creates no Worker row or run on blocked selection.                                                             | Backend and component tests cover repo/root blocked selection; live run did not create conflicting Workers solely for this negative case.                                     | Passed by automated tests     |
| CF-11 | Saved trigger disappears or drifts before deploy-key wiring.                                         | Samebase fails before writing Cloudflare env vars or starting a build, and the dashboard shows the Builds repair path.                                                                                                        | Backend tests plus visual state cover missing-trigger repair; no live trigger deletion was performed.                                                                         | Passed by automated tests     |
| CF-12 | Missing provider connection or expired provider auth.                                                | The action fails closed with user-facing remediation and no external partial writes.                                                                                                                                          | Negative backend/UI tests cover missing provider state; live token invalidation was skipped to avoid damaging the current worktree setup.                                     | Passed by automated tests     |
| CF-13 | Retry after partial failure.                                                                         | Retry skips already-completed Convex/Worker/Builds blocks and continues the missing block without duplicates.                                                                                                                 | App provisioning workflow tests cover resume/retry behavior across the split steps.                                                                                           | Passed by automated tests     |

## Live Commands

```sh
pnpm test:app-creation-live
```

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 PLAYWRIGHT_EXISTING_REPOSITORY_FULL_NAME=nicu-chiciuc/tmp-my-new-app-2 pnpm exec playwright test -c apps/samebase/playwright.live.config.ts apps/samebase/e2e/vault-create-app.live.spec.ts --project=chromium-desktop
```

```sh
PLAYWRIGHT_LINUX_WORKERS=1 pnpm test:visual:linux -- apps/samebase/e2e/vault-dashboard-visual.spec.ts -g "connect Cloudflare|Cloudflare GitHub App authorization failure|Cloudflare missing Builds trigger repair"
```

```sh
pnpm exec vp test apps/samebase/convex/cloudflareResources.test.ts apps/samebase/convex/vault/cloudflareMutations.convex.test.ts apps/samebase/convex/appProvisioningWorkflow.convex.test.ts apps/samebase/convex/vault/dashboard.convex.test.ts apps/samebase/src/components/vault-dashboard/VaultDashboard.test.tsx apps/samebase/src/components/vault-dashboard/VaultResourceRail.test.tsx apps/samebase/shared/appResourceNames.test.ts
```

## Notes

- `wire_builds` must have no Convex inputs.
- Workers Builds env-var patching must not set `VITE_CONVEX_URL`.
- Secret values must not be printed in logs or reports.
