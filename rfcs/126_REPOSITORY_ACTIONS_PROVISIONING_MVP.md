# 126 Repository-Owned Provisioning Through GitHub Actions (MVP)

## Document Control

- Status: Proposal
- Owner: Nicu Chiciuc
- Created: 2026-10-06
- Last updated: 2026-10-06
- Base: `origin/main` at `06e612f0a` (v2094)
- Evidence: `research/2026-10-05-alchemy-setup-stack-and-wrangler-split.md`
  ([PR #1685](https://github.com/samebase/samebase/pull/1685)); the Alchemy-way copy of Score Four,
  [nicu-chiciuc/score-four-alchemy](https://github.com/nicu-chiciuc/score-four-alchemy) (private),
  with its `docs/comparison.md`; [issue #1686](https://github.com/samebase/samebase/issues/1686)
- Related: `specs/115_REPOSITORY_RESOURCE_ATTACHMENT_MODEL_SPEC.md`,
  `rfcs/123_REPOSITORY_TERMINOLOGY_AND_DATA_MIGRATION_ROLLOUT.md`,
  `apps/samebase/convex/repository/provisioningModel.ts`,
  `apps/samebase/convex/repositoryProvisioningWorkflow.ts`, `scripts/export-starter-manifest.ts`
- Packages: `alchemy@2.0.0-beta.80`, `@samebase/alchemy-convex@0.3.0`

## Summary

1. Today Samebase provisions a new app itself: after it creates and seeds the GitHub repository, its
   workflow creates the Convex project, creates the Worker, configures Workers Builds, and installs
   the deploy keys, all with Samebase's own provider tokens.
2. This RFC adds a second mode next to it. Samebase copies a template repository into the user's
   GitHub, writes three Actions secrets and one variable into it, and stops. The repository's own
   GitHub Actions workflow runs `alchemy deploy`, which creates the Convex project, its production
   deployment, the deploy keys, and the Worker, and deploys the code. Pull requests get a Convex
   preview deployment and a Worker Preview from the same workflow, and a close destroys both.
3. No hard cut. The current mode stays the default until the new mode has created and run a real app
   from samebase.com. The choice is made per repository at creation and recorded on its provisioning
   plan.
4. The MVP is three pull requests. The first ships the template variant alone, so it can be proven
   by hand before any Samebase code depends on it. The second ships the mode. The third ships the
   observation that makes the dashboard show the new repositories, and is verified against a
   repository the second one created.
5. This document is the direction, not a contract. The work will find edge cases that this text does
   not know yet. When a section changes, the Status log at the end records what changed and why, so
   a reader sees the current plan and how it got there.

## Decisions

### The seam: who provisions

A repository's provisioning plan says who provisions it:

- `samebase` (today): Samebase's workflow runs the attach, configure, and rotate steps.
- `repository_actions` (new): the repository's GitHub Actions run `alchemy deploy`. Samebase only
  creates the repository, writes the CI secrets, and seeds the template.

The deployer inside the template (Workers Builds today, Alchemy in the new template) is a template
detail, not a second axis. A Convex-only template later is another template variant in the same
mode.

### Credentials

Samebase's own provider connection stays as it is: OAuth by default, API token as the option. The
new mode needs a second kind of credential, one that lives in the user's repository as an Actions
secret and that the GitHub runner uses:

| Secret or variable      | Source                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | A user API token for CI, created by the user from a deep link, pasted once per organization            |
| `CLOUDFLARE_ACCOUNT_ID` | Samebase knows it from the connection                                                                  |
| `CONVEX_ACCESS_TOKEN`   | A Convex team access token: minted per repository by Samebase if its OAuth token may, else pasted once |
| `CONVEX_TEAM_ID`        | Variable (not a secret). Samebase knows it from the connection; `Convex.Project` needs the numeric id  |

OAuth cannot replace the Cloudflare CI token: OAuth access tokens expire within hours, and
Cloudflare opens token minting (`account_api_tokens:create`) only to its first-party CLI today. When
that scope opens to third parties, Samebase mints the token through OAuth and the paste step
disappears. The secret-writing step stays the same.

Samebase never puts its own OAuth tokens into user repositories: team-wide blast radius, and CI
breaks when the user disconnects Samebase.

### The template does not get edited at seed time

The Alchemy run file reads the app name from `GITHUB_REPOSITORY` and the team id from the
`CONVEX_TEAM_ID` variable. The template is byte-identical for every app, and the seed step stays a
plain copy. A developer who runs the stack from a laptop sets the same values in `.env`.

### Default stays `samebase`

The creation form offers the new mode as an experimental choice. `repository_create` takes an
optional `provisioning` argument that defaults to `samebase`. Changing the default is a decision for
after the dogfood run, not part of this RFC.

## Schema

The schema is the main concern of this RFC. Every change below is additive: no existing row changes
shape, no backfill, no two-step deploy.

### `workflow_repositoryProvisioning_plans`

Today the table holds one object with `repositoryId`, `convexConfigPath`, `convex`, `cloudflare`,
`createdAt`, `updatedAt`. It becomes a union of two objects:

- The existing object, unchanged. Its absence of a `provisioning` field means `samebase`.
- A new object:
  `{ provisioning: "repository_actions", repositoryId, convexConfigPath, ciSecrets, createdAt, updatedAt }`
  where `ciSecrets` is `{ state: "planned" }` or `{ state: "written", writtenAt }`. It has no
  `convex` and no `cloudflare` part, because Samebase makes no provider choice in this mode.

Code reads the mode with one narrowing on the plan, `"provisioning" in plan`, in one place that
returns `"samebase" | "repository_actions"`.

Alternative considered: a required `provisioning` discriminant on both variants. It needs a deploy
with the field optional, a backfill mutation run in production, and a second deploy that makes it
required. The RFC 090 route (delete and recreate the rows) is not available: the rows belong to live
repositories. The additive union avoids all of that now. When the new mode is accepted and the old
one is removed, the cleanup that deletes the `samebase` variant gives every remaining row the field.

### `organizationProviderCredentials`

Both union variants get one optional field:

```
ci: optional(object({
  cloudflare: optional(object({ apiToken: string(), accountId: string(), connectedByUserId, updatedAt })),
  convex: optional(object({ accessToken: string(), teamId: string(), connectedByUserId, updatedAt })),
}))
```

Stored the way the OAuth tokens are stored today (Convex encrypts at rest). If the Convex spike
below shows that Samebase can mint a team access token per repository, the `convex` entry is not
needed and is left out.

### `workflow_repositoryProvisioning_runs`

The step union gets one new literal, `write_actions_secrets`. Additive.

### Not changed

`repositories`, the attachment tables, the write locks, and the provider API log. The observation
part records the Worker and the Convex project through the existing attachment contracts.

## Template variant

`templates/base` stays the Workers Builds template. A new overlay directory,
`templates/base-actions`, holds only the files that differ, plus a removal list in
`scripts/export-starter-manifest.ts`:

- Added: `alchemy.run.ts`, `.github/workflows/alchemy.yml`, `scripts/alchemy-stage.ts`,
  `package.json` and `pnpm-lock.yaml` (replaced: `alchemy` 2.0.0-beta.80 exact,
  `@samebase/alchemy-convex` 0.3.0 exact, `effect` and `@effect/platform-node` 4.x),
  `tsconfig.node.json` (includes the run file), `.gitignore` (`.alchemy`), and the README deployment
  section.
- Removed: `wrangler.jsonc`, `scripts/build-cloudflare.ts`, `scripts/verify-current-branch-head.ts`,
  and their tests. `scripts/ensure-convex-auth.ts` stays: the local dev launcher uses it. The stack
  makes the production Convex Auth keys with `Alchemy.KeyPair`.
- Unchanged: `src/`, `convex/`, `vite.config.ts`, `public/`, `.github/workflows/ci.yml`, and
  `pnpm run dev`. Local dev keeps the isolated anonymous backend of the base template; `alchemy dev`
  is not part of the variant. The stack stops on any stage that is not `prod` or a pull request
  stage.

The exporter composes base minus the removal list plus the overlay into a second generated manifest,
`starterSeedManifest.actions.generated.ts`, and `starterSeed.ts` takes the manifest as a parameter.

The stack name, the Worker name, and the Convex project name all come from `GITHUB_REPOSITORY` (the
part after the slash), with Samebase's `sanitizeAppResourceName` rule (54 characters for a Worker,
40 for a Convex project), so Part 3 finds both resources with `buildDefaultAppResourceName`. The
stack name must differ per app: Alchemy keys state by stack name and stage, and every stack in one
Cloudflare account shares one state store. The run file reads `GITHUB_REPOSITORY` and
`CONVEX_TEAM_ID` through `effect/Config`, process environment first, then `.env`, and fails closed
with a clear message when either is missing.

The run file otherwise follows score-four-alchemy: stage `prod` on main; a pull request stage named
after the branch made safe (`scripts/alchemy-stage.ts`), a Convex preview deployment named after the
raw branch (the name `convex deploy --preview-name` gives it, the name Samebase matches on), a
Worker Preview named after the stage, a `GitHub.Comment` with both URLs, destroy on close. No
separate bootstrap step: `alchemy deploy --yes` and `alchemy destroy --yes` create a missing
Cloudflare state store themselves (`updateStateStore: true` in the CLI), and
`alchemy provider cloudflare bootstrap` is idempotent, so a step for it would repeat the same work
before every deploy. The exact CI token permissions are verified by the hand test and written into
this section.

## The new workflow mode

For `provisioning: "repository_actions"` the run executes:

1. `validate_connections`: GitHub, Convex, and Cloudflare connected, and the CI credentials present.
2. `create_github_repository`: unchanged.
3. `write_actions_secrets` (new): `GET /repos/{owner}/{repo}/actions/secrets/public-key`, then one
   `PUT /repos/{owner}/{repo}/actions/secrets/{name}` per secret, sealed with the repository's
   public key (libsodium sealed box; a pure-JS implementation runs in the Convex runtime without
   `"use node"`), and one `POST /repos/{owner}/{repo}/actions/variables` for `CONVEX_TEAM_ID`. Marks
   `ciSecrets.state = "written"`. Runs before the seed, so the first workflow run has its secrets.
4. `seed_starter` with the actions manifest.
5. `connect_github_repository`, `sync_tree`, `finish`: unchanged.

Skipped: `claim_infra`, `attach_convex`, `attach_worker`, `configure_workers_builds_for_github`,
`rotate_convex_deploy_keys_for_workers_builds`. The attention items that ask for a Workers Builds
token or a deploy key do not apply to this mode.

The Samebase GitHub App needs two more repository permissions: Secrets (write) and Variables
(write). Today it has administration, contents, workflows, pull requests, checks, statuses, members,
metadata. Existing installations re-approve once. The change applies to every App instance (local
development, preview, production).

## Observation (Part 3)

For a `repository_actions` repository the status read:

- Shows the `alchemy` check on the default branch head as the deploy status, and the check on a pull
  request head as the preview status. Logs are the Actions run behind the check.
- After the first green `alchemy` check on the default branch, finds the Worker and the Convex
  project by the repository name (the template names both after it) and records them through the
  existing attach contracts, so the dashboard and the MCP status work unchanged.
- Reads the Worker Preview of a pull request by name (branch made safe) from the Workers Previews
  API. Today Samebase matches Worker Previews by the `branch` field that Workers Builds records,
  which does not exist in this mode. Convex previews match by `previewIdentifier` already.

## Pull requests

| PR  | Content                                                                                                                                           | Why its own PR                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Template overlay, exporter changes, second manifest, exporter tests                                                                               | Proven by hand before Samebase code exists: copy the manifest into a temporary repository, set the four values, watch deploy, preview, destroy |
| B   | Plan union variant, `ci` credentials, CI credentials UI, secrets write, the new workflow mode, `repository_create` argument, creation form choice | One coherent feature behind one choice; default unchanged                                                                                      |
| C   | Observation and status reads for the mode                                                                                                         | Verified against a repository that PR B created                                                                                                |

Outside the pull requests: the GitHub App permission change (Nicu, in GitHub settings), the Convex
token spike (a script: can Samebase's OAuth token call
`POST /v1/teams/{team_id}/create_access_token` on the Management API? A user login can; it made the
Score Four CI token), and the CI token for the dogfood organization.

## Execution

- Fable manages. Opus subagents implement, one worktree per PR, with `pnpm run dev --once` in the
  worktree first. Codex reviews each PR (`codex exec review --base main --title ...`) until a pass
  finds nothing; Astra extra high, Sol 6.1 extra high when Codex usage is under 10 percent.
- Nicu merges samebase/samebase PRs. Fable may merge package and app PRs when that unblocks the
  chain.
- Disposable resources use the `tmp-` prefix. Nothing deletes a Convex project; `Convex.Project`
  retains by default. The Cloudflare state store Worker `alchemy-state-store` is never deleted.

## Test plan

- Unit: exporter composition (removal list, overlay precedence, second manifest), sealed box against
  a known vector, workflow step dispatch for both modes, plan narrowing.
- Hand test of PR A: a temporary repository seeded from the generated manifest with the four values
  set; `alchemy` workflow deploys prod; a pull request gets a preview and a comment; the close
  destroys the preview; the temporary Convex project and Worker are deleted afterwards.
- Dogfood of PR B: create one app from samebase.com in the new mode under the dogfood organization;
  the first `alchemy` run on main is green; the app answers; a pull request preview works; then
  delete the app's resources.

## Open questions for Nicu

1. Schema: the additive plan variant (recommended) or the required discriminant with backfill.
2. Convex CI token: mint per repository if the spike allows, else paste. The spike comes first.
3. The GitHub App permission change: when to do it on the production App.
4. The name of the mode: `repository_actions`.

## Status

- 2026-10-06: RFC drafted. PR A (template variant) starts at once: it touches no schema and no
  Samebase runtime code. PR B waits for the answers to the open questions, with the recommended
  options as the working assumption.
- 2026-10-06: PR A open as draft [PR #1690](https://github.com/samebase/samebase/pull/1690).
  Corrections from building it, folded into the Template variant section: the stack name must come
  from the repository (shared per-account state store); `ensure-convex-auth.ts` stays for local dev;
  the overlay carries its own `pnpm-lock.yaml`; no bootstrap step (`deploy --yes` creates the state
  store); `alchemy dev` is not part of the variant. Codex review and the hand test follow.
- 2026-10-06: Codex round 1 on PR A, three P2 items. Fixed: the workflow concurrency group is per
  pull request number (a merge closes the pull request under a different `github.ref`, so the
  destroy raced the preview deploy); the Worker Preview name is explicit,
  `workerPreviewName(stage, worker)`: the stage when it fits `63 - worker.length - 1`, else the
  stage cut to budget minus 5 plus a dash and 4 hex of sha256(stage), with a `p` prefix when the
  stage starts with a digit; Part 3 computes the same name. Documented as a limit, not fixed: two
  branches that differ only in characters outside letters and digits share a stage, and the second
  deploy fails with `DeploymentIdentityChange`. Manifest `samebase-base-actions-4c16b72fbfa2`.
- 2026-10-06: Hand test, production half. The composed template (95 files) was pushed to the private
  repository `nicu-chiciuc/tmp-actions-template` with the three secrets and the team id variable set
  by hand (the secrets write is Nicu's step until PR B). The first `alchemy` run on main created all
  11 resources in 28 seconds: Convex project `tmp-actions-template` with production deployment
  `third-spider-587`, deploy key, JWT keys and project defaults, functions push, Worker
  `tmp-actions-template`. Site and Convex answer 200. The Cloudflare token was the Mail checkout's
  token; its permission set is enough for the state store, the Worker, and the Preview path still to
  be tested. Codex round 2 found two P1s (shared stack key across owners; destroy of another
  branch's stage); fixes in progress: stack name = owner plus repository, stage `pr-<n>` again with
  the Convex preview still named after the branch.
- 2026-10-06: Codex round 2 on PR A, two P1 items, both fixed in the template. Stack name is now
  `<owner>_<repository>` lowercased, from `GITHUB_REPOSITORY`: with a dash join, `team-a/app` and
  `team/a-app` would share one stack, and an owner name cannot contain an underscore, so the
  underscore join keeps every repository apart. Alchemy validates stage names but not stack names.
  The pull request stage is `pr-<number>` again (unique by construction, so a destroy can never hit
  another branch's stage), the Convex preview deployment keeps the raw branch name, and the Worker
  Preview name is derived from the stage. `scripts/alchemy-stage.ts` and `workerPreviewName` are
  gone. Verified in the sources: without `--adopt`, an existing same-name Worker or Convex project
  stops the deploy with `OwnedBySomeoneElse`; nothing is adopted or overwritten. This reverses the
  branch-named stage of the morning, which rested on a wrong claim about how Samebase matches Worker
  Previews (it uses the `branch` field that Workers Builds records, not the name). Manifest
  `samebase-base-actions-6b45e7b386ef`, 94 files. The test repository's old stack was destroyed from
  the laptop and its temporary Convex project deleted; the fixed template is deploying from zero.
- 2026-10-06: Hand test complete on the round 3 template, all from the repository's own Actions.
  Production from zero under the new stack name: 11 resources in 35 seconds, Convex production
  `judicious-shark-160`, site and backend 200. Pull request from branch `feature/preview-check`:
  stage `pr-1`, Worker Preview `pr-1` at `pr-1-tmp-actions-template.pfp.workers.dev` (200), Convex
  preview `limitless-walrus-548` with `previewIdentifier` `feature/preview-check` (200), comment
  with both URLs. Close: destroy of 5 resources in 11 seconds, preview deployment gone, preview
  URL 404. Codex round 3: one P1 (the workflow installs dependencies with the credentials in the job
  environment and without the `ci.yml` supply-chain audits) and one P2 (`pr-10000` and `pr-100000`
  collide when the Worker name uses all 54 characters). Fixes in progress: audits before the deploy
  with `--ignore-scripts` install, credentials scoped to the deploy and destroy steps, explicit
  Preview name with a fail-closed budget check.
