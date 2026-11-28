# Alchemy deploy standard

Every repository of the team deploys with [Alchemy](https://alchemy.run), and behaves the same way
for the person who opens a pull request:

- A push to `main` deploys production.
- A pull request gets its own preview.
- The pull request has one comment with a diagram of the preview's stacks and their addresses.
- Closing the pull request removes the preview.

The providers and the state store are the stack's choice. A stack on Cloudflare only keeps its state
on Cloudflare. A stack with a Convex deployment can keep it in Convex.

## The rules

1. **One Alchemy stack per app**, in `alchemy.run.ts` at the app's root, run by GitHub Actions.
   Nothing else deploys: no deploy-key workflow, no Workers Builds, no hand-run `convex deploy`.
2. **Stages**: `prod` on each push to `main`; `pr-<number>` on each pull request from the
   repository, with every resource named after the stage, destroyed when the pull request closes.
   The workflow runs one deploy of a stage at a time.
3. **One deploy flow**: the repository's workflow calls `.github/workflows/alchemy-deploy.yml` of
   `samebase/samebase`, pinned to a commit. That file holds the order of a run: one run per stage, a
   destroy that waits for its deploy, and a check of GitHub after each run gets its turn. It names
   no provider. The caller gives the variables of the Alchemy steps in the one secret `ALCHEMY_ENV`,
   one `NAME=value` on each line. A value is one line, and the log masks it. A repository with
   several stacks, or with its own step after the deploy, keeps its own workflow and the same rules.

   ```yaml
   on:
     push: { branches: [main] }
     pull_request: { types: [opened, synchronize, reopened, closed] }
   permissions: { contents: read }
   jobs:
     alchemy:
       uses: samebase/samebase/.github/workflows/alchemy-deploy.yml@<commit>
       permissions: { contents: read, pull-requests: write }
       secrets:
         ALCHEMY_ENV: |
           CLOUDFLARE_API_TOKEN=${{ secrets.CLOUDFLARE_API_TOKEN }}
           CLOUDFLARE_ACCOUNT_ID=${{ vars.CLOUDFLARE_ACCOUNT_ID }}
   ```

4. **The comment**: `alchemy-kit stack-comment` of `@samebase/alchemy-kit`, which the shared
   workflow runs after a preview deploy. It reads the state store that `alchemy.run.ts` configures,
   so it works with any store. The stack's package installs `@samebase/alchemy-kit`.
5. **State in a store that every run can reach**, wrapped in `withRunRecord` of
   `@samebase/alchemy-kit/run-record`, which adds the run (PR, branch, commit, run link) to each
   successful stage output. Prefer the store of a provider that the stack already has, so the
   repository holds no extra token: `Cloudflare.state()` for a stack on Cloudflare, `Convex.state()`
   of `@samebase/alchemy-convex` for a stack with a Convex deployment. Never a local `.alchemy/`
   directory in CI, never a state artifact.
6. **Stack name = repository full name**, `owner/name`, from `GITHUB_REPOSITORY` in Actions or the
   origin remote on a development machine, at its first deploy. A stack keeps that name for life, so
   after a rename the stack file writes the old name as a literal; the Samebase repository pages
   find the stack by the repository id in its run record. A stack in a folder of a repository is
   `owner/name/<folder>`. The identity hub names the stack's app the same way: `<folder>`, or `app`
   for a stack named after the repository, unless `IdentityHub.Client` gets an explicit `app`.
7. **As few secrets as the providers need**: one token for each provider of the stack. The identity
   hub needs no secret: `IdentityHub.Client` asks it with the run's GitHub OIDC token
   (`id-token: write`).
8. **Existing resources are adopted once**: a resource that predates the stack is taken over by one
   run with `--adopt` (the workflow's `adopt` input). Production resources are retained on destroy;
   previews are destroyed.
9. **Same versions, same day**: repositories that share one store get an Alchemy or store package
   upgrade in one round, with dated release-age exceptions in `pnpm-workspace.yaml` while the
   versions are younger than the policy. The stacks of this repository pin a published
   `@samebase/alchemy-convex`, as the other repositories do, so a store change reaches the store
   only after its release: release it, merge the pull request that changes the pins here, and
   upgrade the other repositories the same day.

## A stack with a Convex deployment

[samebase/base](https://github.com/samebase/base) is the starter for an app on Convex. The Samebase
stack, `apps/samebase/alchemy.run.ts`, is the same shape with Cloudflare resources added.

- **State**: `state: Convex.withRunRecord(Convex.state())`. The state of every stack and stage of
  the team lives in the `alchemy-state-store` project of that team, which the first run creates.
- **One secret**: `CONVEX_ACCESS_TOKEN`, a team access token, or the organization's OAuth token in a
  repository that Samebase created. The run mints every deploy key itself, and the keys never leave
  the run. An OAuth token comes back as its own key, with no limits.
- **The push is the deployment's source**: `Convex.Deployment({ project, type, source })` with
  `source.command` running the package's `deploy` script, so an unchanged checkout deploys nothing
  and a failed check stops the release before the push. One-shot secrets that must never enter
  state, such as Convex Auth keys or the hub's key set, are created inside that script
  (`scripts/ensure-convex-auth.ts`) on the deployment, never as a resource.
- **Preview-only values** are project default environment variables for the `preview` type
  (synthetic accounts, email senders), set once in the Convex dashboard, never in the workflow.

## Why

The state store is the one place that knows what exists, so the comment can show it, destroy is
safe, and a development machine and CI see the same truth. The same behaviour everywhere means a
reader of one pull request has read them all, whatever the stack runs on.
