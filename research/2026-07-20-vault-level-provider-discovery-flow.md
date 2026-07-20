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
  - `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`
  - `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`
  - `research/2026-05-19-existing-app-resource-adoption.md`
  - `research/2026-05-22-provider-resource-discovery-and-configuration.md`
  - `research/2026-07-06-cloudflare-worker-create-connect-live-test-matrix.md`

## Recommendation

Keep `vaultApps`, but remove app-root creation from the user mental model.

A vault is a GitHub repository. A vault app is the internal identity for one canonical repository
root. Users should create or reveal that identity by adding a real provider resource, not by first
creating an empty app root.

The dashboard should expose exactly two vault-level provider entry points:

1. `?add-cloudflare`
2. `?add-convex`

`?add-cloudflare` should discover Workers connected to the vault's immutable GitHub repository id,
group them by their normalized Workers Builds `root_directory`, and ask once before creating or
reusing the corresponding app roots and attaching the selected Workers.

`?add-convex` should list Convex projects at vault scope. Projects named by valid
`SAMEBASE_CONVEX_PROJECT` markers should be ranked first. Every new project attachment should ask
the user to confirm its owning repository root. A marker can identify consuming Worker roots, but it
cannot prove the root where the Convex backend lives.

Use automatic read-only discovery followed by explicit confirmation. Do not silently attach provider
resources. An attachment establishes durable identity and cleanup provenance even when it does not
mutate the provider.

Do not persist discovery results or a Worker-to-Convex edge. Cloudflare remains the live source for
repository, root, Builds, and Worker-to-Convex configuration.

## Why PR #1243 Makes This Viable

PR #1243 reduced the durable model to stable identities and moved mutable provider state back to
live reads:

| Concept                                           | Durable Samebase state                       | Live provider state                                                     |
| ------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| Repository                                        | `vaults` GitHub identity                     | current GitHub repository and tree                                      |
| App root                                          | one `vaultApps` row per canonical root       | Workers Builds `root_directory` evidence                                |
| Worker                                            | `vaultCloudflareWorkers` identity and origin | existence, URLs, triggers, repository connection, environment variables |
| Convex project                                    | `vaultConvexProjects` identity and origin    | project details and default production deployment                       |
| Worker Builds declares Convex project coordinates | none                                         | `SAMEBASE_CONVEX_PROJECT` on Builds triggers                            |

The current invariants already support the proposed result:

- one app row per normalized root in a vault
- multiple Cloudflare Workers attached to one app
- at most one Convex project attached to one app
- one exact Worker or Convex project attached globally in Samebase
- a Worker may use a Convex project attached to another app in the same vault
- `selected_existing` attachments remain provider-owned for cleanup

The missing capability is not a new data model. It is a vault-scoped discovery and attachment flow
that can create or reuse `vaultApps` as part of attaching a resource.

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

The user-facing rule should be:

> Add a provider resource. Samebase locates the app it belongs to, or asks for the folder when the
> provider cannot prove it.

This removes the separate app-versus-monorepo decision. One discovered root means one app. Several
discovered roots mean a monorepo. The user can still correct or supply a root when provider evidence
is absent or ambiguous.

### Vault-Level Route Semantics

- `/vault/<owner>/<repo>?add-cloudflare` opens the Cloudflare flow for the vault.
- `/vault/<owner>/<repo>?add-convex` opens the Convex flow for the vault.
- Neither route requires `app-root`.
- Both routes require app-create access because their confirmation actions create or attach
  resources. Provider-connection access alone should not open a flow that cannot complete.
- The provider dialogs own root selection when it is needed.
- `?add-app-root` is removed from the primary dashboard surface and route suggestions.
- Existing app rows display attached resources. They do not repeat provider-add links per app.

`vaultApps` remains a real backend entity because it provides stable attachment ownership and a
canonical root. The standalone public action that creates an empty app row should disappear once
provider actions can ensure a root and attach the resource in one transaction.

