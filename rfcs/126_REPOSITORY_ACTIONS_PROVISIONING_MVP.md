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

`templates/base` stays the Workers Builds template. `templates/base-actions` is a second, complete
template: all of its files are committed, a person can open it, run `pnpm install` and
`pnpm run check` in it, and the repository exports publish it as `samebase/base-actions` the way
`templates/base` publishes as `samebase/base`. The exporter exports each template directory directly
into its own generated manifest (`starterSeedManifest.generated.ts`,
`starterSeedManifest.actions.generated.ts`), and `starterSeed.ts` takes the manifest as a parameter.
(An overlay layout, with only the differing files composed by the exporter, was built first and
replaced on Nicu's call; see the Status log.)

A sync check, `scripts/check-template-sync.ts` (`check:template-sync`, part of `check:scripts` and
CI), keeps the two templates one app: every path outside a declared list of deploy files must exist
in both with the same bytes and mode, so an app change applied to one template fails CI until it is
applied to the other. The declared list is exactly the deploy difference: `alchemy.run.ts`,
`.github/workflows/alchemy.yml`, `package.json`, `pnpm-lock.yaml`, `tsconfig.node.json`,
`.gitignore`, `README.md` on the Actions side; `wrangler.jsonc`, `scripts/build-cloudflare.ts`,
`scripts/verify-current-branch-head.ts` and their tests on the Workers Builds side.
`scripts/ensure-convex-auth.ts` is shared: the local dev launcher uses it in both. Local dev is the
same in both templates (`pnpm run dev`, the isolated anonymous backend); `alchemy dev` is not part
of the variant.

The run file names the Alchemy stack `<owner>_<repository>` (lowercase) from `GITHUB_REPOSITORY`,
and the Worker and the Convex project after the repository with Samebase's name rule (54 and 40
characters). The stack name must differ per repository: Alchemy keys state by stack name and stage,
and every stack in one Cloudflare account shares one state store; an underscore join keeps
`team-a/app` and `team/a-app` apart because an owner name cannot contain an underscore. The run file
reads `GITHUB_REPOSITORY` and `CONVEX_TEAM_ID` through `effect/Config`, process environment first,
then `.env`, and fails closed with a clear message when either is missing. Without `--adopt`, an
existing same-name Worker or Convex project stops the deploy with `OwnedBySomeoneElse`; nothing is
adopted or overwritten.

Stages: `prod` on a push to main; `pr-<number>` for a pull request (unique by construction, so a
destroy can never hit another branch's stage), with the Worker Preview named after the stage and a
fail-closed check that `pr-<number>` fits next to the Worker name in a 63-character DNS label. The
Convex preview deployment is named after the raw branch today (`PREVIEW_BRANCH`); the design review
asks for `pr-<number>` there too, and that change is a template follow-up. A `GitHub.Comment`
carries both URLs; a close destroys the stage.

The workflow installs with `--ignore-scripts`, runs the three supply-chain audits of `ci.yml`, then
`pnpm run check`, and gives the four credentials only to the deploy and destroy steps. No separate
bootstrap step: `alchemy deploy --yes` creates a missing Cloudflare state store itself. The
published repository `samebase/base-actions` has no secrets, so its own push to main would fail at
the deploy; a follow-up gates both jobs on the `CONVEX_TEAM_ID` variable being set.

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
- 2026-10-06: Codex round 3 fixes in PR A (commit `180ab135c`). Both workflow jobs now install with
  `pnpm install --frozen-lockfile --ignore-scripts`, run the three supply-chain audits of the
  template's `ci.yml` (`pnpm audit signatures`, `pnpm audit --prod`,
  `pnpm audit --dev --audit-level=critical`), then `pnpm run check`, and only the deploy and destroy
  steps get the four credentials. No install script is needed: `esbuild` and `workerd` find their
  binaries without their postinstall. The Worker Preview name is the stage, passed as
  `preview.name`, and the stack dies before any resource when `pr-<number>` does not fit next to the
  Worker name in a 63-character DNS label. Manifest `samebase-base-actions-14fa318a1291`. Codex
  round 4 and a redeploy of the test repository with the new workflow shape are running.
