# Alchemy deploy standard

Every repository of the team deploys the same way. The reference implementation is
[samebase/base-alchemy](https://github.com/samebase/base-alchemy): copy its `alchemy.run.ts` and
`.github/workflows/alchemy.yml` and change only what the app needs. The Samebase stack,
`apps/samebase/alchemy.run.ts`, is the same shape with Cloudflare resources added.

## The rules

1. **One Alchemy stack per app**, in `alchemy.run.ts` at the app's root, run by GitHub Actions.
   Nothing else deploys: no deploy-key workflow, no Workers Builds, no hand-run `convex deploy`.
2. **State in the team's Convex store**: `state: Convex.state({ team })` from
   `@samebase/alchemy-convex`. The state of every stack and stage of the team lives in the
   `alchemy-state-store` project of that team, which the first run creates. Never
   `Cloudflare.state()`, never a local `.alchemy/` directory in CI, never a state artifact.
3. **Stack name = repository full name**, `owner/name`, from `GITHUB_REPOSITORY` in Actions or the
   origin remote on a laptop. That name is how the Samebase repository pages find the stack. A stack
   in a folder of a repository is `owner/name/<folder>`.
4. **One secret**: `CONVEX_ACCESS_TOKEN`, a team access token. The run mints every deploy key itself
   and the keys never leave the run. The identity hub needs no secret: `Convex.HubClient` reaches it
   with this token. A stack with Cloudflare resources adds the Cloudflare login
   (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) for those resources, not for state.
5. **Stages**: `prod` on each push to `main`; `pr-<number>` on each pull request from the
   repository, a preview deployment named after the stage with a comment that names its URL,
   destroyed when the pull request closes. The workflow runs one deploy of a stage at a time.
6. **The push is the deployment's source**: `Convex.Deployment({ project, type, source })` with
   `source.command` running the package's `deploy` script, so an unchanged checkout deploys nothing
   and a failed check stops the release before the push. One-shot secrets that must never enter
   state, such as Convex Auth keys or the hub's key set, are created inside that script
   (`scripts/ensure-convex-auth.ts`) on the deployment, never as a resource.
7. **Preview-only values** are project default environment variables for the `preview` type
   (synthetic accounts, email senders), set once in the Convex dashboard, never in the workflow.
8. **Existing resources are adopted once**: a project or production deployment that predates the
   stack is taken over by one run with `--adopt` (the workflow's `adopt` input). Production
   resources are retained on destroy; previews are destroyed.
9. **Same versions, same day**: all repositories of a team share one store, so an Alchemy or
   `@samebase/alchemy-convex` upgrade lands in every repository in one round, with dated release-age
   exceptions in `pnpm-workspace.yaml` while the versions are younger than the policy.

## Why

The state store is the one place that knows what exists, so Samebase can read it, destroy is safe,
and a laptop and CI see the same truth. One token per repository means nothing to rotate per
deployment and nothing to copy between repositories. The same shape everywhere means a new
repository is a copy of the starter, and a reader of one stack has read them all.

## Checklist for a new repository

- Copy `alchemy.run.ts`, `.github/workflows/alchemy.yml`, and `scripts/ensure-convex-auth.ts` (or
  the app's one-shot secret script) from the starter; name nothing by hand.
- Set the secret `CONVEX_ACCESS_TOKEN`. Set preview defaults on the project when previews need
  values.
- If the project exists already, run the workflow once with `adopt`.
- Delete every older path: deploy-key secrets, Workers Builds links, a Cloudflare state store.

Known exceptions, to be removed: `templates/base-actions` (Workers Builds and a Cloudflare state
store; the experimental provisioning flow still points at it) and any app not yet migrated.