A repository folder with neither a Cloudflare Worker nor a Convex project will no longer receive a
`vaultApps` identity. That is intentional while app roots have no provider-independent product
behavior. Add a secondary root-only path later only if a real app-level feature needs it.

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
retain exactly the observed Cloudflare `root_directory`. A manually selected or newly created
resource without provider root evidence continues to use root suggestions plus syntax validation,
not tree existence as a hard invariant.

### Review And Attachment

The review should describe concrete effects, for example:

> Found 3 Workers in 2 app roots. Add them to Samebase?

It should group selected resources by root and distinguish:

- create app root versus reuse existing app root
- attach Worker versus already attached
- Convex project named by the Worker's Builds marker
- unreadable, invalid, missing, or conflicting provider evidence

Confirmation should re-read the selected Worker identities and trigger evidence, then make one
Samebase database transaction that:

1. creates or reuses one `vaultApps` row per normalized root
2. attaches every selected Worker with `origin: "selected_existing"`

The attach action must not alter Workers Builds, environment variables, deploy keys, or domains.
Those remain separate explicit configuration actions.

Multiple Workers at one root are one app with several Worker attachments. The current data model
supports that cardinality, so the UI should keep vault-level Add Cloudflare available after the
first Worker is attached.

The same flow must preserve the start-from-zero paths. A Worker with no repository trigger can still
be selected, and a new Worker can still be created. In both cases the user chooses a root inside Add
Cloudflare before the provider action runs. Root creation and stable attachment are recorded
together after the external Worker identity is confirmed. A created Worker attaches with
`origin: "provisioned"`. If provider creation succeeds but the local transaction fails, report the
possible orphan and do not automatically delete the Worker, preserving the accepted manual-create
failure boundary.

### Existing Repository Prompt

After existing-repository source sync succeeds, run the read-only scan automatically only when a
default Cloudflare account is already selected. If exact matches exist, show a nonblocking prompt
that opens the same vault-level Cloudflare review.

If the user has no Cloudflare connection or no selected account, keep repository onboarding complete
and let `?add-cloudflare` collect that missing provider scope. Do not scan every accessible account
in the background.

The automatic prompt is an onboarding suggestion, not a recurring alert. Persist a per-vault
dismissal after the user closes it, without persisting the discovery result. Vault-level Add
Cloudflare remains available for a later manual scan.

## Convex Flow

Convex inventory does not expose a GitHub repository or source root. Removing `?add-app-root` does
not remove the need to identify a root for a Convex-only app. It moves that question into the
provider flow where the reason is visible.

`?add-convex` should:

1. run the same read-only Worker scan when a selected Cloudflare account is available, regardless of
   whether Add Cloudflare was opened first
2. list every visible project in the connected Convex team and mark its attachment eligibility
3. rank eligible project coordinates claimed by valid Worker markers above unrelated inventory
4. show which Workers and roots declare that project as their Builds target
5. require the user to choose an existing app or a repository folder as the project's owning root
6. create or reuse the root and attach the project in one Samebase transaction

If Cloudflare scope is unavailable, the flow still lists Convex inventory and asks for a root. It
must also preserve Create Project: the user chooses a root and project name inside Add Convex, then
the action records the root and stable project attachment with `origin: "provisioned"` after
external creation succeeds. If creation succeeds but local attachment fails, report the possible
orphan and do not automatically delete the project.

The marker is an exact readable project-identity claim, but it is not all of these things:

- proof that the hidden deploy keys belong to the named project
- proof that the named project still exists or is accessible
- proof of the repository root that contains the Convex backend
- permission to attach or reconfigure the project

Production and preview markers must both be readable, valid, and equal before the project is
preselected. Missing, secret, malformed, one-sided, or conflicting markers remain visible evidence
states and do not choose a project.

If Worker identity and repository/root triggers are readable but marker environment variables or
Convex inventory are unavailable, the Worker remains attachable. Only the Convex suggestion is
unavailable. Failure at a later evidence layer must not erase a safe result from an earlier layer.