- 2026-10-06: PR A done. Codex round 4 found nothing. The audited workflow ran on the real runner:
  install without scripts, three audits, check, deploy with step-scoped credentials (2 updates).
  Test resources removed: `alchemy destroy --stage prod` from the laptop (9 deleted, project and
  production deployment retained by design), Convex project 3157834 deleted by exact name, GitHub
  repository `nicu-chiciuc/tmp-actions-template` deleted, local token file removed. The Convex team
  token `tmp-actions-template ci` has no delete endpoint in the Management API (`access_tokens`
  answers 404) and is deleted in the Convex dashboard by Nicu. PR #1690 marked ready for review;
  Nicu merges. Next: PR B (the mode in Samebase), after the open questions are answered.
- 2026-10-06: Direction change on the template layout, Nicu's call. The overlay (only the files that
  differ from `templates/base`, composed by the exporter) is replaced by a full
  `templates/base-actions` directory with every file committed, exported directly like
  `templates/base`, published as `samebase/base-actions`, and kept in sync by a check: every path
  outside a declared list of deploy files must be byte-identical in both templates. Deciding reason:
  a template must be a complete tree that a person can open, run, check, and publish as a
  repository; the overlay could only be tested through a composed scratch copy. PR B keeps using the
  same manifest export name. Also from Nicu: every decision in this document is the author's
  opinion, not an invariant, and Codex reviews must be free to challenge them; a design review of
  this RFC by Codex runs alongside PR B.
