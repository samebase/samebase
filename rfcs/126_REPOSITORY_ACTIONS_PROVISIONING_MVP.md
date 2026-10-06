# 126 Repository-Owned Provisioning Through GitHub Actions (MVP)

## Document Control

- Status: Proposal, in progress
- Owner: Nicu Chiciuc
- Created: 2026-10-06
- Last updated: 2026-10-06 (body rewritten after the direction audit; the Status log is the history)
- Base: `origin/main` at `d4b397d6a` (v2096)
- Evidence: `research/2026-10-05-alchemy-setup-stack-and-wrangler-split.md`
  ([PR #1685](https://github.com/samebase/samebase/pull/1685)); the model this RFC follows runs in
  production for Mail (samebase/convex-cloudflare-email-inbox: `apps/mail/cloudflare.config.ts`,
  root `alchemy.run.ts`) and Score Four (nicu-chiciuc/score-four: setup stack next to Workers
  Builds); [nicu-chiciuc/score-four-alchemy](https://github.com/nicu-chiciuc/score-four-alchemy) is
  the pure-Alchemy comparison only, not the model;
  [issue #1686](https://github.com/samebase/samebase/issues/1686)
- Related: `specs/115_REPOSITORY_RESOURCE_ATTACHMENT_MODEL_SPEC.md`,
  `rfcs/123_REPOSITORY_TERMINOLOGY_AND_DATA_MIGRATION_ROLLOUT.md`,
  `apps/samebase/convex/repository/provisioningModel.ts`,
  `apps/samebase/convex/repositoryProvisioningWorkflow.ts`, `scripts/export-starter-manifest.ts`
- Packages: `alchemy@2.0.0-beta.80`, `@samebase/alchemy-convex@0.3.0`,
  `@samebase/alchemy-cloudflare-workers-builds` (the Worker shell resource), `cf@1.0.0-beta.12`

## Goal

Find out whether Alchemy plus GitHub Actions can replace the provisioning that Samebase does today
in its own Convex workflows (create the Convex project, create the Worker, configure Workers Builds,
install the deploy keys). The test is one app created from samebase.com in the new mode that
provisions and deploys itself from its own repository. Everything in this document serves that test.
Out of scope for the MVP: `templates/base` and its move to `cloudflare.config.ts`, the template
location (monorepo or own repository), credential rotation, repository renames.

## Summary

1. Today Samebase provisions a new app itself: after it creates and seeds the GitHub repository, its
   workflow creates the Convex project, creates the Worker, configures Workers Builds, and installs
   the deploy keys, all with Samebase's own provider tokens.
2. This RFC adds a second mode next to it. Samebase creates the repository, writes three Actions
   secrets and one variable into it, seeds a template, and stops. The repository's own GitHub
   Actions workflow does the rest on every push: `alchemy deploy` creates the Convex project, its
   deployments, the deploy keys, the JWT keys, and the Worker shell, and pushes the Convex
   functions; `cf` builds and ships the Worker code that `cloudflare.config.ts` defines. Every
   branch gets a Convex preview deployment and a Worker Preview; deleting the branch destroys both.
3. No hard cut. The current mode stays the default until the new mode has created and run a real app
   from samebase.com. The choice is made per repository at creation and recorded on its provisioning
   plan.
4. Three pull requests: the template (PR A, merged, then reshaped by its follow-ups), the mode in
   Samebase (PR B), and the observation that makes the dashboard show the new repositories (PR C,
   verified against a repository PR B created).
5. This document is the direction, not a contract. Every decision in it is the author's proposal;
   reviewers, Codex included, challenge them. When a section changes, the Status log records what
   changed and why.

## Decisions

### The seam: who provisions

A repository's provisioning plan says who provisions it:

- `samebase` (today): Samebase's workflow runs the attach, configure, and rotate steps.
- `repository_actions` (new): the repository's GitHub Actions run `alchemy deploy` and `cf`.
  Samebase only creates the repository, writes the CI secrets, and seeds the template.

### The template follows the Mail and Score Four model

The split proven in Mail and Score Four applies unchanged, with GitHub Actions as the runner instead
of Workers Builds:

- `cloudflare.config.ts` owns the Worker's own things: name, compatibility date, assets handling,
  bindings, previews. `cf build` produces the Build Output; `cf deploy --prebuilt` ships it on the
  default branch; `cf previews deploy --prebuilt <name>` ships a Worker Preview on any other branch.
- `alchemy.run.ts` owns lifecycle and cross-provider wiring: the Worker shell (the retained Worker
  resource of our package, named from the config), the Convex project, the deployment of the stage,
  the deploy keys, the JWT keys, the functions push, and the values the two sides must share. The
  stack never uploads Worker code. One owner per field.
- The workflow owns the order: `alchemy deploy`, then the app build with the Convex URL, then `cf`.

### Previews per branch

Workers Builds and Convex previews are per branch and start on a branch push, so the template
follows that. A push to the default branch deploys stage `prod`. A push to any other branch deploys
a preview stage; a branch deletion destroys it. Pull requests are not the unit: when a pull request
is open for the branch, the run comments the URLs on it.

### Credentials

Samebase's own provider connection stays as it is: OAuth by default, API token as the option. The
new mode needs a second kind of credential, one that lives in the user's repository as an Actions
secret and that the GitHub runner uses:

| Secret or variable      | Source                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | A user API token for CI, created by the user, pasted once per organization                                                                     |
| `CLOUDFLARE_ACCOUNT_ID` | Samebase knows it from the connection                                                                                                          |
| `CONVEX_ACCESS_TOKEN`   | A Convex team access token, pasted once per organization (link to the team's access tokens page); minting through OAuth is a later improvement |
| `CONVEX_TEAM_ID`        | Variable (not a secret). Samebase knows it from the connection; `Convex.Project` needs the numeric id                                          |

Accepted for the MVP (Nicu, 2026-10-06): both tokens are account-wide or team-wide, and anyone who
can push a workflow to the repository can read them, so one compromised repository exposes the
sibling apps of the account and team. This is the release gate before real users get the option
(later question 16 in the memory, finding 1 of the design review). OAuth cannot replace the
Cloudflare token today: access tokens expire within hours, and token minting is open only to
Cloudflare's own CLI. Samebase never puts its own OAuth tokens into user repositories.

### The template does not get edited at seed time

`cloudflare.config.ts` and `alchemy.run.ts` read the app name from `GITHUB_REPOSITORY` through one
shared module, and the team id from `CONVEX_TEAM_ID`. The template is byte-identical for every app,
and the seed is a plain copy. A developer who runs it from a laptop sets the same values in `.env`.

### Names

The stack is `<owner>_<repository>` (lowercase); the Worker and the Convex project take the
repository name with Samebase's name rule. Without `--adopt`, a same-name Worker or project that is
not in the stack's state stops the deploy with `OwnedBySomeoneElse`; nothing is adopted or
overwritten. Renaming the repository is not supported for now and the template README says so.

### Default stays `samebase`

The creation form offers the new mode as "Set up by GitHub Actions in the repository
(experimental)". `repository_create` takes an optional `provisioning` argument that defaults to
`samebase`. Changing the default is a decision for after the dogfood run.

## Schema

Every change is additive: no existing row changes shape, no backfill, no two-step deploy.

- `workflow_repositoryProvisioning_plans` becomes a union of two objects: the existing object,
  unchanged (its absence of `provisioning` means `samebase`), and
  `{ provisioning: "repository_actions", repositoryId, convexConfigPath, ciSecrets, seed, createdAt, updatedAt }`
  with `ciSecrets: { state: "planned" } | { state: "written", writtenAt, credentialRevision }` and
  `seed: { state: "planned" } | { state: "seeded", seededAt, manifestVersion }`. One function
  returns the mode of a plan. A required discriminant on both variants comes with a backfill when
  the mode is accepted, not now.
- `organizationCiCredentials`: a new table, one row per organization, with optional `cloudflare`
  (`apiToken`, `accountId`, `connectedByUserId`, `updatedAt`) and `convex` (`accessToken`, `teamId`,
  `connectedByUserId`, `updatedAt`) entries, indexed by organization and by the saving user, so
  provider disconnects and account deletions of one member never delete another member's tokens.
  Organization deletion removes the row. `organizationProviderCredentials` is unchanged.
- `workflow_repositoryProvisioning_runs`: the step union gets `write_actions_secrets`.
- Not changed: `repositories`, the attachment tables, the write locks, the provider API log.

## The template

`templates/base` stays the Workers Builds template and is not touched. `templates/base-actions` is a
second, complete template: all files committed, runnable and checkable in place, exported directly
to its own manifest and published as `samebase/base-actions`. A sync check keeps every path outside
a declared list of deploy files byte-identical between the two templates.

Its deploy files: `cloudflare.config.ts` and `wrangler.config.ts` (the Worker), `alchemy.run.ts`
(the stack), `.github/workflows/alchemy.yml`, the stage and head-check scripts, the Worker build and
Preview delete scripts, `package.json`, `pnpm-lock.yaml`, `tsconfig.node.json`, `.gitignore`,
`README.md`. Local dev is the same as in the base template; `alchemy dev` is not part of it.

Workflow: triggers `push` on every branch and `delete`; both jobs run only when the repository
variable `CONVEX_TEAM_ID` is set (the published copy has none). The deploy job installs with
`--ignore-scripts`, runs the three supply-chain audits of `ci.yml`, runs `pnpm run check`, checks
that the pushed commit is still the branch head (exact Git ref, no redirects), runs
`alchemy deploy`, builds the app with the Convex URL, and ships with `cf`. The destroy job installs
with `--ignore-scripts`, runs the signature audit only, checks that the branch is still absent, then
runs `alchemy destroy` and deletes the Worker Preview through the Previews API (`cf previews` has no
delete). Credentials exist only on the deploy, ship, and destroy steps.

Stage rule: the default branch gives `prod`; any other branch gives its safe form (lowercase, runs
of other characters as one dash, cut to 40) plus 16 hex of sha256 of the raw name, so two branches
never share a stage. Worker Preview name: the stage cut to the DNS budget plus 6 hex of sha256 of
the stage; the README states that this can collide in rare cases and that a long Worker name makes
it more likely. The Convex preview deployment is named after the raw branch, the name
`convex deploy --preview-name` gives it under Workers Builds and the name Samebase matches on.

## The new workflow mode

For `provisioning: "repository_actions"`, after the pre-checks in `repository_create` (both CI
tokens saved, verified, and matching the connected account and team; the installation's granted
`secrets` and `actions_variables` write permissions; name availability), the run executes:
`validate_connections`, `create_github_repository`, `connect_github_repository`,
`write_actions_secrets` (upsert the three secrets sealed with the repository public key, create or
update the variable, record the credential revision), `seed_starter` (the actions manifest, on
`main`; the repository default branch is set to `main` when GitHub created another one),
`sync_tree`, `finish`. It skips every Samebase provider step, and Samebase's manual provider writes
refuse this mode. A failed secrets write, seed, or tree sync is retried without seeding twice. The
retry confirmation describes this operation. The end of the run means "repository prepared"; the
status says that deployment runs in the repository's GitHub Actions, with a link, until PR C
observes the result.

The Samebase GitHub App needs Secrets (write) and Variables (write) for the secrets step (done on
the production App on 2026-10-06, installations accepted) and Actions (read) for PR C to read
workflow runs of private repositories. The change applies to every App instance.

## Observation (PR C)

For a `repository_actions` repository the status read shows the `alchemy` check on the default
branch head as the deploy status and the check on a branch head as the preview status, with the
Actions run as the logs link; after the first green run on the default branch it finds the Worker
and the Convex project by the repository name and records them through the existing attach
contracts; it reads a branch's Worker Preview by the name rule above and its Convex preview by
`previewIdentifier`. Samebase's screens and slots stay the same; only their sources change per mode.

## Pull requests

| PR  | Content                                                                                                                                                                                                                                                                            | State                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| A   | The template and its manifest ([#1690](https://github.com/samebase/samebase/pull/1690)); full template with sync check ([#1691](https://github.com/samebase/samebase/pull/1691)); previews per branch and the Mail model ([#1693](https://github.com/samebase/samebase/pull/1693)) | 1690 and 1691 merged; 1693 in progress |
| B   | Plan variant, `organizationCiCredentials`, CI credentials UI, secrets write, the workflow mode, `repository_create` argument, creation form choice ([#1692](https://github.com/samebase/samebase/pull/1692))                                                                       | In review                              |
| C   | Observation and status reads for the mode                                                                                                                                                                                                                                          | After the dogfood of PR B              |

## Execution

- Fable manages. Opus subagents implement, one worktree per PR. Codex reviews each PR until a pass
  finds nothing, with the title stating that the RFC is the author's proposal open to challenge; a
  design review of the RFC itself ran on 2026-10-06. When a Codex finding contradicts a decision, it
  goes to Nicu with an assessment, not a defense.
- Nicu merges samebase/samebase PRs. Fable may merge package and app PRs when that unblocks the
  chain.
- Disposable resources use the `tmp-` prefix. Nothing deletes a Convex project that is not `tmp-`
  prefixed; `Convex.Project` retains by default. The Cloudflare state store Worker
  `alchemy-state-store` is never deleted.

## Test plan

- Unit: the exporter and the sync check, the sealed box against a known vector, workflow step
  dispatch for both modes, plan narrowing, the stage and Preview-name rules, the head check.
- Hand test of the template: a temporary repository with the four values set deploys production from
  zero, a branch gets a preview and a comment, the branch deletion destroys it. Done for the first
  template shape on 2026-10-06; to repeat for the Mail-model shape.
- Dogfood of PR B on production samebase.com: paste the two CI tokens once, create one temporary app
  in the new mode, watch the repository's run create the Convex project, the keys, and the Worker,
  then delete the app's resources. This is the test the RFC exists for.

## Decided and still open

Decided (Nicu, 2026-10-06): additive plan variant; credential scope accepted for now; previews per
branch; names stay, renames unsupported; destroy job without vulnerability audits; template as a
full directory; the template follows the Mail model. Open: a hard release gate between PR B and PR
C; Convex token minting per repository (spike pending); the template location long term.

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
- 2026-10-06: PR B open as draft [PR #1692](https://github.com/samebase/samebase/pull/1692), 5
  commits, 2606 app tests green. As built: plan union variant with
  `ciSecrets.written.credentialRevision`; `ci` credentials on the organization with paste, verify
  (Cloudflare `/user/tokens/verify` plus account match; Convex `projects?limit=1` on the connected
  team), and remove; sealed secrets write in pure JavaScript (`@noble/curves`, `@noble/ciphers`,
  `@noble/hashes`; `libsodium-wrappers` only in the test); step order validate, create, connect,
  `write_actions_secrets`, seed, sync, finish; pre-checks in `repository_create` including the
  installation's granted `secrets` and `actions_variables` permissions; retry resumes the secrets
  write, the seed, and the sync; manual provider writes refuse the mode; "GitHub Actions" copy;
  status says deployment runs in GitHub Actions with a link. Corrections from building: the event
  step union also needs `write_actions_secrets`; the `getUserRepositories` contract gains the plan
  variant, three setup steps, and `github` as a setup provider; account deletion does not remove CI
  tokens saved by the deleted user (needs an index, deferred). Open: the minimal Cloudflare CI token
  permissions (Account Settings Read, Workers Scripts Edit, Secrets Store Edit) are from the Alchemy
  docs and source, not yet proven by a hand test. Codex round 1 running.
- 2026-10-06: Branch-model follow-up open as draft
  [PR #1693](https://github.com/samebase/samebase/pull/1693) against main (PR #1691 had merged
  meanwhile). As built: triggers `push` on every branch and `delete`; stage from
  `scripts/alchemy-stage.ts` (default branch gives `prod`; otherwise the safe form plus a 6-hex hash
  only when it differs from the raw name; `prod` or empty fails); Worker Preview name from
  `workerPreviewName(stage, worker)` with a hash-suffixed cut when the stage does not fit; both jobs
  gated on `vars.CONVEX_TEAM_ID`; head check `scripts/check-branch-head.ts` before the deploy (a
  superseded push ends green with "Nothing was deployed"); destroy job with the no-scripts install
  and the signature audit only; comment on the oldest open pull request of the branch, looked up
  with `fetch` and `GITHUB_TOKEN` (Alchemy's Octokit is not usable from the run file), only on
  `push` events. Manifest `samebase-base-actions-1e1976146235`, 98 files. Codex round 1 running.
  Nicu's assumption, recorded: the first real template for the mode relies on `cloudflare.config.ts`
  plus `alchemy.run.ts`, with the Worker defined the Cloudflare way and deployed by `cf` from
  Actions, and the stack owning Convex and the wiring; assessment pending.
- 2026-10-06: Focus restated by Nicu: the MVP question is whether Alchemy plus GitHub Actions can
  replace the provisioning Samebase does in its Convex workflows; the test is one app created from
  samebase.com in the new mode. The base template and the `cf` migration are not part of it; the
  `cf` shape stays recorded as the later direction for the template. Codex round 1 on PR B: P1, a
  retry that re-seeds after a failed tree sync force-updates the default branch and drops later
  commits (fix: a seed-completion checkpoint on the plan); P2, a saved retry context from before
  this change lacks the mode field (fix: read it defensively as `samebase`); P2, a default branch
  other than `main` never deploys with the current template trigger (resolved by PR #1693, so PR B
  merges after it). Codex round 1 on PR #1693: two P1 collisions with constructed branch names (fix:
  a hash in every preview stage and every Preview name) and a P2 delete rerun after a branch is
  recreated (fix: check the branch is absent before destroying). Fixes in progress on both.
- 2026-10-06: Codex round 2 on PR B, one P1 and three P2s, all accepted. P1: the mode seeds `main`
  and sets the repository default branch to `main` when the owner's default differs, so PR B no
  longer depends on PR #1693. P2: the CI credentials move to their own table,
  `organizationCiCredentials`, indexed by organization and by the saving user, so provider
  disconnects and account deletions of one member cannot delete another member's tokens (this
  changes the Schema section: the `ci` field on `organizationProviderCredentials` goes away, a new
  table comes instead; still additive). P2: an initial create run that fails in the seed or the tree
  sync is admitted to retry. P2: the retry confirmation describes the mode's operation (secrets and
  variable write, seed if needed, tree sync). Codex round 2 on PR #1693: one P2, the branch check
  must query the exact Git ref and not follow GitHub's rename redirects. Fixes in progress on both.
- 2026-10-06: Codex round 3 on PR #1693 brute-forced true 6-hex collisions (24 bits) for both the
  stage and the Preview name. Decision: the stage, an internal state key, takes 16 hex characters of
  sha256 of the raw branch name; the Preview name keeps 6 (a 16-character suffix in every preview
  URL is a visible cost, the accidental risk is about 1e-5 at 20 open branches, and the 8-character
  budget of a 54-character Worker name cannot be fixed by any hash length). The README states the
  limit: previews of different branches can collide in rare cases, and a colliding deploy replaces
  the other branch's preview. Alchemy reuses a Preview of the same name without an ownership check;
  a provider-side ownership tag would be the real fix, later.
- 2026-10-06: PR B round 2 fixes in (commit `ce0da0b36`, 2614 tests green). Schema as built now: the
  `repository_actions` plan variant with `ciSecrets` and `seed` checkpoints; a new table
  `organizationCiCredentials` (one row per organization, `cloudflare` and `convex` entries, indexes
  by organization and by the saving user); `organizationProviderCredentials` unchanged from main;
  the run step literal `write_actions_secrets`. The mode seeds `main` and sets it as the default
  branch when GitHub created another one. Initial runs that fail in the seed or the tree sync are
  admitted to retry. The retry confirmation describes the mode's operation. Account deletion removes
  only the CI entries the deleted member saved. Codex round 3 running.
- 2026-10-06: Correction, Nicu's call, of an author error. The Actions template must follow the
  model Mail and Score Four already run: `cloudflare.config.ts` owns the Worker and `cf` ships it;
  the setup stack owns the Worker shell (our package's Worker resource, retained), the Convex side,
  and the wiring, and never uploads Worker code. PR A and the first version of PR #1693 used
  `Cloudflare.Website.Vite` from the score-four-alchemy copy instead, which was only the pure
  Alchemy comparison. PR #1693 is back in draft and gets the rewrite: `cloudflare.config.ts` plus
  `wrangler.config.ts`, the Worker shell in the run file, the Vite build with `VITE_CONVEX_URL` from
  the stack, `cf deploy --prebuilt` on the default branch and `cf previews deploy --prebuilt <name>`
  per branch with the name from `workerPreviewName`, and a Previews API delete on branch deletion
  (`cf previews` has no delete in beta.12). The branch-model skeleton stays. No change to
  `templates/base` is part of this.
- 2026-10-06: Direction audit of the whole body after the Worker-model correction. Besides
  `Website.Vite`, the body still described pull request stages instead of previews per branch, PR A
  as an overlay, the old schema (`ci` field, no seed checkpoint), the old step order (secrets before
  connect), the old destroy audits, and four open questions already answered. The body is rewritten
  to the current direction: Goal section, the Mail and Score Four model, previews per branch, the
  schema as built, the mode as built, the decisions taken. The Status log above this entry is the
  history and keeps its older wording.
- 2026-10-06: PR B Codex round 4 clean (196 focused tests, type check). PR #1692 goes to ready for
  review when its CI is green; it no longer depends on PR #1693. Next: Nicu merges it, then the
  dogfood on production samebase.com (paste the two CI tokens once, create a temporary app in the
  new mode, watch the repository's run), then PR C.
- 2026-10-06: The Convex token spike is answered by the Management API spec: `create_access_token`
  accepts a personal access token or an OAuth team token, and `delete_access_token` takes the
  token's name or value. Samebase mints the Convex CI token per repository with its existing OAuth
  connection and revokes it by name; the Convex paste leaves PR B, the Cloudflare paste stays (the
  Cloudflare side has no third-party minting yet). The providers page gets a prefilled token link:
  `workers_scripts` edit, `secrets_store` edit, `account_settings` read, with the organization's
  account id. The dogfood confirms the OAuth minting live.
- 2026-10-06: PR #1693 rebuilt on the Mail model (head `28f7ac012`): `cloudflare.config.ts` and
  `wrangler.config.ts` own the Worker; `scripts/deploy-names.ts` is the one owner of the stack,
  Worker, Convex project, and Preview names; the run file keeps the Convex side and adds the Worker
  shell (`WorkersBuilds.Worker`, retained), no `Website.Vite`, no GitHub resources; the deploy job
  runs `alchemy deploy`, reads the outputs with `alchemy state read <stack>/<stage>/output` into
  `VITE_CONVEX_URL`, builds without credentials, then `cf deploy --prebuilt` or
  `cf previews deploy --prebuilt <name>` (cf uses the positional name as given), then comments from
  a script; the destroy job runs `alchemy destroy` and one `DELETE .../previews/<name>`. Verified
  from the laptop: the state read prints the outputs as one JSON object; deleting a missing Preview
  answers 404 "Preview not found". Not yet verified: the workflow end to end on a runner. One
  manifest test line (`"wrangler"` must not appear) is being replaced, since `cf build` needs
  Wrangler. Codex review and a hand test follow; PR #1693 must merge before the dogfood so that the
  seeded template is the intended one.
- 2026-10-06: Codex round 4 on PR #1693 (the Mail-model rebuild): two findings ask for a migration
  from the earlier template shape (Worker owned by `Website`, `pr-<number>` stages); not applicable,
  no app was ever deployed with it except the destroyed hand-test repository, and the PR body
  records that. One real fix: the comment script follows the comment pagination before creating a
  comment. Then CI, ready for review, and the hand test on a runner if Nicu wants it before the
  merge.
- 2026-10-06: PR #1693 squash-merged by Fable with Nicu's go (v2097). The App now has Actions read
  and write on the production and development instances, next to Secrets and Variables; no further
  permission request is foreseen for this mode. The runner hand test is skipped by decision: the
  dogfood is the first run on a runner, and the repository Samebase creates for it, with its secrets
  already written, is where any workflow fix gets debugged. Next: PR B's last two commits, Codex
  round 5, rebase onto main, merge, dogfood.
- 2026-10-06: After the merge of PR #1693 the export job published the Mail-model template to
  `samebase/base-actions`, and the published copy's own `alchemy` workflow now ends with both jobs
  skipped by the `CONVEX_TEAM_ID` gate instead of failing. The RFC pull request carries the fresh
  label v2098.
- 2026-10-07: PR B final shape before its fifth Codex round (label v2098, rebased on v2097, 2622
  tests): the providers page links to the prefilled Cloudflare token form; `write_actions_secrets`
  mints the Convex team access token through the organization's Convex OAuth token
  (`samebase/<owner>/<repository>`, no expiry), writes it as the secret, stores only the name on the
  plan, deletes the old one by name before a retry mints again, and deletes it when the repository
  is removed from Samebase; the Convex paste is gone, and the mode requires a Convex connection made
  with OAuth. Open for Nicu: whether removal of a repository from Samebase should revoke that token
  when the GitHub repository is kept (the agent built "revoke"; the other resources of a removed
  repository are retained, so "retain" would be the consistent choice). Dogfood check: the scope of
  the minted token (team-wide is expected).
- 2026-10-07, Nicu's decision: retain. Samebase never revokes what a repository needs to keep
  working, consistent with the landing page promise that apps keep working after the Samebase
  account is deleted. The minted Convex token stays when a repository is removed from Samebase and
  on account or organization deletion; only a retry replaces it. Applied to PR B.
- 2026-10-07: Codex round 5 on PR B, both accepted. P1: with the merged template the stage comes
  from the push's `ref_name` against the repository's default branch, so `main` must be the default
  before the push that carries the workflow (bootstrap `main` without workflow files, set the
  default, then push the seed). P2: record the intended Convex token name on the plan before the
  mint request, so an interrupted mint is deleted by name on retry. Fixes in progress together with
  the retain change; one more Codex round follows.
- 2026-10-07: PR B commits `81e0fe19a` (retain the minted token) and `da6c4eafa` (round 5 fixes):
  `main` is bootstrapped without starter files, made the default when it is not, and only then
  receives the starter commit; the token name is recorded as `minting` before the request and a
  retry deletes by name then mints. 2625 tests green. Codex round 6 running. The GitHub docs do not
  say whether the first pushed branch of an empty repository becomes the default, so the step reads
  the default again instead of assuming; the dogfood shows the real behavior.
- 2026-10-07: PR B Codex round 6 clean, CI green on `da6c4eafa`, ready to merge (six Codex rounds in
  total). After the merge, production samebase.com has the mode behind the experimental choice; the
  dogfood follows: paste the Cloudflare CI token through the prefilled link on the providers page,
  create a `tmp-` app with the GitHub Actions option, watch the repository's run.
- 2026-10-07: Preview test by Nicu on PR B. The Cloudflare CI token save worked but the saved state
  was not visible enough (fix: who and when, "Replace" button, "paste a new token to replace it");
  the providers page lacked end spacing (fix in the same commit); the New app option stayed disabled
  because the organization's Convex connection is an API key, and the disabled line did not say
  which requirement was missing (fix: name the missing part). Verified live: a Convex team access
  token cannot create another one (`403 NotAllowed`), so an API key connection cannot mint. Decision
  pending: require OAuth, or fall back to writing the connection's own API key as
  `CONVEX_ACCESS_TOKEN` for API-key organizations (recommended; same scope, shared lifecycle).
- 2026-10-07, Nicu's decision: option 2. Organizations whose Convex connection is an API key get
  that key written as the repository's `CONVEX_ACCESS_TOKEN` (same team-wide scope as a minted
  token, shared lifecycle with the connection); OAuth organizations keep the minted token; the OAuth
  requirement on the New app option goes away. The Convex API key entry and the CI credentials copy
  link to the team's access tokens page in the Convex dashboard (`/t/<team>/settings/access-tokens`,
  the page Samebase already links for API-key connections; Convex has no prefilled-token URL).
  Applied to PR B together with the preview-test fixes.
- 2026-10-07, Nicu's decision, final for the MVP: Convex works like Cloudflare. A Convex team access
  token is pasted once per organization on the providers page and written as `CONVEX_ACCESS_TOKEN`;
  no minting, no API-key fallback, no dependence on the Convex connection method. The CI credentials
  row links to the team's access tokens page in the Convex dashboard. Minting through OAuth stays
  recorded as a later improvement. This supersedes the "option 2" entry above before it shipped.
- 2026-10-07: PR B final shape (commits `7f135fe81`, `4aad05930`; 2622 tests): two pasted CI tokens
  per organization, Cloudflare (prefilled token link) and Convex (link to the team's access tokens
  page), both with the saved-state display and a Replace field that wraps under the field on a
  narrow pane; `write_actions_secrets` writes them and the account id as secrets and the team id as
  a variable; the New app option requires both tokens and names the missing one; `main` is the
  default branch before the starter push; minting and its states are gone. Codex round 7 running.
- 2026-10-07: Two unrelated blockers handled. A new critical advisory for `shell-quote` and a high
  one for `sharp` fail the supply-chain check on every branch; fix in
  [PR #1694](https://github.com/samebase/samebase/pull/1694) (overrides plus an exact release-age
  exception with a removal date). Codex round 7 on PR B found one P1: a starter push that succeeds
  while the `seeded` checkpoint is lost makes a retry force-update `main` again; fix in progress
  (record the intended tree before the push, on retry compare GitHub's `main` with it, never
  force-update over foreign commits).
- 2026-10-07: PR #1694 merged (v2098); PR B rebased, label v2099. Codex round 8 on PR B, one P1: the
  starter push was still a force update after the branch check, so a push between the check and the
  update would be dropped. Fix in progress: the starter commit descends from the checked head
  (bootstrap, starter) and the ref update is a plain fast-forward; a rejected update re-reads the
  branch and applies the same rules; never force.
- 2026-10-07: PR B commit `8c25112d7`: the starter commit descends from the bootstrap head and
  `main` is updated without force; a rejected update (head moved) re-reads the branch and applies
  the same rules, up to three times; the seeded `main` has two commits (bootstrap, starter). 2631
  tests green. Codex round 9 and CI running.
- 2026-10-07: PR B Codex round 9 clean (221 focused tests), CI green on `8c25112d7`, on the latest
  main, label v2099: ready to merge. Nine Codex rounds in total. The dogfood follows the merge: on
  production samebase.com or on the PR's preview deploy, save the Convex CI token next to the saved
  Cloudflare one, create a `tmp-` app with the GitHub Actions option, and watch the repository's run
  create the Convex project, the keys, and the Worker.
- 2026-10-06: First dogfood run, on the PR B preview deploy, app `samebase/tmp-alchemy-testing-01`.
  The Samebase side worked at the first attempt: repository, the three secrets and the
  `CONVEX_TEAM_ID` variable, the bootstrap and starter commits, default branch `main`, and the
  `alchemy` run started. Two blockers, both outside PR B's code. (1) The `samebase-dev` App
  installation on the `samebase` organization had not granted the Variables permission (the
  production App had); the error message named the installation page and Nicu accepted it. (2)
  `alchemy state read` evaluates `alchemy.run.ts` under the CLI's placeholder stage, and the stack's
  guard "a preview stage needs PREVIEW_BRANCH" killed the step after a successful deploy (11
  resources). Fix: `--backend cloudflare`, the config-less read of the account's default state
  store, which is the store the stack configures. Pushed to the dogfood repository, the run went
  green end to end and the Worker answers at `tmp-alchemy-testing-01.pfp.workers.dev`. Template fix
  PR follows. The dashboard shows the app as "2/4 pending": PR C's scope.