Adding Cloudflare should not automatically attach a previously unattached Convex project to the
Worker's root. A shared backend may be used by Workers from several roots and is represented once at
its own root. The Cloudflare review can identify the project and make the later Add Convex choice
easy, but the owning root still needs confirmation.

## Scenario Matrix

| Scenario                                                  | Expected behavior                                                                                                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One Worker at `/`, valid marker                           | Preselect the Worker at `/`; show its Convex target; one confirmation creates the app and attaches the Worker.                                            |
| Workers at `/` and `apps/admin`                           | Group into two app candidates and attach the selected Workers in one review.                                                                              |
| Two Workers at `apps/web`                                 | Create or reuse one app and attach both Workers.                                                                                                          |
| Two Workers at one root name different Convex projects    | Attach both Workers; preselect neither project. The user chooses one project for that app or another backend root, and the other marker remains external. |
| Matching Worker, no marker                                | Create the Cloudflare-only app; do not guess a Convex project.                                                                                            |
| Available Worker has no repository trigger                | Ask for a root inside Add Cloudflare before attachment.                                                                                                   |
| No Worker exists                                          | Create Worker remains available and asks for its root inside Add Cloudflare.                                                                              |
| Convex project, no Worker                                 | Ask for an existing app or repository root inside Add Convex.                                                                                             |
| No Convex project exists                                  | Create Project remains available and asks for its root inside Add Convex.                                                                                 |
| Add Convex is opened before Add Cloudflare                | Run the same read-only Worker scan and show the same marker evidence, so order does not change the model.                                                 |
| One Convex project used by several roots                  | Show all consuming Workers; require one explicit owning backend root.                                                                                     |
| Production and preview roots disagree                     | Mark the Worker ambiguous and leave it unselected.                                                                                                        |
| One Worker's active matching triggers name several roots  | Mark the Worker ambiguous and do not place it in several app groups.                                                                                      |
| Production and preview markers disagree                   | Show inconsistent Convex evidence and do not preselect a project.                                                                                         |
| Valid marker names an inaccessible project                | Show an external or unavailable project; attach only the Worker.                                                                                          |
| Marker endpoint is unreadable                             | Attach the otherwise verified Worker; show no Convex preselection.                                                                                        |
| Matching Worker is already attached elsewhere             | Show the global attachment conflict before confirmation.                                                                                                  |
| Marker names a project attached elsewhere                 | Show the global project conflict and do not offer attachment.                                                                                             |
| Chosen app already has another Convex project             | Require another root or leave the marker external.                                                                                                        |
| Existing normalized root                                  | Reuse the existing app row and keep retry idempotent.                                                                                                     |
| GitLab trigger has the same repo id string                | Do not treat it as a GitHub match.                                                                                                                        |
| Selected account has more than 100 Workers                | Paginate the complete inventory and preserve deterministic ordering.                                                                                      |
| Cached tree is stale or truncated                         | Show weak tree evidence without blocking the provider-observed root.                                                                                      |
| Fresh complete tree does not contain the observed root    | Warn about possibly stale Cloudflare configuration, but preserve the observed root if the user attaches.                                                  |
| Provider connection access without app-create access      | Do not open an actionable provider-add route.                                                                                                             |
| Worker identity or repository/root evidence is unreadable | Show the Worker as unavailable and make no attachment.                                                                                                    |
| Trigger root or marker changes after review               | Abort confirmation and require a refreshed review; create no empty app root.                                                                              |
| Another request attaches a selected resource after review | Abort on the global ownership conflict and create no empty app root.                                                                                      |
| User dismisses the post-import prompt                     | Do not show it again for that vault; manual Add Cloudflare remains available.                                                                             |

The shared Convex backend scenario is the main mental-model question to test. The current accepted
model places that project once at its own root, while Workers from any app may refer to it through
live marker state.

## Low-Cost Flow And Mental-Model Test

Use one scenario corpus for the planner, prototype, and later automated tests. Do not invent three
independent sets of mock data.

