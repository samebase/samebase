# Alchemy deploy standard

Every repository of the team deploys the same way. The reference implementation is
[samebase/base-alchemy](https://github.com/samebase/base-alchemy): copy its `alchemy.run.ts` and
`.github/workflows/alchemy.yml` and change only what the app needs. The Samebase stack,
`alchemy.run.ts` at the root of this repository, is the same shape with Cloudflare resources added.
Status: accepted on 2026-10-28; owner: Nicu. The migration list is at the end.

## The rules

1. **One Alchemy stack per app**, run by GitHub Actions. Nothing else deploys: no deploy-key
   workflow, no Workers Builds, no hand-run `convex deploy`. The stack file lives at the app's root,
   or at the repository root with an explicit `rootDir` for the app (the Samebase stack).
2. **State in the team's Convex store**: `state: Convex.state({ team })` from
   `@samebase/alchemy-convex`. The state of every stack and stage of the team lives in the
   `alchemy-state` project of that team, which the first run creates, and it outlives the app's own
   project. It is encrypted at rest by Convex and nothing else: a member with raw access to that
   project reads every stack's props and outputs, `Redacted` values included; the Samebase reader
   strips secrets, raw reads do not. So resource props and outputs carry no identity material (rule
   6). Never `Cloudflare.state()`, never a local `.alchemy/` in CI, never a state artifact.
3. **Stack name = repository full name**, `owner/name`, from `GITHUB_REPOSITORY` in Actions or the
   origin remote on a laptop; a literal is fine when it is that name. A second stack in a folder of
   a repository is `owner/name/<folder>`. The Samebase repository pages find a stack by that name
   and by the run record its deploys write, so both must match the repository.
4. **One secret for Convex**: `CONVEX_ACCESS_TOKEN`, a team access token. The run mints every deploy
   key itself; the keys never enter state. A stack with Cloudflare resources adds the Cloudflare
   login, the secret `CLOUDFLARE_API_TOKEN` with exactly the permissions those resources need and
   the variable `CLOUDFLARE_ACCOUNT_ID`; a laptop uses `alchemy login`. An app adds only its own
   secrets, such as a registration token for the identity hub.
5. **Stages**: `prod` on each push to `main`; `pr-<number>` on each pull request from the
   repository, a preview deployment named after the stage with a comment that names its URL,
   destroyed when the pull request closes. A stack may have no previews (a production-only Worker,
   say) and says so in its file. The store has no lock, so every workflow serializes deploys and
   destroys per stack and stage with `concurrency: { group, queue: max }` and never cancels a
   running job; a laptop run waits for CI the same way.
6. **The push is the deployment's source**: `Convex.Deployment({ project, type, source, env })`,
   with `source.command` running the package's `deploy` script. That script runs the checks before
   the push, so a failed check stops the release; an unchanged source hash skips the push, and the
   hash must cover every build input outside `rootDir`. One-shot secrets that must never enter
   state, such as Convex Auth keys or the hub's key set, are created inside that script against the
   selected deployment: create when missing, keep when present, reject a malformed value, never
   print, never a resource prop or output.
7. **Retention**: production projects, deployments, and Workers are retained on destroy; preview
   deployments are destroyed; preview comments are retained. The starter still destroys its
   production project on `destroy --stage prod`; fix that there before copying.
8. **Preview-only values** that are static runtime variables (synthetic accounts) are project
   default environment variables for the `preview` type, set once in the Convex dashboard; they
   apply at creation and never update an existing preview. Build settings and values derived from
   the deployment itself (its site URL) stay in the stack or the deploy script.
9. **Adoption**: a project or production deployment that predates the stack is taken over by one run
   with `--adopt` (the workflow's `adopt` input). A preview stage may adopt a same-named preview
   that an interrupted run left behind, with `adopt(true)` on that resource only. A starter that
   reads the project from the state of `prod` needs `prod` deployed first.
10. **Same versions, same day**: every repository of a team shares one store, so an Alchemy,
    `@samebase/alchemy-convex`, effect, or Convex CLI upgrade lands in every repository in one
    round, with reviewed, exact, dated release-age exceptions in `pnpm-workspace.yaml`, transitive
    packages included. A newer store protocol rejects older clients, so stop old runs first.

## Checklist for a new repository

- Copy `alchemy.run.ts`, `.github/workflows/alchemy.yml`, and the one-shot secret script from the
  starter; name nothing by hand.
- Set `CONVEX_ACCESS_TOKEN`; with Cloudflare resources, `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` too. Set preview defaults on the project when previews need them.
- If the project exists already, run the workflow once with `adopt`.
- Delete every older path: deploy-key secrets, Workers Builds links, a Cloudflare state store.

## Migration list

- `templates/base-actions`: Workers Builds and a Cloudflare state store; the experimental
  provisioning flow still points at it. To be replaced by the starter and deleted.
- `samebase/base-alchemy`: retains nothing on destroy (rule 7).
- `apps/sidebars-example`: production only, default removal policy on its Worker (rule 7).
- `nicu-chiciuc/bristol_tsx`: on the Cloudflare store until its PR 43 merges.