- 2026-10-06: Codex design review of this document (prompted as a review of an AI author's
  opinions), 13 findings. Dispositions, proposed by the author and open to Nicu:
  1. P1, repository access becomes provider-wide access (a repository writer can read Actions
     secrets through a workflow; the Cloudflare token is account-wide, the Convex team token is
     team-wide). Accepted as the main release gate. Options: accept for the dogfood with the blast
     radius written down; or a hybrid where Samebase creates the Convex project and project-scoped
     deploy keys and the stack never holds a team token. Decision pending.
  2. P1, the seed action requires a connected repository. Accepted: the order is create, connect,
     write secrets, seed, sync. Sent to PR B.
  3. P1, PR B must not be user-reachable before basic observation. Accepted in part: PR B shows
     "deployment runs in GitHub Actions" with a link to the Actions page; the experimental label
     stays until PR C observes the result. Decision on a hard gate pending.
  4. P2, resumable credential writes with a delivered revision and a retry path. Accepted, sent to
     PR B (`ciSecrets.written.credentialRevision`).
  5. P2, independent lifecycle for CI credentials (bindings, rotation, revocation). Partly accepted:
     the revision binding comes with PR B; rotation and a separate store are later. Correction to
     this document: the Convex Management API has `GET /teams/{team_id}/list_access_tokens` and
     `POST /teams/{team_id}/delete_access_token` (body `{ id }`, the token's name or secret value);
     the temporary token was deleted by name with it.
  6. P2, installation permission check before creation; Actions read for private runs. Accepted: the
     check is in PR B; the App needs Actions: read before PR C.
  7. P2, validate tokens against the saved account and team; region choice. Accepted for the token
     checks (PR B). The template has no region input yet; follow-up.
  8. P2, names as identities (use the repository id, `sb-<id>`). Not accepted as proposed: names
     follow Samebase's existing convention and give readable URLs; instead PR B pre-checks name
     availability before creating anything, as the current mode does, and a repository rename is
     documented as unsupported. Decision pending.
  9. P2, name the Convex preview `pr-<number>` too (two pull requests from one branch would claim
     one deployment). Accepted; template follow-up after the layout PR. Part C matches on it.
  10. P2, a stale rerun can deploy old code; check the head before deploying. Accepted; the base
      template's head check returns as a workflow step. Template follow-up.
  11. P2, the destroy job's vulnerability audits can block cleanup. Proposed: destroy keeps the
      no-scripts install and the signature audit, drops the vulnerability audits (they protect the
      deployed app, not the cleanup). Decision pending.
  12. P2, observation needs run outputs and one controller per resource. Accepted: PR B refuses
      Samebase's manual provider writes for this mode; PR C identifies the run by workflow path and
      job name.
  13. P3, make the discriminant required after a backfill; say "GitHub Actions" in the UI. Accepted;
      the backfill is a later step.
- 2026-10-06: Template layout PR open as draft
  [PR #1691](https://github.com/samebase/samebase/pull/1691): full `templates/base-actions` (94
  files, 87 byte copies of base plus the 7 deploy files), direct export per template,
  `check:template-sync` with the 12 declared deploy paths, publishing to `samebase/base-actions`, CI
  template matrix over both templates. The Template variant section above is rewritten to the final
  layout. Before the merge: create `samebase/base-actions` with a `main` branch, because the publish
  job now checks every target first and publishes nothing while one is missing. Template follow-ups
  queued: gate the workflow jobs on `vars.CONVEX_TEAM_ID`, Convex preview named `pr-<number>`, the
  head check before deploy, the destroy audit decision.
- 2026-10-06, Nicu's decisions on the design review: (1) credential scope is accepted for now
  (account-wide Cloudflare token, team-wide Convex token in the repository), to be revisited before
  real users get the option; recorded as the release gate in finding 1 above. (11) The destroy job
  keeps the no-scripts install and drops the vulnerability audits. (8) Names versus ids: explained
  again, decision still open; recommendation unchanged (readable names, README sentence that a
  repository rename is unsupported). (9) Nicu questions the pull request as the preview unit:
  Workers Builds and Convex previews are per branch and start on a branch push. Proposed in
  response: a branch model for the template (deploy on push to any branch but main, stage and Worker
  Preview from the branch made safe with a hash suffix only when the safe form differs, Convex
  preview named after the raw branch, destroy on the branch `delete` event, comment when a pull
  request is open). Decision pending.
- 2026-10-06: PR #1691 (full template with sync check): Codex review clean, required CI check green,
  marked ready. Merge order: create `samebase/base-actions` with a `main` branch, merge #1691, then
  this RFC.
- 2026-10-06, Nicu's decisions, second round: (8) repository renames are not supported for now, the
  names stay; one README sentence says so. (9) Previews are per branch, following Cloudflare Workers
  Builds, which builds a preview for every branch push: the template deploys on every push to a
  non-default branch, stage from the branch made safe (plus a 6-hex hash of the raw name only when
  the safe form differs), Convex preview named after the raw branch, Worker Preview named after the
  stage with a deterministic hash-suffixed cut when it does not fit the DNS label, comment only when
  a pull request is open, destroy on the branch `delete` event, both jobs skipped when the
  `CONVEX_TEAM_ID` variable is unset (the published copy `samebase/base-actions` has none), destroy
  job with the no-scripts install and the signature audit only, head check before the deploy. In
  progress as a template follow-up PR stacked on #1691. Where the template lives (monorepo today,
  maybe its own repository later) is a separate question Nicu named for later.
- 2026-10-06: PR #1691 merged as v2096 (main `d4b397d6a`). The export job published the full
  template to `samebase/base-actions` on its first run (repository created by Fable with Nicu's OK).
  Nicu's UI direction: the integration keeps the existing screens and slots and changes their
  sources per mode (deploy state from the `alchemy` check run, logs from the Actions run, URLs from
  the Worker and Convex project by name, previews per branch); one creation choice, one CI
  credentials section, mode-aware attention items, a row label; the adapter in the status reader is
  PR C and is where the complexity goes.