### 1. Pure Adoption Planner

Start with a pure function over provider observations and current attachments. Its output should
classify each proposed resource as:

- ready to attach
- needs a root decision
- blocked by conflicting evidence or attachment ownership
- unavailable because provider evidence could not be read

Table-drive it with the scenario matrix above. This proves grouping, normalization, cardinality,
idempotency, and fail-closed behavior before UI or database writes exist.

### 2. Concept Prototype

Render the proposed review through the real vault dashboard shell and production rail/dialog
components using the same scenario corpus. Compare it with the current root-first flow. Include the
single-app, two-root monorepo, same-root multi-Worker, Worker-only, Convex-only, shared backend,
conflicting marker, and missing-permission states.

Capture desktop and mobile screenshots. Before the proposed production components exist, these are
concept evidence only, even when shown inside the real dashboard chrome. They are not route or
visual acceptance.

### 3. Prediction-Based Review

Do not ask reviewers which design they prefer. Before they press the confirmation action, ask them
to predict:

1. how many apps will exist afterward
2. which Workers and Convex projects Samebase will attach
3. whether Samebase will change Cloudflare or Convex configuration
4. where a Convex backend shared by several Workers will appear

The design passes when reviewers can teach back those effects from the screen without the
implementation rationale. Wrong predictions identify a mental-model or copy problem more directly
than preference feedback.

Screenshot-only, context-blind agent reviewers can cheaply find copy and consistency problems. They
are an adversarial scan, not comprehension evidence. Use short human think-aloud sessions for the
mental-model decision and shared-backend placement.

### 4. Read-Only Live Contract Probe

Use one temporary existing-repository vault and a real Cloudflare account to verify:

- complete Worker inventory pagination
- whether beta Worker `id` is accepted as the Builds `external_script_id`
- trigger repository provider and exact repository id
- root normalization
- production and preview trigger selection
- marker visibility through the environment-variable endpoint
- behavior when a candidate has no marker
- partial fallback inventory and large-account request fan-out

The probe must perform no provider writes. After the observation shape is trusted, use the normal
route-level live flow to test one confirmed attachment.

### 5. Acceptance Coverage After The Model Is Chosen

- pure planner tests for every scenario row
- Convex tests for auth, global resource exclusivity, transactional root creation, idempotent retry,
  and no partial local writes
- React tests for grouping, unique preselection, explicit ambiguity, and concrete confirmation copy
- route-search tests proving bare provider flags, Back, Cancel, and unrelated query-param
  preservation
- route-level Playwright coverage for the real existing-repository flow without the old Add app root
  step, replaying the scenario corpus through the real bare-flag routes with provider reads stubbed
  at the action or network boundary
- Linux visual acceptance for the desktop and mobile review states

## Suggested Implementation Order

1. Build the data-only scenario corpus and compare the root-first and provider-first prototype.
2. Validate the shared Convex backend placement through prediction-based review.
3. Add vault-scoped, read-only Cloudflare discovery and its pure planner.
4. Let provider attachment actions create or reuse app roots transactionally.
5. Make bare `?add-cloudflare` and `?add-convex` the two vault-level entry points.
6. Use Worker markers to rank Convex projects without persisting a relationship.
7. Remove the standalone Add app root flow and repeated per-app provider links.
8. Update specs 105 and 106 to the accepted route and attachment contract.

## Sources

- [Cloudflare Workers list all Workers](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/methods/list/)
- [Cloudflare Workers legacy scripts inventory](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/list/)
- [Cloudflare Workers Builds trigger inventory](https://developers.cloudflare.com/api/resources/workers_builds/subresources/triggers/methods/list)
- [Cloudflare Workers Builds trigger environment variables](https://developers.cloudflare.com/api/resources/workers_builds/subresources/triggers/subresources/environment_variables/methods/list)
- [Cloudflare API token permission groups](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- [Cloudflare API request limits](https://developers.cloudflare.com/fundamentals/api/reference/limits/)
