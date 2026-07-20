# Vault-Level Provider Discovery Flow Research

## Document Control

- Status: current-state research and proposed domain model
- Owner: Samebase vault provider resources and existing repository onboarding
- Created: 2026-07-20
- Updated: 2026-07-21
- Prompt: simplify existing repository setup after PR
  [#1243](https://github.com/samebase/samebase/pull/1243) by discovering Cloudflare Workers and
  their repository roots, using `SAMEBASE_CONVEX_PROJECT` as Worker-to-Convex evidence, and testing
  whether the dashboard needs only vault-level `?add-cloudflare` and `?add-convex` entry points.
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

Delete `vaultApps` instead of giving the root grouping an independent domain identity.

A vault is a GitHub repository. Users add exact provider resources to that vault. Samebase groups
those attachments by repository root when it renders them, but the group is not another resource,
user-created object, or lifecycle. It has no id and cannot exist empty.

The dashboard should expose exactly two vault-level provider entry points:

1. `?add-cloudflare`
2. `?add-convex`

`?add-cloudflare` should discover Workers whose current Builds configuration names the vault's
immutable GitHub repository id, group them by normalized `root_directory`, and ask once before
attaching the selected Workers.

`?add-convex` should discover committed `convex.json` files and list Convex projects at vault scope.
The selected config path is the durable source placement for that project attachment, and its parent
directory determines the displayed repository root group. Valid `SAMEBASE_CONVEX_PROJECT` markers
rank projects and can preselect one unique root-equality suggestion, but only user confirmation
records the project-to-config placement. The user never types or edits a root.

When Add Cloudflare finds a marker-referenced project that the current Convex connection can verify,
its review can include a separately selectable `Also add` row. That row either uses one unique
Worker-root/config-root suggestion or asks the user to choose among discovered `convex.json` paths.
This makes the common existing-repository path one confirmation without pretending that a marker
alone proves the backend location.

Use automatic read-only discovery inside the provider modal followed by explicit confirmation. Do
not scan during repository onboarding or silently attach provider resources. An attachment
establishes durable identity and cleanup provenance even when it does not mutate the provider.

Do not persist transient inventory, root groups, or a Worker-to-Convex edge. Persist exact resource
attachments and only the placement that the user must establish because no provider supplies it: the
selected `convexConfigPath` on a Convex project attachment. GitHub reports current qualifying config
paths. Cloudflare reports current Worker repository, root, Builds, and Worker-to-Convex
configuration.

## Domain Vocabulary

The differentiating boundary is user intent. External systems can report facts, but they cannot add
their resources to a Samebase vault.

| Term                   | Meaning                                                                                  | Durable Samebase state |
| ---------------------- | ---------------------------------------------------------------------------------------- | ---------------------- |
| Provider connection    | Credentials plus the selected provider account or team scope                             | yes                    |
| Source connection      | The stable GitHub repository identity represented by the vault                           | yes                    |
| Observation            | A fresh, read-only fact reported by GitHub, Cloudflare, or Convex                        | no                     |
| Attachment proposal    | Candidate exact effects computed from observations and current attachments               | no                     |
| Confirmation           | The user's authorization for the exact proposed effects                                  | request boundary       |
| Resource attachment    | Samebase's record that one exact external resource has been added to one vault           | yes                    |
| Source placement       | A user-confirmed repository path when no provider can report the resource-to-code bridge | yes, on the attachment |
| Provider configuration | An explicit mutation of Cloudflare, Convex, or GitHub                                    | only when requested    |
| Drift                  | A fresh observation no longer agrees with an attachment or its confirmed placement       | displayed, not adopted |
| Repository root group  | A read projection of attached resources resolved to the same normalized root             | no                     |

The state transition is:

```txt
observations + current attachments -> attachment proposal
proposal + user confirmation + server re-verification -> resource attachments
resource attachments + fresh observations -> root groups and drift
```

For Convex, the concrete transition is:

```txt
qualifying convex.json observation
+ visible Convex project observation
+ user-confirmed project-to-config choice
+ server re-verification
-> Convex project attachment with convexConfigPath
```

For Cloudflare, the user confirms only resource inclusion. The Worker attachment stores stable
identity and origin, while its root continues to resolve from current Builds observations. A valid
`SAMEBASE_CONVEX_PROJECT` marker can improve the proposal, but never becomes attachment intent by
itself.

Reserve **connection** for provider credentials or the vault's repository source link. The result of
adding a Worker or Convex project is an **attachment**, not another connection. User-facing copy can
stay concrete: `Add Worker`, `Add Convex project`, `Added to Samebase`, and `Remove from Samebase`.

Keep ids equally explicit: `projectId` is the stable Convex provider identity, while
`convexAttachmentId` identifies Samebase's durable attachment. No route or action should use a root
group as resource identity.

This vocabulary creates a strict test for every proposed field. If it is current external state, it
belongs in an observation. If it records an exact resource the user added, or a source placement
only the user can establish, it belongs in that resource's attachment. If it exists only to group
resources by root, derive it. A future provider resource with no meaningful repository root remains
vault-scoped instead of manufacturing an app row.

## Why PR #1243 Makes This Viable

PR #1243 reduced the durable model to stable identities and moved mutable provider state back to
live reads:

| Concept                                           | Durable Samebase state                       | Read-time state                                                      |
| ------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Repository                                        | `vaults` GitHub identity                     | current GitHub repository and tree observation                       |
| Repository root group                             | none                                         | projection from attachments, confirmed placement, and observations   |
| Worker                                            | `vaultCloudflareWorkers` identity and origin | current existence, URLs, triggers, repository, root, and environment |
| Convex project                                    | identity, confirmed config path, and origin  | current team, project details, and default production deployment     |
| Worker Builds declares Convex project coordinates | none                                         | current `SAMEBASE_CONVEX_PROJECT` observation                        |

The Cloudflare invariants already support the proposed result:

- one exact Worker attached globally in Samebase
- multiple Worker attachments may currently resolve to one root
- a Worker root change regroups the attachment without changing its identity
- unreadable or missing placement never deletes the attachment
- `selected_existing` attachments authorize local removal only, never provider deletion

Remove `vaultConvexProjects.appId`. Samebase must durably remember which cloud project the user
mapped to which config because current `convex.json` does not contain stable project identity. Store
the selected `convexConfigPath` on the project attachment instead. The public attachment boundary
accepts that discovered path, re-reads it from GitHub, and records the exact project-to-config
placement after confirmation.

Convex explicitly supports deploying one codebase to several projects, such as persistent production
and staging projects. Several project attachments may therefore store the same `convexConfigPath`
and render in one root group. Replace the current `(teamId, projectId)` exclusivity key with global
`projectId` exclusivity, and remove `teamId` from the attachment because current ownership is
available from the project read by id. `SAMEBASE_CONVEX_PROJECT` remains the live Worker-to-project
relation.

Today Samebase is both the source and the unconstrained input for a Convex project's owning root:
the attach flow accepts an existing `appId`, and Data and Schema routes infer one project from that
app. The improved split is narrower. GitHub reports qualifying config paths at a commit. Convex
reports current project identity and ownership. The user confirms the missing bridge between one
project and one config. Samebase persists that bridge on the project attachment. Data and Schema
navigation selects the project attachment instead of assuming a root uniquely identifies it.

`vaultApps` is neither a clean observation nor a clean record of user intent in the current schema.
It is a durable grouping row whose root was copied from a Cloudflare observation or inferred from a
user-selected Convex config. It is also not disposable today because provider attachments store only
`appId`; deleting it now would lose their last recorded placement. The migration must first move the
durable Convex placement onto `vaultConvexProjects.convexConfigPath`, move consumers to resource
attachment ids, and resolve Worker groups from live Cloudflare observations. Only then can
`vaultApps` and both `appId` fields be removed without losing user intent.

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
repository and usually wants to add resources whose provider configuration already reports their
deployment root.

The runtime also disagrees with the accepted route text in specs 105 and 106. Those specs describe
bare provider flags, while route normalization currently discards `?add-cloudflare` and
`?add-convex` unless `app-root` names an existing app.

Cloudflare discovery already performs most of the expensive work, but it is inverted. It accepts a
known app root, scans up to 100 Workers, reads each Worker's triggers, and asks whether each Worker
matches that root. Vault-level discovery should scan once by repository id and return the roots
found in the matching triggers.

## Target Mental Model

The Cloudflare user-facing rule should be:

> Add a Worker. Samebase groups it under the root directory reported by Cloudflare.

This removes the separate app-versus-monorepo decision. One observed root produces one displayed
group. Several observed roots display a monorepo. An existing Worker's placement is never editable
in Samebase: it is the normalized `root_directory` currently reported by Cloudflare. If that value
changes, the Worker moves between displayed groups without changing its durable attachment. Missing
or ambiguous provider placement keeps the attachment but makes its location unavailable; it never
creates a local root override.

The Convex user-facing rule should be:

> Add a Convex project using the committed `convex.json` that locates its code. Samebase shows which
> Workers reference it from their live Cloudflare configuration.

Convex inventory does not expose a GitHub repository or source root. GitHub reports qualifying
committed config paths, and Samebase offers those paths as the closed placement choices. Neither
provider reports which cloud project a config deploys. Project identity, user-confirmed config
placement, and live Worker usage are therefore separate facts.

### Vault-Level Route Semantics

- `/vault/<owner>/<repo>?add-cloudflare` opens the Cloudflare flow for the vault.
- `/vault/<owner>/<repo>?add-convex` opens the Convex flow for the vault.
- Neither route requires `app-root`.
- Both routes require the authorization used to create durable vault resources. Provider-connection
  access alone should not open a flow that cannot complete.
- Add Cloudflare displays Worker roots as read-only provider evidence. Add Convex displays
  discovered `convex.json` paths through a closed selector, with no free-form root field.
- `?add-app-root` and its standalone app-root action are removed.
- Root groups display attached resources. They do not repeat provider-add links per group.

The root group is a read projection, not a backend entity. A Cloudflare Worker resolves from its
current Builds `root_directory`. A Convex project resolves from the parent of the confirmed
`convexConfigPath` stored on its attachment. Resources share a group only while those independently
resolved roots are equal.

A repository folder with no currently placed attachment produces no group. A group disappears when
its last placed resource leaves, with no cleanup transition. Existing empty `vaultApps` rows
disappear during the table migration because they encode neither an attachment nor current provider
state. Add a durable root-level entity later only if a real user-controlled feature needs an
identity and lifecycle shared by every resource at that root.

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

Repository names are display evidence only. After the provider type is known to be GitHub, the
current provider-reported repository id is the match key because a repository can be renamed.
Missing `provider_type`, `repo_id`, or `root_directory` is ambiguous evidence, not a clean
non-match. A trigger with another provider type and a coincidentally equal id must not be classified
as a GitHub match.

After the live contract probe verifies the identifier join, use Cloudflare's paginated beta Worker
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
`external_script_id` in the read-only live probe before the beta endpoint becomes the primary read.
Cloudflare documents both identifiers, but does not explicitly document that join.

`/` is a valid root without a nested tree row. A positive current-tree match supports a nested root.
When the cached tree is stale, truncated, or missing that folder, show the evidence quality or a
possible stale-configuration warning. Do not substitute a corrected root: the displayed Worker
placement follows the current Cloudflare `root_directory`. An unattached Worker without one
unambiguous observed root is not selectable. An already attached Worker remains attached but has no
resolved root group until a valid observation returns.

Create Worker may ask for a repository folder only when that action also configures Cloudflare
Workers Builds with the corresponding `root_directory`. Samebase must re-read the resulting provider
configuration before attaching the Worker. Until Create Worker owns that provider configuration, it
cannot claim a repository placement under this model.

### Review And Attachment

The review should describe concrete effects, for example:

> Found 3 Workers across 2 Cloudflare root directories. Add 3 Workers to Samebase?

It should group selected resources by root and distinguish:

- show under a new root-directory section versus an existing section
- add Worker versus already added
- an attached Convex project already referenced by the Worker's Builds marker
- an unattached marker project that can also be added using a discovered `convex.json`
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

1. attaches every selected Worker with `origin: "selected_existing"`
2. attaches each explicitly selected, re-verified marker project with its selected
   `convexConfigPath` and `origin: "selected_existing"`

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

Multiple Workers at one root render in one group while remaining independent attachments. The UI
should keep vault-level Add Cloudflare available after the first Worker is attached.

An existing Worker with no repository trigger or root remains unavailable until its Cloudflare
Workers Builds configuration names this GitHub repository and one root. The modal should explain
that requirement and offer a rescan after the provider configuration changes.

Create Worker remains a separate mode, but it must configure the repository and root in Cloudflare
before attachment. The stable attachment is recorded only after the provider configuration is
re-read. A created Worker attaches with `origin: "provisioned"`. If provider creation succeeds but
configuration or local attachment fails, report the possible orphan and do not automatically delete
the Worker, preserving the accepted manual-create failure boundary.

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

The normalized parent directory is the displayed root group. Repository-root `convex.json` maps to
`/`, while `packages/backend/convex.json` maps to `packages/backend`. The `functions` field may move
the functions folder relative to that root, but does not change the project attachment's source
placement.

A truncated, stale, or unreadable tree is an unavailable discovery result, not proof that the
repository has no Convex code. A malformed config stays visible as unavailable until it is fixed. Do
not infer roots from a `convex/` folder, dependency name, package script, Worker root, or typed
path.

Convex itself can use default configuration without a committed `convex.json`. Samebase should
deliberately require the file as its repository-location invariant. With no valid candidate, Add
Convex still opens, explains that a minimal `convex.json` is needed at the project root, shows
marker-referenced projects as nonselectable, disables adding and creating projects, and offers a
rescan after the source changes. This is simpler than adding an unlocated-project state.

### Durable Model

Persist resource identity, user-confirmed placement where needed, and provenance directly on each
attachment:

```ts
type VaultCloudflareWorkerAttachment = {
  vaultId: Id<"vaults">;
  userId: Id<"users">;
  accountId: string;
  workerName: string;
  workerTag: string;
  origin: "provisioned" | "selected_existing";
  createdAt: number;
};

type VaultConvexProjectAttachment = {
  vaultId: Id<"vaults">;
  userId: Id<"users">;
  projectId: string;
  convexConfigPath: string;
  origin: "provisioned" | "selected_existing";
  createdAt: number;
};
```

Use `projectId` as the global Samebase attachment key. Remove `teamId`: the Convex project endpoint
reads current ownership by stable project id, and deletion must re-verify that live project anyway.
Add `by_project` and a vault/config-path index for deterministic grouping. One codebase may deploy
to several Convex projects, so several attachments may share one `convexConfigPath`.

The public attachment boundary accepts a selected `convexConfigPath`, never an `appId` or root
string. The server re-reads that exact default-branch blob, enforces global project exclusivity, and
records the project and path in one transaction. The durable fact is the user-confirmed
`(projectId, convexConfigPath)` bridge that no provider can reconstruct, not a claim that GitHub
will continue to report a file at that path.

Remove `appId` from the Worker attachment as well. Worker identity and attachment intent are
durable; repository and root placement remain live Cloudflare observations. If the Worker moves
roots, the UI regroups it. If Cloudflare verifies that the Worker no longer reports this repository,
Samebase keeps the attachment and shows placement drift at vault scope. If Cloudflare is unreadable,
Samebase keeps the attachment and shows its placement as unverified instead.

This separates four facts:

1. location: `convex.json` in GitHub
2. project identity and existence: live Convex inventory
3. confirmed project-to-location placement: `vaultConvexProjects.convexConfigPath`
4. live Worker usage: `SAMEBASE_CONVEX_PROJECT` on Cloudflare Builds triggers

Do not add a one-team-per-vault invariant. Existing vaults can retain projects from different teams
after the user switches the active provider connection. The active connection supplies live detail
only for projects it can access; other durable attachments remain visible but unavailable for live
actions. Cleanup of provisioned projects across inaccessible teams fails closed.

Team ownership is not immutable: Convex projects can transfer teams while retaining their project
identity. A provider read for the same `projectId` reports its current team without patching the
attachment. An inaccessible project never implies deletion. Stale Worker marker team coordinates are
drift, but a re-verified matching `projectId` still identifies the attached project.

`?add-convex` should:

1. discover every valid config root from GitHub
2. list every visible project in the connected Convex team and mark attachment eligibility
3. run the same read-only Worker scan when a selected Cloudflare account is available, regardless of
   whether Add Cloudflare was opened first
4. show marker-referenced projects first under `Referenced by matching Workers`
5. for every selected project, show a closed selector containing only discovered `convex.json` paths
6. preselect both project and config only from a complete Worker scan where production and preview
   markers name the same `projectId`, a live Convex read verifies that project, and the intersection
   of its referencing Worker roots and valid config parents contains exactly one path
7. allow several projects to select the same config and confirm existing-project attachments with
   concrete copy such as `Add 2 Convex projects`
8. re-read every selected config, project identity, and ownership constraint before attaching the
   selected mappings atomically; re-read marker evidence only when it supplied the initial
   preselection

Show the Convex inventory immediately and render optional Worker evidence progressively. Compute
automatic preselection only from a complete Worker scan available when selectable controls are
initialized. If the scan is partial or finishes later, initialize with no marker-driven selection;
late evidence may add badges but never reorder rows, change the CTA, or newly select a project
placement.

There is no root input. If Cloudflare scope is unavailable, the modal still lists GitHub configs and
Convex inventory; the user explicitly maps selected projects. A project name, one-project inventory,
one-config repository, legacy config field, or marker at another Worker root may rank a suggestion
but must not silently select the project-to-config mapping.

A manual project/config mapping depends only on the GitHub and Convex re-reads. A later Cloudflare
failure or marker change does not block it. Marker drift aborts a combined Cloudflare confirmation
and refreshes a marker-preselected Add Convex review, but it does not turn optional Worker evidence
into a requirement for a mapping the user chose explicitly.

Create Project remains a single-project path. The user chooses one discovered config and enters only
the project name. After external creation succeeds, attach the project with that config path and
`origin: "provisioned"`. If local attachment fails, report the possible orphan and do not
automatically delete the project.

Attachment retries are idempotent and never downgrade `origin: "provisioned"`. A later verified
Samebase-managed create of the same provider identity may upgrade `selected_existing` to
`provisioned`; selecting an existing project can never perform that upgrade.

Adding an existing project records it only in Samebase. Creating a project changes Convex and
Samebase. Neither path writes Cloudflare markers or deploy keys; configuring a Worker to use the
project remains a separate explicit action.

The marker declares an exact `projectId` and a team hint, but it is not all of these things:

- proof that the hidden deploy keys belong to the named project
- proof that the named project still exists or is accessible
- proof of the repository root that contains the Convex backend
- permission to attach or reconfigure the project

Production and preview markers must both be readable, valid, and name the same `projectId` before
the project is preselected. A live project read supplies current team ownership, so differing marker
team hints are visible drift rather than a second identity. The matching Worker root must also equal
exactly one config parent before the location is preselected. Missing, secret, malformed, one-sided,
project-conflicting, or multiply matching evidence remains visible and does not choose a
project-to-config mapping.

If Worker identity and repository/root triggers are readable but marker environment variables or
Convex inventory are unavailable, the Worker remains attachable. Only the Convex suggestion is
unavailable. Failure at a later evidence layer must not erase a safe result from an earlier layer.

### Evidence And Authority Boundaries

Each system supplies a different fact or decision:

- GitHub reports the path and contents of `convex.json` at a specific default-branch commit.
- Convex inventory reports current project identity and current owning team, but exposes no
  repository or path.
- current supported `convex.json` carries no authoritative cloud project identity; legacy `team` and
  `project` fields are deprecated slug hints that require live provider verification
- `CONVEX_DEPLOYMENT` or `CONVEX_DEPLOY_KEY` supplies project or deployment selection context at
  runtime, normally through local or CI environment state rather than committed source
- a valid Worker marker declares a currently readable Worker-to-project reference, while its team
  coordinate may become stale after transfer and its enclosing `root_directory` reports only the
  Worker build root
- the user supplies the missing project-to-config decision
- Samebase is authoritative only for the resulting attachment, its confirmed `convexConfigPath`,
  origin, and cleanup provenance

Do not add a Samebase-specific project id inside `convex.json`; it is not part of the supported
schema. A Worker build can change directories, and `convex.json.functions` can reference another
folder, so a marker at a different Worker root does not locate the config. One unique root-equality
suggestion is strong enough to preselect for review, not to attach silently.

A shared backend is represented once at its selected `convex.json` root. Workers from any root may
reference it through live markers. Conversely, several projects may appear under one config root
when the same codebase deploys to production and staging projects.

If a config is deleted or moved after attachment, keep the project attachment for cleanup and show
the missing confirmed path. Never silently move or delete the project. `Change code location` may
select only a currently discovered config and must invalidate path-owned schema snapshots. A project
that appears to match several config roots is ambiguous; the current simple model stores one
explicitly selected config path rather than inventing a many-to-many source relation.

### Project Selection, Code-Location Changes, And Cleanup

Because one root group can contain several Convex projects, a repository root does not identify a
database or schema target. Make the attachment id explicit in the route before enabling the new
cardinality:

```txt
/vault/:owner/:repo/db/:branch/project/:convexAttachmentId/root
/vault/:owner/:repo/db/:branch/project/:convexAttachmentId/mono/:rootPath...
```

Schema selection and production links should use the same `convexAttachmentId` directly. A legacy
root-only database route redirects when the root has exactly one project, shows a project chooser
when it has several, and shows the existing missing-resource state when it has none.

Changing code location is a dedicated transition, not another attachment. It re-reads the selected
config, patches the existing project's `convexConfigPath`, and invalidates that project's path-owned
schema snapshots. The old root group disappears automatically if no currently placed resource
resolves there.

Managed provisioning must never let an unrelated project at the target source placement satisfy a
plan. Only a `created` plan resolves its exact checkpointed project identity. A `planned` or
`creating` plan does not treat the first project in the same root group as a match and continues
through its existing create or inspection state.

Before deleting a Samebase-provisioned project, re-read markers for every retained Worker after
planned Worker deletions finish. A retained Worker is one that was not scheduled for provider
deletion or whose deletion did not succeed. A marker with the same `projectId` blocks project
deletion even when its team coordinate shows transfer drift. Partial or unavailable Worker evidence
fails closed for operator inspection. This changes the accepted deletion contract and belongs in
spec 098.

## Scenario Matrix

| Scenario                                                  | Expected behavior                                                                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Matching observations exist, but the user does nothing    | Create no attachment and no root group.                                                                                                      |
| Worker at `/`, config at `/convex.json`, valid marker     | Preselect the unique root-equality suggestion; confirmation records the project placement and attaches both resources.                       |
| Worker at `/`, config at `packages/backend/convex.json`   | Add the Worker at `/`; require explicit config selection before also adding the project under `packages/backend`.                            |
| Workers at `/` and `apps/admin` share one project marker  | Attach two Workers; attach the project once at its selected config path and show both live usage relations.                                  |
| Two Workers at one root name different projects           | Attach both Workers and allow both projects to select configs whose parents resolve to that root group.                                      |
| Several configs, one unique Worker/config root equality   | Preselect only that suggestion for explicit confirmation.                                                                                    |
| One project has several root-equality suggestions         | Mark the proposal ambiguous and require one explicit config choice.                                                                          |
| Matching Worker, no marker                                | Attach the Worker and display a Cloudflare-only root group; do not guess a Convex project.                                                   |
| Available Worker has no repository trigger                | Keep it unavailable until Cloudflare reports this GitHub repository and one root; do not collect a Samebase root override.                   |
| No Worker exists                                          | Create Worker configures the Cloudflare repository and root, re-reads that configuration, then records the attachment.                       |
| One config, no Worker                                     | Let the user add a visible Convex project using that read-only config path.                                                                  |
| Several projects, one config                              | Allow multi-select; attach each exact project with the same config path and render one root group.                                           |
| Data or Schema opens for a group with several projects    | Require a project-specific attachment id; never choose the first project silently.                                                           |
| Managed plan finds an unrelated project in the same group | Ignore it; only an exact created checkpoint can satisfy the plan.                                                                            |
| No Convex project exists                                  | Create Project asks for one discovered config and a name, then stores that path on the resulting attachment.                                 |
| No `convex.json` exists                                   | Explain that `convex.json` must be committed, disable adding and creating projects, and offer Rescan; Add Cloudflare remains independent.    |
| Config is malformed or lacks sibling `package.json`       | Show the path as invalid or unverified and do not allow it as a source placement.                                                            |
| GitHub tree is stale, truncated, or unreadable            | Report config discovery as unavailable; do not claim that no Convex code exists.                                                             |
| Add Convex is opened before Add Cloudflare                | Run the same optional Worker scan and show the same marker evidence, so order does not change the model.                                     |
| One Convex project used by several roots                  | Show the project once at its config-derived group and derive every consuming Worker relation from live markers.                              |
| Production and preview roots disagree                     | Mark the Worker proposal ambiguous and leave it unselected.                                                                                  |
| One Worker's active matching triggers name several roots  | Mark the Worker proposal ambiguous and do not place it in several groups.                                                                    |
| Production and preview project ids disagree               | Allow the otherwise verified Worker attachment, show inconsistent Convex evidence, and preselect no project placement.                       |
| Marker team hints differ for one verified project id      | Show team-coordinate drift, use the live project team, and preserve the project/config suggestion.                                           |
| Valid marker names an inaccessible project                | Show the exact external or unavailable project and attach only the Worker.                                                                   |
| Matching Worker is already attached elsewhere             | Show the global attachment conflict before confirmation.                                                                                     |
| Marker names a project attached elsewhere                 | Show the global project conflict and do not offer attachment.                                                                                |
| Project is already attached to this vault                 | Show its confirmed config path and keep retry idempotent.                                                                                    |
| Vault has projects from a previously connected team       | Keep them attached and visible; mark live detail unavailable and make cleanup fail closed.                                                   |
| Attached project transfers to another team                | Show ownership drift, block duplicate attachment and deletion inference, and require verified reconciliation.                                |
| Attached config moves or disappears                       | Keep the attachment, show the missing confirmed path, and require `Change code location` to select a current config.                         |
| Attached Worker changes Cloudflare root                   | Keep the attachment and render it in the group resolved from the new live root.                                                              |
| Attached Worker no longer names this repository           | Keep the attachment at vault scope, show configuration drift, and offer Rescan or Remove from Samebase.                                      |
| Attached Worker observation becomes unavailable           | Keep the attachment at vault scope and show `Could not verify`; never infer deletion.                                                        |
| Last placed resource leaves a root                        | The projected group disappears without a database cleanup transition.                                                                        |
| GitLab trigger has the same repo id string                | Do not treat it as a GitHub match.                                                                                                           |
| Selected account has more than 100 Workers                | Paginate the complete inventory and preserve deterministic ordering.                                                                         |
| Fresh tree does not contain the observed Worker root      | Warn about possibly stale Cloudflare configuration, but display the Worker at the provider-reported root.                                    |
| Provider access cannot create vault resources             | Do not open an actionable provider-add route.                                                                                                |
| Unattached Worker evidence is unreadable                  | Show the Worker as unavailable and create no attachment.                                                                                     |
| Selected evidence changes before confirmation             | Abort that confirmation, refresh the proposal, and write no partial local attachments.                                                       |
| Cloudflare fails after a manual Convex mapping            | Re-read GitHub and Convex and allow the explicit mapping; optional Worker evidence is not a dependency.                                      |
| Another request attaches a selected resource after review | Abort on the global ownership conflict and write no partial local attachments.                                                               |
| Provisioned project is referenced by retained Workers     | Re-read markers and fail closed before deletion; `origin` records who created it, but current identity and usage still require verification. |
| Existing-repository source sync succeeds                  | Land on the normal vault dashboard without scanning providers or starting another onboarding flow.                                           |

The shared-backend mental model now has one answer to test: the project appears once in the group
derived from its confirmed config path, while Workers from any root show their live references to
it. One root group may show several projects when the same codebase deploys to different
environments.

## Low-Cost Flow And Mental-Model Test

Use one scenario corpus for the planner, prototype, and later automated tests. Do not invent three
independent sets of mock data.

### 1. Pure Attachment Planner

Start with a pure function over provider observations and current attachments. Its output should
classify each proposed resource as:

- ready to propose as a Worker with current repository placement
- ready to propose as a project with one config-path suggestion
- needs a discovered config choice before project attachment
- needs repository or provider configuration before attachment
- blocked by conflicting evidence or an existing attachment
- unavailable because provider evidence could not be read

Table-drive it with the scenario matrix above. This proves grouping, normalization, cardinality,
idempotency, and fail-closed behavior before UI or database writes exist.

### 2. Concept Prototype

Render the proposed review through the real vault dashboard shell and production rail/dialog
components using the same scenario corpus. Compare it with the current root-first flow. Include the
single-root, two-root monorepo, same-root multi-Worker, Worker-only, Convex-only, shared backend,
conflicting marker, and missing-permission states.

Display resources under their independently resolved root groups. Allow several Workers and several
Convex projects under one root. Render cross-root `Uses backend at packages/backend` relationships
from live markers without nesting or duplicating the project under the consuming Worker groups.

Capture desktop and mobile screenshots. Before the proposed production components exist, these are
concept evidence only, even when shown inside the real dashboard chrome. They are not route or
visual acceptance.

### 3. Prediction-Based Review

Do not ask reviewers which design they prefer. Before they press the confirmation action, ask them
to predict:

1. which resource attachments Samebase will create
2. which root sections will appear afterward
3. which config path each selected Convex project will use
4. whether Samebase will change Cloudflare or Convex configuration
5. where a Convex backend shared by several Workers will appear
6. whether several Convex projects can share one code root

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
- Convex tests for server-verified config paths, several projects under one root group, global
  project exclusivity, origin ownership and upgrade without downgrade, idempotent retry, mixed-team
  and team-transfer drift, the measured transaction bound, and rejection of client-supplied roots
- Cloudflare tests for live root resolution and regrouping, evidence-drift rejection, explicit
  marker-project/config attachment, and no partial local writes
- cleanup tests that re-read live marker edges and refuse to delete a Samebase-provisioned project
  while retained Workers still reference it and fail closed on partial evidence
- GitHub discovery tests for regular config and package blobs, root normalization, invalid config,
  truncated trees, missing configs, and default-branch evidence drift
- React tests for projected root grouping, multiple resources per root, unavailable attached Worker
  placement, unique root-equality preselection, closed config selectors, read-only Worker roots,
  explicit ambiguity, and concrete confirmation copy
- route-search tests proving `?add-app-root` is gone and that bare provider flags, Back, Cancel, and
  unrelated query params behave correctly
- project-identity Data and Schema routes that do not assume a root resolves one project
- route-level Playwright coverage proving existing-repository connection lands on the normal vault
  dashboard without a provider step, then replaying the scenario corpus through the two standard
  provider modals with provider reads stubbed at the action or network boundary
- Linux visual acceptance for the desktop and mobile review states

## Suggested Implementation Order

1. Update specs 003, 098, 105, 106, and 110. Define attachments, live observations, projected root
   groups, confirmed Convex config paths, project-identity Data and Schema selection, batch Worker
   attachment, Create Worker's Builds responsibility, live marker usage, and the retained-Worker
   deletion gate together.
2. Build the shared scenario corpus and validate config selection, shared backends, and several
   projects at one code root through prediction-based review.
3. Add global `by_project` identity, persist verified `convexConfigPath`, and move `teamId` to live
   project observations. Widen production consumers from one project per root to a deterministically
   ordered project list. Update `connect_convex_project` and generated action documentation, managed
   provisioning with exact checkpoint lookup, provider observations, cleanup, dashboard graph
   validation and `get_user_vaults`, the resource rail, production links, Data and Schema routes,
   and schema snapshots before allowing a second project at one root.
4. Add complete default-branch config discovery and the server attachment boundary that accepts a
   config path, re-reads it, and never accepts a client root or app id.
5. Audit existing attachments against their derived config paths, show missing-source drift, and add
   explicit code-location and provider-verified team-transfer transitions. Do not remap projects
   automatically.
6. Add vault-scoped, read-only Cloudflare discovery and its pure planner.
7. Resolve Worker placement from live Cloudflare reads, remove `appId` from both attachment tables,
   migrate consumers to attachment ids and projected root groups, then delete `vaultApps`.
8. Add vault-level, multi-select Add Convex with closed config selectors and no root field.
9. Make bare `?add-cloudflare` and `?add-convex` the two vault-level entry points, then remove the
   standalone Add app root flow and repeated per-root provider links.
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
