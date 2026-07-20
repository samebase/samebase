# Vault-Level Provider Discovery Flow Research

## Document Control

- Status: current-state research
- Owner: Samebase vault provider resources and existing repository onboarding
- Created: 2026-07-20
- Prompt: simplify existing repository setup after PR
  [#1243](https://github.com/samebase/samebase/pull/1243) by discovering Cloudflare Workers and
  their app roots, using `SAMEBASE_CONVEX_PROJECT` as Worker-to-Convex evidence, and testing whether
  the dashboard needs only vault-level `?add-cloudflare` and `?add-convex` entry points.
- Related:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/098_VAULT_DELETION_WORKFLOW_SPEC.md`
  - `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`
  - `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`
  - `specs/110_VAULT_ROUTE_SURFACE_SPEC.md`
  - `research/2026-05-19-existing-app-resource-adoption.md`
  - `research/2026-05-22-provider-resource-discovery-and-configuration.md`
  - `research/2026-07-06-cloudflare-worker-create-connect-live-test-matrix.md`

## Recommendation

Keep `vaultApps`, but remove app-root creation from the user mental model.

A vault is a GitHub repository. A vault app is the internal identity for one canonical repository
app or configuration root. Users should create or reveal that identity by adding a real provider
resource, not by first creating an empty app root.

The dashboard should expose exactly two vault-level provider entry points:

1. `?add-cloudflare`
2. `?add-convex`

`?add-cloudflare` should discover Workers connected to the vault's immutable GitHub repository id,
group them by their normalized Workers Builds `root_directory`, and ask once before creating or
reusing the corresponding app roots and attaching the selected Workers.

`?add-convex` should discover committed `convex.json` files and list Convex projects at vault scope.
The parent directory of the selected config is the project's read-only app root. Valid
`SAMEBASE_CONVEX_PROJECT` markers rank projects and can preselect one unique root-equality
suggestion, but the project/config association becomes exact only when the user confirms it. The
user never types or edits a root.

When Add Cloudflare finds a marker-referenced project that the current Convex connection can verify,
its review can include a separately selectable `Also add` row. That row either uses one unique
Worker-root/config-root suggestion or asks the user to choose among discovered `convex.json` paths.
This makes the common existing-repository path one confirmation without pretending that a marker
alone proves the backend location.

Use automatic read-only discovery inside the provider modal followed by explicit confirmation. Do
not scan during repository onboarding or silently attach provider resources. An attachment
establishes durable identity and cleanup provenance even when it does not mutate the provider.

Do not persist transient inventory or provider-observation payloads, and do not persist a
Worker-to-Convex edge. Persist only confirmed attachments and their project/config association.
GitHub remains the live source for qualifying config paths. Cloudflare remains the live source for
Worker repository, root, Builds, and Worker-to-Convex configuration.

## Why PR #1243 Makes This Viable

PR #1243 reduced the durable model to stable identities and moved mutable provider state back to
live reads:

| Concept                                           | Durable Samebase state                       | Live provider state                                                     |
| ------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| Repository                                        | `vaults` GitHub identity                     | current GitHub repository and tree                                      |
| App root                                          | one `vaultApps` row per canonical root       | Worker `root_directory` or GitHub `convex.json` evidence                |
| Worker                                            | `vaultCloudflareWorkers` identity and origin | existence, URLs, triggers, repository connection, environment variables |
| Convex project                                    | identity, app mapping, and origin            | project details and default production deployment                       |
| Worker Builds declares Convex project coordinates | none                                         | `SAMEBASE_CONVEX_PROJECT` on Builds triggers                            |

The Cloudflare invariants already support the proposed result:

- one app row per normalized root in a vault
- multiple Cloudflare Workers attached to one app
- one exact Worker attached globally in Samebase
- `selected_existing` attachments remain provider-owned for cleanup

Keep `vaultConvexProjects.appId`. Samebase must durably remember which cloud project the user mapped
to which code root because current `convex.json` does not contain stable project identity. Tighten
the write boundary instead: public attachment accepts a discovered `convexConfigPath`, re-reads it
from GitHub, derives its parent root, creates or reuses the app, and stores the resulting `appId`.

Remove only the one-project-per-app invariant. Convex explicitly supports deploying one codebase to
several projects, such as a persistent staging project. Several `vaultConvexProjects` rows may
therefore share one `appId`. Replace the current `(teamId, projectId)` exclusivity key with global
`projectId` exclusivity, and treat `teamId` as mutable current ownership when a project transfers
teams. `SAMEBASE_CONVEX_PROJECT` remains the live Worker-to-project edge.

Today Samebase is both the source and the unconstrained input for a Convex project's owning root:
the attach flow accepts an existing `appId`, and Data and Schema routes infer one project from that
app. The improved split is narrower. GitHub proves qualifying config paths at a commit, Samebase
treats their parent directories as allowed code roots, Convex proves current project identity and
ownership, the user confirms the association with or without a root-equality suggestion, and
Samebase persists that association. Multiple projects under one root means Data and Schema
navigation must select the project identity instead of assuming the root uniquely identifies it.

## Current Flow And Its Friction

Connecting an existing repository intentionally creates no app rows and performs no provider setup.
The current dashboard flow is therefore:

1. open `?add-app-root`
2. decide whether the repository is an app or monorepo
3. create one empty app root
4. open `?add-cloudflare&app-root=<root>` for that app
5. open `?add-convex&app-root=<root>` for that app
6. repeat the provider links for every additional app root

This exposes an internal ordering constraint rather than the user's goal. The user already chose a
repository and usually wants to connect resources that already know their deployment root.

The runtime also disagrees with the accepted route text in specs 105 and 106. Those specs describe
bare provider flags, while route normalization currently discards `?add-cloudflare` and
`?add-convex` unless `app-root` names an existing app.

Cloudflare discovery already performs most of the expensive work, but it is inverted. It accepts a
known app root, scans up to 100 Workers, reads each Worker's triggers, and asks whether each Worker
matches that root. Vault-level discovery should scan once by repository id and return the roots
found in the matching triggers.

## Target Mental Model

The Cloudflare user-facing rule should be:

> Add a Worker. Samebase puts it in the app represented by Cloudflare's configured root directory.

This removes the separate app-versus-monorepo decision. One discovered root means one app. Several
discovered roots mean a monorepo. An existing Worker's app root is never editable in Samebase: it is
the exact normalized `root_directory` observed from Cloudflare. Missing or ambiguous provider root
evidence makes that Worker unavailable for attachment instead of creating a local override.

The Convex user-facing rule should be:

> Add a Convex project at the app root defined by `convex.json`. Samebase shows which Workers
> reference it from their live Cloudflare configuration.

Convex inventory does not expose a GitHub repository or source root. GitHub proves qualifying
committed config paths, and Samebase defines their parents as allowed app roots. Neither proves
which cloud project a config deploys. Project identity, config location, their confirmed
association, and Worker usage are therefore separate facts.

### Vault-Level Route Semantics

- `/vault/<owner>/<repo>?add-cloudflare` opens the Cloudflare flow for the vault.
- `/vault/<owner>/<repo>?add-convex` opens the Convex flow for the vault.
- Neither route requires `app-root`.
- Both routes require the authorization used to create durable vault resources. Provider-connection
  access alone should not open a flow that cannot complete.
- Add Cloudflare displays Worker roots as read-only provider evidence. Add Convex displays
  discovered `convex.json` paths through a closed selector, with no free-form root field.
- `?add-app-root` and its standalone app-root action are removed.
- Existing app rows display attached resources. They do not repeat provider-add links per app.

`vaultApps` remains a real backend entity because it provides stable attachment ownership and one
canonical repository root. A Cloudflare action derives it from Workers Builds. A Convex action
derives it from the parent of `convex.json`. The two resources reuse one app only when those
independently observed roots are equal. There is no standalone public action that creates an empty
app row.

A repository folder with neither a Worker nor an attached Convex project receives no `vaultApps`
identity. Existing empty rows created through the removed standalone flow need a one-time cleanup
that deletes only rows with no Worker, Convex project, or other live reference. Add a secondary
root-only path later only if a real app-level feature needs it.

## Cloudflare Flow

### Discovery

When the vault is source-ready and the user has a selected Cloudflare account:

1. paginate the account's Worker inventory
2. read Workers Builds triggers with bounded concurrency
3. keep active triggers whose exact provider-reported `repo_id` equals the vault's stringified
   `ghRepoId`
4. require `repo_connection.provider_type === "github"`
5. normalize every `root_directory`
6. require one unambiguous observed root per Worker before grouping Workers by root
7. read environment variables only for the matching production and preview trigger candidates
8. classify the `SAMEBASE_CONVEX_PROJECT` marker across the trigger pair
9. annotate repository-tree evidence without replacing the provider-observed root

Repository names are display evidence only. The exact provider-reported repository id is
authoritative after the provider type is known because a repository can be renamed. Missing
`provider_type`, `repo_id`, or `root_directory` is ambiguous evidence, not a clean non-match. A
trigger with another provider type and a coincidentally equal id must not be classified as a GitHub
match.

After the live contract probe proves the identifier join, use Cloudflare's paginated beta Worker
inventory as the primary read because it includes never-deployed Workers. Keep the current legacy
Worker scripts inventory as a compatibility fallback while the complete inventory endpoint remains
beta. The fallback is explicitly partial, so an empty legacy result cannot prove that no Workers
exist.

The existing Cloudflare OAuth grants already cover Worker inventory, Workers Builds trigger reads,
and trigger environment-variable reads. This proposal does not need a new permission. Cloudflare
Pages inventory remains out of scope because Samebase's active provider model is Workers-only and
the current grant does not request Pages access.

No documented account-wide repository-filter endpoint was found. A scan therefore costs `P + N + E`
reads: `P` Worker inventory pages, `N` trigger reads for `N` Workers, and `E` environment-variable
reads for matching triggers, normally up to two per candidate Worker. Confirmation adds re-reads for
the selected subset. The existing chunks of ten limit concurrency, not total request cost.

Large accounts need progress, backoff, and an explicit partial-inventory state within Cloudflare's
published API limits. A partial scan must never report that no matches exist or trigger automatic
attachment.

Marker discovery should not require the full Samebase-managed build-command shape. It should pair
active production and preview candidates by provider, repository id, normalized root, and branch
rules. If one Worker's matching active triggers identify several roots, that Worker is ambiguous and
must not be grouped or preselected. Duplicate or conflicting production and preview candidates must
not produce a Convex suggestion.

The beta inventory's Worker `id` must be proven usable as the Builds trigger endpoint's
`external_script_id` in the read-only live probe before the beta endpoint becomes authoritative.
Cloudflare documents both identifiers, but does not explicitly document that join.

`/` is a valid root without a nested tree row. A positive current-tree match supports a nested root.
When the cached tree is stale, truncated, or missing that folder, show the evidence quality or a
possible stale-configuration warning. Do not substitute a corrected root: an attached app root must
retain exactly the observed Cloudflare `root_directory`. An existing Worker without one unambiguous
observed root is not selectable.

Create Worker may ask for a repository folder only when that action also configures Cloudflare
Workers Builds with the corresponding `root_directory`. Samebase must re-read the resulting provider
configuration and attach the Worker under that observed root. Until Create Worker owns that provider
configuration, it cannot create a local app attachment under this model.

### Review And Attachment

The review should describe concrete effects, for example:

> Found 3 Workers across 2 Cloudflare root directories. Add them to Samebase?

It should group selected resources by root and distinguish:

- create a new Cloudflare root group versus reuse an existing group
- attach Worker versus already attached
- an attached Convex project already referenced by the Worker's Builds marker
- an unattached marker project that can also be mapped to a discovered `convex.json`
- unreadable, invalid, missing, or conflicting provider evidence

Show one separately selectable `Also add` row for each unique, exact, visible, unattached Convex
project referenced by the currently selected Workers. Intersect that project's referencing Worker
roots from the complete scan with valid config parents. If the result is exactly one config path,
preselect that root-equality suggestion for explicit confirmation. Otherwise require the user to
choose one discovered config path from a closed selector. Partial discovery may annotate rows but
never preselect a location. Several root-equality suggestions are ambiguous and preselect none.
Remove the effect if the user deselects the last Worker that references it, and count every selected
effect in the confirmation copy, such as `Add 3 Workers and 1 Convex project`.

The observed Worker root is display-only. A Convex location is selectable only as an exact
`convex.json` path from GitHub. The review has no app-root text input or correction control. Its
confirmation request contains selected Worker identities and selected config paths, not
client-supplied root strings or app ids.

Confirmation should re-read the selected Worker identities and trigger evidence, each selected
GitHub config blob, and every selected Convex project. It then makes one Samebase database
transaction that:

1. creates or reuses one `vaultApps` row per normalized Worker or config-derived root
2. attaches every selected Worker with `origin: "selected_existing"`
3. attaches each explicitly selected, re-verified marker project to the app derived from its config
   with `origin: "selected_existing"`

Keep each confirmation within a measured, server-enforced transaction bound based on the worst-case
read and write shape. Accounts with more matches remain fully discoverable and use another
confirmation for the next set. Do not invent a UI-only count before measuring safe Convex
transaction headroom.

If Convex is disconnected, its project is inaccessible, or marker evidence is incomplete during
discovery, do not offer that project as a confirmed effect. If a marker project is readable but no
valid config exists, show why the `Also add` effect is unavailable rather than hiding the reference.
The Worker remains safely attachable, and the later Add Convex modal can show the evidence again. If
a project the user explicitly selected becomes inaccessible, its selected config disappears, or
either provider claim fails re-verification at confirmation time, abort the whole confirmation and
refresh the review. Never silently omit an effect after the user confirms it.

The existing-Worker attach action must not alter Workers Builds, environment variables, deploy keys,
or domains. Those remain separate explicit configuration actions. Create Worker is a distinct
provider write and is viable under this model only when it also establishes the repository and root
configuration described above.

Multiple Workers at one root are one app with several Worker attachments. The current data model
supports that cardinality, so the UI should keep vault-level Add Cloudflare available after the
first Worker is attached.

An existing Worker with no repository trigger or root remains unavailable until its Cloudflare
Workers Builds configuration names this GitHub repository and one root. The modal should explain
that requirement and offer a rescan after the provider configuration changes.

Create Worker remains a separate mode, but it must configure the repository and root in Cloudflare
before attachment. Root creation and stable attachment are recorded together only after the provider
configuration is re-read. A created Worker attaches with `origin: "provisioned"`. If provider
creation succeeds but configuration or local attachment fails, report the possible orphan and do not
automatically delete the Worker, preserving the accepted manual-create failure boundary.

### Repository Connection Boundary

Existing-repository connection remains source-only. After source sync succeeds, land on the normal
vault dashboard without a provider scan, provider prompt, or new onboarding step. The standard
vault-level Add Cloudflare and Add Convex actions are the setup flow.

This keeps repository success independent from optional provider accounts, inventory latency, and
provider read failures. Discovery begins when the user opens the relevant provider modal, where its
purpose and required account scope are visible. An empty vault can make the same two actions easy to
find without introducing a separate onboarding surface.

## Convex Flow

### Location Discovery

Use the vault's fresh default-branch GitHub tree to find Convex code roots. An automatic candidate
must have:

1. a regular Git blob named exactly `convex.json`
2. a regular `package.json` blob in the same directory
3. a `convex.json` body that parses as a JSON object

The repository's declared Convex version may provide additional config health warnings. Samebase's
installed Convex schema must not reject a location merely because the repository uses a newer or
older supported config field.

The normalized parent directory is the app root. Repository-root `convex.json` maps to `/`, while
`packages/backend/convex.json` maps to `packages/backend`. The `functions` field may move the
functions folder relative to that root, but does not change the app root.

A truncated, stale, or unreadable tree is an unavailable discovery result, not proof that the
repository has no Convex code. A malformed config stays visible as unavailable until it is fixed. Do
not infer roots from a `convex/` folder, dependency name, package script, Worker root, or typed
path.

Convex itself can use default configuration without a committed `convex.json`. Samebase should
deliberately require the file as its repository-location invariant. With no valid candidate, Add
Convex still opens, explains that a minimal `convex.json` is needed at the project root, shows
marker-referenced projects as nonselectable, disables attach and create effects, and offers a rescan
after the source changes. This is simpler than adding an unlocated-project state.

### Durable Model

Keep the project-to-app attachment:

```ts
type VaultConvexProject = {
  vaultId: Id<"vaults">;
  userId: Id<"users">;
  appId: Id<"vaultApps">;
  teamId: string;
  projectId: string;
  origin: "provisioned" | "selected_existing";
  createdAt: number;
};
```

Use `projectId` as the global Samebase attachment key. Keep `teamId` as the project's current owning
team, not part of immutable identity. Add `by_project`, and keep `by_app` as a non-unique grouping
index. Remove the one-project-per-app invariant because one codebase may deploy to several Convex
projects. Several projects can therefore share the app derived from one `convex.json`.

No `convexConfigPath` field is needed because the expected path is always `convex.json` beneath the
attached app root. The public attachment boundary should accept a selected `convexConfigPath`, not
an `appId` or root string. The server re-reads that exact default-branch blob, derives the root,
creates or reuses the app, enforces global project exclusivity, and attaches the project in one
transaction.

This separates four facts:

1. location: `convex.json` in GitHub
2. project identity and existence: live Convex inventory
3. confirmed project-to-location association: `vaultConvexProjects.appId`
4. live Worker usage: `SAMEBASE_CONVEX_PROJECT` on Cloudflare Builds triggers

Do not add a one-team-per-vault invariant. Existing vaults can retain projects from different teams
after the user switches the active provider connection. The active connection supplies live detail
only for projects it can access; other durable attachments remain visible but unavailable for live
actions. Cleanup of provisioned projects across inaccessible teams fails closed.

Team ownership is not immutable: Convex projects can transfer teams while retaining their project
resources. A provider read that proves the same `projectId` now has another owning team patches the
stored `teamId` through an explicit reconciliation action. It must not create a second attachment or
treat an old-team miss as deletion. Stale Worker markers remain drift that requires explicit
reconfiguration before marker-dependent actions resume.

`?add-convex` should:

1. discover every valid config root from GitHub
2. list every visible project in the connected Convex team and mark attachment eligibility
3. run the same read-only Worker scan when a selected Cloudflare account is available, regardless of
   whether Add Cloudflare was opened first
4. show marker-referenced projects first under `Referenced by matching Workers`
5. for every selected project, show a closed selector containing only discovered `convex.json` paths
6. preselect both project and config only from a complete Worker scan where production and preview
   markers are equal and the intersection of that project's referencing Worker roots and valid
   config parents contains exactly one path
7. allow several projects to select the same config and confirm existing-project attachments with
   concrete copy such as `Add 2 Convex projects`
8. re-read every selected config, project identity, and ownership constraint before attaching the
   selected mappings atomically; re-read marker evidence only when it supplied the initial
   preselection

Show the Convex inventory immediately and render optional Worker evidence progressively. Compute
automatic preselection only from a complete Worker scan available when selectable controls are
initialized. If the scan is partial or finishes later, initialize with no marker-driven selection;
late evidence may add badges but never reorder rows, change the CTA, or newly select an association.

There is no root input. If Cloudflare scope is unavailable, the modal still lists GitHub configs and
Convex inventory; the user explicitly maps selected projects. A project name, one-project inventory,
one-config repository, legacy config field, or marker at another Worker root may rank a suggestion
but must not silently select the association.

A manual project/config mapping depends only on the GitHub and Convex re-reads. A later Cloudflare
failure or marker change does not block it. Marker drift aborts a combined Cloudflare confirmation
and refreshes a marker-preselected Add Convex review, but it does not turn optional Worker evidence
into a requirement for a mapping the user chose explicitly.

Create Project remains a single-project path. The user chooses one discovered config and enters only
the project name. After external creation succeeds, attach the project under that config-derived app
with `origin: "provisioned"`. If local attachment fails, report the possible orphan and do not
automatically delete the project.

Attachment retries are idempotent and never downgrade `origin: "provisioned"`. A later verified
Samebase-managed create of the same provider identity may upgrade `selected_existing` to
`provisioned`; selecting an existing project can never perform that upgrade.

Connecting existing projects changes only Samebase. Creating a project changes Convex and Samebase.
Neither path writes Cloudflare markers or deploy keys; configuring a Worker to use the project
remains a separate explicit action.

The marker is an exact readable `projectId` claim with a claimed current team, but it is not all of
these things:

- proof that the hidden deploy keys belong to the named project
- proof that the named project still exists or is accessible
- proof of the repository root that contains the Convex backend
- permission to attach or reconfigure the project

Production and preview markers must both be readable, valid, and equal before the project is
preselected. The matching Worker root must also equal exactly one config parent before the location
is preselected. Missing, secret, malformed, one-sided, conflicting, or multiply matching evidence
remains visible and does not choose an association.

If Worker identity and repository/root triggers are readable but marker environment variables or
Convex inventory are unavailable, the Worker remains attachable. Only the Convex suggestion is
unavailable. Failure at a later evidence layer must not erase a safe result from an earlier layer.

### Source-Of-Truth Boundaries

The providers prove different parts of the association:

- GitHub proves the path and contents of `convex.json` at a specific default-branch commit.
- Convex inventory proves current project identity and current owning team, but exposes no
  repository or path.
- current supported `convex.json` carries no authoritative cloud project identity; legacy `team` and
  `project` fields are deprecated slug hints that require live provider verification
- `CONVEX_DEPLOYMENT` or `CONVEX_DEPLOY_KEY` supplies project or deployment selection context at
  runtime, normally through local or CI environment state rather than committed source
- a valid Worker marker proves a readable Worker-to-project declaration, while its team coordinate
  may become stale after transfer and its enclosing `root_directory` proves only the Worker build
  root
- Samebase stores the explicitly confirmed bridge between project identity and one canonical config
  root because no current provider field supplies that bridge

Do not add a Samebase-specific project id inside `convex.json`; it is not part of the supported
schema. A Worker build can change directories, and `convex.json.functions` can reference another
folder, so a marker at a different Worker root does not locate the config. One unique root-equality
suggestion is strong enough to preselect for review, not to attach silently.

A shared backend is represented once at its selected `convex.json` root. Workers from any app root
may reference it through live markers. Conversely, several projects may appear under one config root
when the same codebase deploys to production and staging projects.

If a config is deleted or moved after attachment, keep the durable project row for cleanup and show
source-location drift. Never silently move or delete the project. Reassociation may select only a
currently discovered config and must invalidate root-owned schema snapshots. A project that appears
to match several config roots is ambiguous; the current simple model stores one explicitly selected
canonical root rather than inventing a many-to-many source relation.

### Project Selection, Reassociation, And Cleanup

Once one app can contain several Convex projects, an app root no longer identifies a database or
schema target. Make the attachment id explicit in the route before enabling the new cardinality:

```txt
/vault/:owner/:repo/db/:branch/project/:convexProjectId/root
/vault/:owner/:repo/db/:branch/project/:convexProjectId/mono/:appRoot...
```

Schema selection and production links should use the same `convexProjectId` directly. A legacy
root-only database route redirects when the root has exactly one project, shows a project chooser
when it has several, and shows the existing missing-resource state when it has none.

Config reassociation is a dedicated transition, not another attach. It re-reads the selected config,
derives or reuses the new app, patches the existing project's `appId`, invalidates that project's
root-owned schema snapshots, and prunes the old app if no resource still references it. The same
empty-app pruning invariant runs after every Worker or project detach and missing-resource removal,
not only in a one-time migration.

Managed provisioning must never let an unrelated project under the target app satisfy a plan. A
`created` plan resolves only its exact checkpointed project identity. A `planned` or `creating` plan
does not adopt the first app project and continues through its existing create or inspection state.

Before deleting a Samebase-provisioned project, re-read markers for every retained Worker after
planned Worker deletions finish. A retained Worker is one that was not scheduled for provider
deletion or whose deletion did not succeed. A marker with the same `projectId` blocks project
deletion even when its team coordinate shows transfer drift. Partial or unavailable Worker evidence
fails closed for operator inspection. This changes the accepted deletion contract and belongs in
spec 098.

## Scenario Matrix

| Scenario                                                  | Expected behavior                                                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Worker at `/`, config at `/convex.json`, valid marker     | Preselect the unique root-equality suggestion; confirmation makes the association exact and attaches both resources.              |
| Worker at `/`, config at `packages/backend/convex.json`   | Attach the Worker at `/`; show the project, but require explicit config selection before also adding it under `packages/backend`. |
| Workers at `/` and `apps/admin` share one project marker  | Attach two Worker apps; attach the project once at its selected config root and show both live usage edges.                       |
| Two Workers at one root name different projects           | Attach both Workers and allow both projects to attach under the same config-derived app.                                          |
| Several configs, one unique Worker/config root equality   | Preselect only that suggestion for explicit confirmation.                                                                         |
| One project has several root-equality suggestions         | Mark the association ambiguous and require one explicit canonical config choice.                                                  |
| Matching Worker, no marker                                | Create the Cloudflare-only app; do not guess a Convex project.                                                                    |
| Available Worker has no repository trigger                | Keep it unavailable until Cloudflare names this GitHub repository and one root; do not collect a Samebase root override.          |
| No Worker exists                                          | Create Worker configures the Cloudflare repository and root, then attaches under the re-read provider root.                       |
| One config, no Worker                                     | Let the user map a visible Convex project to that read-only config path and create or reuse its app.                              |
| Several projects, one config                              | Allow multi-select; attach each exact project once under the same app.                                                            |
| Data or Schema opens for an app with several projects     | Require a project-specific attachment id; never choose the first project silently.                                                |
| Managed plan finds an unrelated project under its app     | Ignore it; only an exact created checkpoint can satisfy the plan.                                                                 |
| No Convex project exists                                  | Create Project asks for one discovered config and a name, then attaches the result under the derived app.                         |
| No `convex.json` exists                                   | Open Add Convex with disabled effects, explain the required config, and offer Rescan; Add Cloudflare still attaches safe Workers. |
| Config is malformed or lacks sibling `package.json`       | Show the path as invalid or unverified and do not allow it to establish an app root.                                              |
| GitHub tree is stale, truncated, or unreadable            | Report config discovery as unavailable; do not claim that no Convex apps exist.                                                   |
| Add Convex is opened before Add Cloudflare                | Run the same optional Worker scan and show the same marker evidence, so order does not change the model.                          |
| One Convex project used by several roots                  | Show the project once at its config-derived app and derive every consuming Worker from live markers.                              |
| Production and preview roots disagree                     | Mark the Worker ambiguous and leave it unselected.                                                                                |
| One Worker's active matching triggers name several roots  | Mark the Worker ambiguous and do not place it in several app groups.                                                              |
| Production and preview markers disagree                   | Allow the otherwise verified Worker attachment, but show inconsistent Convex evidence and preselect no association.               |
| Valid marker names an inaccessible project                | Show the exact external or unavailable project and attach only the Worker.                                                        |
| Matching Worker is already attached elsewhere             | Show the global attachment conflict before confirmation.                                                                          |
| Marker names a project attached elsewhere                 | Show the global project conflict and do not offer attachment.                                                                     |
| Project is already attached to this vault                 | Show its confirmed config root and keep retry idempotent.                                                                         |
| Vault has projects from a previously connected team       | Keep them attached and visible; mark inaccessible live detail unavailable and make cleanup fail closed.                           |
| Attached project transfers to another team                | Show ownership drift, block duplicate attachment and deletion inference, and require verified reconciliation.                     |
| Attached config moves or disappears                       | Keep the project for cleanup, show source drift, and require explicit reassociation to a current config.                          |
| Last resource detaches from an app                        | Delete the now-unreferenced app row in the same transition.                                                                       |
| GitLab trigger has the same repo id string                | Do not treat it as a GitHub match.                                                                                                |
| Selected account has more than 100 Workers                | Paginate the complete inventory and preserve deterministic ordering.                                                              |
| Fresh tree does not contain the observed Worker root      | Warn about possibly stale Cloudflare configuration, but preserve the observed Worker root if the user attaches.                   |
| Provider access cannot create vault resources             | Do not open an actionable provider-add route.                                                                                     |
| Worker identity or repository/root evidence is unreadable | Show the Worker as unavailable and make no attachment.                                                                            |
| Combined-flow marker or selected provider evidence drifts | Abort that confirmation, refresh the review, and write no partial local attachments.                                              |
| Cloudflare fails after a manual Convex mapping            | Re-read GitHub and Convex and allow the explicit mapping; optional Worker evidence is not a dependency.                           |
| Another request attaches a selected resource after review | Abort on the global ownership conflict and write no partial local attachments.                                                    |
| Provisioned project is referenced by retained Workers     | Re-read markers and fail closed before deletion; `origin` grants cleanup authority, while live use blocks cleanup.                |
| Existing-repository source sync succeeds                  | Land on the normal vault dashboard without scanning providers or starting another onboarding flow.                                |

The shared-backend mental model now has one answer to test: the project appears once at its
config-derived app root, while Workers from any root show their live references to it. A single app
may also show several projects when the same codebase deploys to different environments.

## Low-Cost Flow And Mental-Model Test

Use one scenario corpus for the planner, prototype, and later automated tests. Do not invent three
independent sets of mock data.

### 1. Pure Adoption Planner

Start with a pure function over provider observations and current attachments. Its output should
classify each proposed resource as:

- ready to attach as a provider-derived Worker app
- ready to attach as a confirmed project/config association
- needs a discovered config choice before project attachment
- needs repository or provider configuration before attachment
- blocked by conflicting evidence or attachment ownership
- unavailable because provider evidence could not be read

Table-drive it with the scenario matrix above. This proves grouping, normalization, cardinality,
idempotency, and fail-closed behavior before UI or database writes exist.

### 2. Concept Prototype

Render the proposed review through the real vault dashboard shell and production rail/dialog
components using the same scenario corpus. Compare it with the current root-first flow. Include the
single-app, two-root monorepo, same-root multi-Worker, Worker-only, Convex-only, shared backend,
conflicting marker, and missing-permission states.

Display resources under their independently derived app roots. Allow several Workers and several
Convex projects under one root. Render cross-root `Uses backend at packages/backend` relationships
from live markers without nesting or duplicating the project under the consuming Worker apps.

Capture desktop and mobile screenshots. Before the proposed production components exist, these are
concept evidence only, even when shown inside the real dashboard chrome. They are not route or
visual acceptance.

### 3. Prediction-Based Review

Do not ask reviewers which design they prefer. Before they press the confirmation action, ask them
to predict:

1. how many apps will exist afterward
2. which config root each selected Convex project will use
3. whether Samebase will change Cloudflare or Convex configuration
4. where a Convex backend shared by several Workers will appear
5. whether several Convex projects can share one code root

The design passes when reviewers can teach back those effects from the screen without the
implementation rationale. Wrong predictions identify a mental-model or copy problem more directly
than preference feedback.

Screenshot-only, context-blind agent reviewers can cheaply find copy and consistency problems. They
are an adversarial scan, not comprehension evidence. Use short human think-aloud sessions for the
mental-model decision and shared-backend placement.

### 4. Read-Only Live Contract Probe

Use one temporary existing-repository vault and a real Cloudflare account to verify:

- complete versus truncated default-branch GitHub trees
- valid, malformed, and same-directory-package `convex.json` classification
- complete Worker inventory pagination
- whether beta Worker `id` is accepted as the Builds `external_script_id`
- trigger repository provider and exact repository id
- root normalization
- production and preview trigger selection
- marker visibility through the environment-variable endpoint
- unique Worker-root/config-root suggestions and ambiguous multi-config matches
- behavior when a candidate has no marker
- partial fallback inventory and large-account request fan-out

The probe must perform no provider writes. After the observation shape is trusted, use the normal
route-level live flow to test one confirmed attachment.

### 5. Acceptance Coverage After The Model Is Chosen

- pure planner tests for every scenario row
- Convex tests for server-derived config roots, several projects under one app, global project
  exclusivity, origin ownership and upgrade without downgrade, idempotent retry, mixed-team and
  team-transfer drift, the measured transaction bound, and rejection of client-supplied roots or app
  ids
- Cloudflare tests for server-derived root equality, evidence-drift rejection, transactional root
  creation, explicit marker-project/config attachment, and no partial local writes
- cleanup tests that re-read live marker edges and refuse to delete a Samebase-provisioned project
  while retained Workers still reference it, fail closed on partial evidence, and prune app rows
  only after their last resource reference disappears
- GitHub discovery tests for regular config and package blobs, root normalization, invalid config,
  truncated trees, missing configs, and default-branch evidence drift
- React tests for app-root grouping, multiple resources per root, unique root-equality preselection,
  closed config selectors, read-only Worker roots, explicit ambiguity, and concrete confirmation
  copy
- route-search tests proving `?add-app-root` is gone and that bare provider flags, Back, Cancel, and
  unrelated query params behave correctly
- project-identity Data and Schema routes that do not assume an app root resolves one project
- route-level Playwright coverage proving existing-repository connection lands on the normal vault
  dashboard without a provider step, then replaying the scenario corpus through the two standard
  provider modals with provider reads stubbed at the action or network boundary
- Linux visual acceptance for the desktop and mobile review states

## Suggested Implementation Order

1. Update specs 003, 098, 105, 106, and 110. Define GitHub-derived Convex roots, multiple projects
   per app, project-identity Data and Schema selection, batch Worker adoption, Create Worker's
   Builds responsibility, live marker usage, and the retained-Worker deletion gate together.
2. Build the shared scenario corpus and validate config selection, shared backends, and several
   projects at one code root through prediction-based review.
3. Add global `by_project` identity and migrate `teamId` to mutable ownership. Widen production
   consumers from one project per app to a deterministically ordered project list. Update
   `connect_convex_project` and generated action documentation, managed provisioning with exact
   checkpoint lookup, provider observations, cleanup, dashboard graph validation and
   `get_user_vaults`, the resource rail, production links, Data and Schema routes, and schema
   snapshots before allowing a second project at one root.
4. Add complete default-branch config discovery and the server attachment boundary that accepts a
   config path, re-reads it, derives the app root, and never accepts a client root or app id.
5. Audit existing attachments against their derived config paths, show missing-source drift, and add
   explicit config-reassociation and provider-verified team-transfer transitions. Enforce ongoing
   empty-app pruning only after all references disappear. Do not remap projects automatically.
6. Add vault-scoped, read-only Cloudflare discovery and its pure planner.
7. Let Cloudflare attachment actions create or reuse Worker apps transactionally and attach every
   explicitly selected marker-project/config association within the measured server batch bound.
8. Add vault-level, multi-select Add Convex with closed config selectors and no root field.
9. Make bare `?add-cloudflare` and `?add-convex` the two vault-level entry points, then remove the
   standalone Add app root flow and repeated per-app provider links.
10. Keep repository connection source-only and update route and acceptance coverage.

## Sources

- [Cloudflare Workers list all Workers](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/methods/list/)
- [Cloudflare Workers legacy scripts inventory](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/list/)
- [Cloudflare Workers Builds trigger inventory](https://developers.cloudflare.com/api/resources/workers_builds/subresources/triggers/methods/list)
- [Cloudflare Workers Builds trigger environment variables](https://developers.cloudflare.com/api/resources/workers_builds/subresources/triggers/subresources/environment_variables/methods/list)
- [Cloudflare API token permission groups](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- [Cloudflare API request limits](https://developers.cloudflare.com/fundamentals/api/reference/limits/)
- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [GitHub Git tree API](https://docs.github.com/en/rest/git/trees#get-a-tree)
- [Convex Management API project inventory](https://docs.convex.dev/management-api/list-projects)
- [Convex project configuration](https://docs.convex.dev/production/project-configuration)
- [Convex deployment environment selection](https://docs.convex.dev/cli/reference/deployment)
- [Convex deploy CLI](https://docs.convex.dev/cli/reference/deploy)
- [Convex deployment model](https://docs.convex.dev/production/overview)
- [Convex project transfer behavior](https://docs.convex.dev/dashboard/projects#transferring-a-project-to-another-team)
- [Convex transaction limits](https://docs.convex.dev/production/state/limits)
