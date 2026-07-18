# 115 Vault App Resource Ownership Spec

## Document Control

- Status: Accepted
- Owner: Samebase vault app and infrastructure model
- Last updated: 2026-07-18
- Related docs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/090_ROUTE_SEARCH_PRESENCE_FLAGS_SPEC.md`
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md`
  - `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`
  - `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`
  - `specs/110_VAULT_ROUTE_SURFACE_SPEC.md`

This spec supersedes those documents wherever they treat a root string as provider identity, assume
same-root Worker and Convex ownership, name the field `appRoot`, expose `add-app-root` or `app-root`
route parameters, address a deployment route by root string, or wire Builds automatically during
Worker attachment. Their provider-specific connection details remain current where they do not
conflict with this model.

## Nouns

- **Vault**: one GitHub repository connected to Samebase for repository observation.
- **App**: a durable Samebase row representing one repository root. It has a stable `appId` and an
  exact `rootDirectory`.
- **Root directory**: the repository path where an app lives. The repository root is exactly `/`. A
  nested root is a relative path without a leading or trailing slash, such as `apps/web` or
  `packages/backend`. Samebase uses Cloudflare's `root_directory` spelling and meaning.
- **Provider resource**: an external resource attached to an app by stable provider identity. Its
  root directory is not its identity.
- **Creation claim**: a temporary Samebase row written before a provider create request. It records
  which vault, app, run, and planned provider identity own an unresolved external write.
- **Provisioned origin**: Samebase received a successful create response, recorded the returned
  stable provider ID, and then attached that exact resource.
- **Selected-existing origin**: the user selected an existing resource, or Samebase found a
  same-named resource while recovering a create request whose response was never recorded.
- **Worker**: a Cloudflare Worker provider resource. Cloudflare Workers is the only hosting resource
  Samebase supports.
- **Workers.dev availability**: Samebase's latest observation of a Worker's default production URL.
  It is exactly one of `available` with a URL, `disabled`, or `unknown` when Cloudflare did not
  provide a conclusive answer.
- **Convex production deployment**: the project's shared live deployment. It belongs to the app
  selected as the Convex project's root.
- **Convex development deployment**: a persistent personal deployment for one Convex team member.
  Samebase does not connect, create, or store it in this slice.
- **Convex preview deployment**: a transient, branch-named deployment created or reused by a
  non-production build. It is not a development or production deployment fallback.
- **Deployment dependency**: an explicit directed relation saying that one Worker's build pipeline
  deploys one Convex deployment. It does not transfer resource ownership.
- **Build**: evidence that a provider build actually ran. A possible deployment dependency without a
  build is not an empty or failed build.

## Current Contract

### Durable app identity

An app is stored independently from its provider resources. Its stable `appId`, not its root string,
is the foreign-key target for Worker and Convex resource rows. Within one vault, one normalized
`rootDirectory` identifies one app row. Provider-resource identity remains its stable provider ID.
The `/` app may coexist with nested apps in the same vault.

An app remains visible when it has no Worker and no Convex deployment. This is a normal state, not
an incomplete provider record. An Expo app at `apps/mobile`, for example, remains a useful app even
when Samebase does not model its runtime hosting.

Worker and Convex resources each belong to exactly one app across the stored Samebase graph. A
Cloudflare Worker's stable identity is its Cloudflare account ID plus immutable Worker ID, stored as
`workerTag`. `workerName` is the current mutable provider name and the account-scoped reservation
key used before creation returns an ID. Samebase forbids two rows or claims from splitting either
the same account and Worker ID or the same account and current Worker name. Verification reads the
Worker by immutable ID and refreshes its current name. A Convex project's provider project ID is its
stable identity. Its immutable team ID is the ownership and authorization scope that must match
provider reads and active credentials before Samebase writes; team and project slugs are mutable
observations. Different resource types can share the same root without colliding. More than one
Worker may also use one root if the provider contains that configuration. An app owns zero or one
Convex production deployment and zero or more Workers. Samebase never uses `rootDirectory` as a
Worker or Convex deployment ID.

Every attached provider row explicitly records whether its upstream resource is `present` or
`missing_upstream`. Omission never means present. Every Worker also records workers.dev availability
as `available`, `disabled`, or `unknown`; a provider read failure is never stored as if workers.dev
were intentionally disabled. Infrastructure verification refreshes both observations.

`vaultConvexDeployments` stores only the attached production deployment. It has no nested
development or preview deployment field. A missing branch preview remains missing, and provider
uncertainty remains unknown or failed; Samebase never substitutes a personal development deployment
or the production deployment because its URL happens to be available.

Creating an app and attaching a provider resource are separate operations. The repository-root app
may be added before or after nested apps, but it can exist only once. Every other app identifies its
own folder root. The UI asks the user to add an app and treats `rootDirectory` as that app's
location; it does not model "app root" as another entity.

### Provider creation claims and origins

Samebase inserts a provider-specific creation claim immediately before asking Cloudflare to create a
Worker or Convex to create a project. A `creating` claim means the provider request may not have
started, may have failed, or may have succeeded without Samebase receiving its response. It does not
prove that an upstream resource exists and does not authorize provider deletion.

After Samebase receives a successful create response, it records the returned immutable Worker ID or
Convex project ID by changing the claim to `created`. Attaching that exact provider resource and
deleting its claim happen in one mutation. The attached row receives `origin: "provisioned"` only
from this confirmed path.

Recovery is deliberately conservative. If a `creating` claim finds a resource at the planned name,
Samebase cannot prove whether its own unanswered request created it or whether it already belonged
to the user. It attaches that resource with `origin: "selected_existing"` and consumes the claim.
Selected-existing resources may participate in later explicit configuration actions, but Samebase
never offers to delete them as part of vault deletion. If a `created` resource is renamed before
attachment, Samebase follows its stable ID, records the current name, and preserves provisioned
origin.

Creation claims are operational write checkpoints, not a second resource inventory. Each vault may
have at most one unconsumed Cloudflare creation claim and one unconsumed Convex creation claim. This
vault-wide limit prevents an ambiguous external write for one app from being hidden behind a second
create for another app. Once the first claim is consumed, the vault may create another Worker or
Convex project for another app.

A standalone provider connection becomes successful in the same mutation that attaches the provider
row and consumes its claim. The following Workflow finish step is idempotent. Composed
Samebase-managed creation remains active after attachment because it still has explicit build and
deployment wiring steps to perform. Its terminal mutation marks both the composed ownership and its
run successful and records the final event atomically; retrying that mutation is a no-op. The
terminal mutation rejects incomplete state: provider creation claims must be consumed, the target
Worker and target app's production deployment must both be present, Workers Builds must be
connected, and the Worker's dependency on that deployment must be fully wired.

The composed create target pins the selected Convex team ID, planned project name, Cloudflare
account, and planned Worker name before provider writes. Each provider side begins as `planned`.
Attachment changes it to `attached` with the exact stable Samebase deployment or Worker row ID in
the same mutation that writes the resource. Changing the active Convex connection cannot redirect a
create into another team. A different Convex deployment attached to the target app does not satisfy
the planned target, and composed completion follows only the recorded deployment ID. Retries follow
the recorded row IDs and read their current provider identities. They never rediscover an attached
Worker by the original mutable name. If a referenced provider resource is confirmed missing
upstream, the retained plan remains explicit replacement intent. Successful replacement updates the
same stable Samebase row, so app ownership and dependencies stay attached to one resource identity.

Replacing the provider project or production deployment behind a stable Samebase Convex deployment
row clears schema snapshots collected from the old provider identity in the same mutation. Schema
graph layout rows remain attached to the stable app and deployment slot as user preferences; they
are not evidence about the provider's current schema.

### Resource ownership and display

A shared Convex deployment appears once beneath the app that owns its actual root. Samebase does not
copy it beneath every client that imports its generated API or calls its URL.

For the shared-backend fixture:

| Root directory     | Owned resources                                            |
| ------------------ | ---------------------------------------------------------- |
| `apps/admin`       | `shared-convex-monorepo-fixture-admin` Worker              |
| `apps/web`         | `shared-convex-monorepo-fixture-web` Worker                |
| `apps/mobile`      | none                                                       |
| `packages/backend` | `shared-convex-monorepo-fixture-backend` Convex deployment |

The UI shows all four apps. It shows the shared Convex deployment only under `packages/backend`.
Deployment-specific schema and database routes address the selected Convex deployment by its stable
Samebase deployment ID. A root directory is display and ownership context, not a deployment route
identifier.

### Explicit deployment dependencies

A Worker-to-Convex deployment dependency is stored only when the Worker build pipeline is intended
to deploy that Convex deployment. The relation references the Worker resource ID and Convex
deployment resource ID, so cross-root wiring does not rely on path equality.

Attaching a Worker records only the Worker resource. It does not infer a Convex dependency, create
Workers Builds triggers, or start a build. Connecting the Worker to its GitHub repository is a
separate explicit operation. If Convex deployments are available, Samebase asks whether this Worker
deploys none of them or one specifically selected deployment.

When reconnecting a Worker that already has a dependency, the chooser shows that dependency
explicitly and allows another Convex deployment to be selected. This slice does not detach an
existing dependency, so it does not present a Worker-only choice that would leave the stored edge
and deploy keys unchanged.

Submitting the explicit `Deploy Convex` action claims the dependency, validates that the selected
Convex production deployment exists in the selected project and connected team, creates or
reconciles both Workers Builds triggers without starting a build, rotates the dependency's two
deploy keys, installs and reads back the least-privilege trigger secrets, and only then starts the
initial production build. Provider target validation happens before trigger changes or deletion of
old keys. The dependency stays `not_wired` until the sequence completes. This prevents a
deliberately created build from starting with missing or partially installed backend credentials and
prevents an invalid replacement target from destroying working credentials.

Importing a Convex API, using a Convex URL, sharing a commit, or living nearby in the repository
does not create a deployment dependency. In particular, `apps/mobile` consumes the shared backend at
runtime but has no Worker build pipeline, so Samebase must not infer a mobile-to-backend deployment
edge.

Each dependency owns the unique Convex deploy-key names minted for that Worker pipeline. Every key
identity retains the immutable Convex team ID that authorizes its cleanup. A production key also
retains its deployment name; a preview key retains its project ID. The names, authorization team,
and targets do not live as one global pair on the Convex deployment. This permits multiple Workers
to depend on one backend while preserving exact cleanup evidence. Secret values are passed directly
between provider operations and are never stored in Samebase.

Each wiring attempt mints fresh provider key names. Before asking Convex to create either key,
Samebase records that exact name, owning team, provider target, and owning run on the dependency as
`creating`. `creating` means the key may or may not exist at Convex because Samebase might have lost
the provider response. Recovery first proves that the active connection matches the recorded team,
then deletes that exact identity and accepts provider not-found as success before minting a
replacement. Only the same active run, team, name, and target may advance a key from `creating` to
`created`.

Attempts are therefore serialized. Elapsed time never lets another run replace an active provider
writer because changing the database owner cannot fence an in-flight provider request. Workflow
retry within the same active run may reconcile only that run's recorded identities. A new run can
claim only after the previous owner is terminal. Successful provider deletion clears only the exact
matching team-qualified `creating` or `created` identity. Failed deletion retains the identity for
recovery.

Rewiring a Worker to another Convex deployment in the same team keeps the dependency identity and
makes the relationship `not_wired`. Samebase revokes the old target-specific keys before minting
replacements. Rewiring to another team is rejected before changing the dependency, ownership,
triggers, or keys while any old-team key identity remains. With one active Convex connection,
Samebase cannot safely revoke old-team keys and mint new-team keys in one automatic transition. A
failure leaves the relationship visibly `not_wired`. When a shared Convex deployment becomes
unavailable or changes provider identity, every relationship pointing to it reads as `not_wired`.
Samebase derives that state from stored team-qualified key targets and current provider identity
rather than rewriting every dependent relationship. The UI must never report a relationship as wired
while its Convex deployment is missing upstream.

Samebase-managed Cloudflare triggers use least privilege:

- the production trigger stores only `CONVEX_DEPLOY_KEY`, as a secret;
- the preview trigger stores only `PREVIEW_CONVEX_DEPLOY_KEY`, as a secret;
- the production key targets the selected production deployment;
- the preview key targets the selected Convex project and creates or updates branch previews.

Cloudflare returns secret names and `is_secret`, but not their values. Infrastructure verification
proves the expected secret name and classification on each trigger and the absence of the other
trigger's key. It cannot prove the write-only value, so Samebase retains the provider key name on
the dependency and relies on a real provider build to prove end-to-end deployment.

Deleting a vault removes Samebase's local app, resource, and dependency rows. Provider deletion is
off by default. The confirmation names the operation as deleting all listed Samebase-provisioned
resources of that provider and shows the exact count. Selecting it deletes every listed
Samebase-provisioned Worker or Convex project in that vault, never selected-existing resources. A
retained Worker keeps its Builds triggers, variables, repository connection, and builds unchanged. A
retained Convex project or deployment keeps its production and preview deploy keys unchanged. When a
Worker is explicitly selected through that all-listed confirmation, its Builds triggers are
subordinate resources and are deleted immediately before the Worker itself.

An unresolved `creating` claim disables provider deletion because Samebase lacks a stable resource
ID and ownership proof. Local-only vault deletion remains available and removes the claim while
leaving any possible upstream resource untouched. A `created` claim has a stable provider ID and is
included in the explicit Samebase-provisioned deletion count even if attachment did not complete.

Account deletion follows `specs/113_ACCOUNT_DELETION_SPEC.md`: it may revoke Samebase's supported
OAuth grants and removes local provider credentials, but it does not change Workers, Builds
triggers, Convex projects or deployments, or Convex deploy keys. Previously distributed deploy keys
can remain usable until the user revokes Samebase in Convex Authorized Applications.

### Trigger policy and the shared-backend fixture

Workers Builds path filters are editable provider configuration, not app identity. Samebase's
generated starting configuration watches the Worker's own root, selected dependency roots, and the
repository-level package files needed by the current pnpm templates. A user or agent may replace
that policy directly in Cloudflare when a repository needs different rebuild behavior.

Verification does not silently adopt a custom build command or path-filter policy as
Samebase-managed configuration. It reports the mismatch, and the explicit wiring action restores the
generated Samebase configuration. Users remain free to keep custom provider configuration and
operate it directly through Cloudflare.

The live shared-backend fixture deliberately uses `path_includes: ["*"]` and `path_excludes: []` for
both `apps/admin` and `apps/web`. Every fixture PR therefore builds both Workers, even when only one
frontend root changed, so a reviewer always receives a complete pair of previews backed by the same
branch-named Convex preview deployment. This is a fixture product choice, not an inferred dependency
algorithm Samebase must impose on every repository.

Each Worker still has its own `root_directory` (`apps/admin` or `apps/web`), build command,
immutable version URL, and mutable branch alias. The production trigger includes only `main`, runs
`pnpm run deploy`, and stores only `CONVEX_DEPLOY_KEY`. The preview trigger includes `*`, excludes
`main`, runs `pnpm run deploy:preview`, and stores only `PREVIEW_CONVEX_DEPLOY_KEY`. Both preview
scripts use the same branch-derived Convex preview name, so concurrent builds converge on one
backend preview without treating either Worker as the backend owner.

### Provider-optional GitHub monitoring

Repository inventory, branches, pull requests, comparisons, checks, and filtering require GitHub
access only. A user can monitor a repository without connecting Cloudflare or Convex and without
creating infrastructure resources. Cloudflare and Convex connections enrich explicit app rows but do
not gate ordinary GitHub monitoring.

Samebase supports Cloudflare Workers only as hosting. It does not model Cloudflare Pages, Netlify,
Expo hosting, or another hosting provider. Convex-only and resource-empty apps remain valid.

## Fixture Acceptance Stories

1. After the four fixture roots are added and their resources connected, the fixture has four
   durable apps with different stable IDs. Reloading or refreshing the repository does not recreate
   those app identities.
2. `apps/mobile` remains visible with no provider resource and no deployment dependency.
3. Workers appear under `apps/admin` and `apps/web`; the Convex deployment appears once under
   `packages/backend`; both cross-root dependencies are visible separately.
4. Any current fixture PR creates one Admin Worker build and one Web Worker build because the live
   fixture intentionally uses wildcard path filters.
5. Both preview builds use the same branch-derived Convex preview name. An Admin-only, Web-only,
   mobile-only, or backend-only change therefore still yields a complete two-frontend preview set.
6. Each Worker build publishes its own immutable Worker version URL plus its own mutable branch
   alias URL. The two Workers never share a preview URL merely because they share one Convex
   preview.
7. A same-root full-stack app can own both a Worker and a Convex deployment without either resource
   replacing the other.
8. A repository with no Cloudflare or Convex connection still exposes its complete GitHub monitoring
   UI.
9. Attaching a Worker creates no Builds trigger. Choosing "No Convex deployment" connects ordinary
   Worker Builds; choosing a specific deployment creates the explicit dependency and does not start
   its initial build until both trigger secrets have been read back successfully.
10. A provider create response recorded with its stable ID produces a provisioned attachment. A
    same-named resource found while recovering an unanswered create request produces a
    selected-existing attachment.
11. A standalone connection cannot leave a ready provider row behind a failed connection run if its
    final Workflow step is interrupted.
12. An unresolved creation claim blocks a second create for that provider anywhere in the vault and
    blocks provider deletion, but it does not block local-only vault deletion.
13. Changing the connected Convex team after the create target is recorded stops provisioning before
    the project create request.
14. A composed run cannot finish while either provider claim remains, either provider resource is
    missing, Workers Builds is not connected, or the target Worker dependency is absent or not
    wired.
15. Replacing a Convex provider identity preserves the stable Samebase deployment row and its graph
    layout preferences, but clears every schema snapshot collected from the old provider identity.
16. Switching the active Convex connection to another team does not make a deployment owned by the
    previous team appear deleted. Samebase leaves its upstream state unchanged until that team can
    be checked again, and operations that need provider access stop before changing triggers or
    deploy keys.
17. A composed create records the exact Convex deployment and Cloudflare Worker rows it attached.
    Another deployment already attached to the app cannot satisfy that create or let it finish.
18. An active provider-writing run remains the only writer regardless of elapsed time. Another run
    can start only after the owner is explicitly recorded as succeeded or failed.
19. Rewiring a Worker to a Convex deployment in another team stops before changing local state or
    provider state while a deploy-key identity from the previous team remains.

## Validation

Provider-mocked tests must prove root-directory normalization, stable app/resource foreign keys,
exact composed target pointers, exact trigger payloads, least-privilege environment-variable
payloads, team-qualified dependency-owned deploy-key state, serialized provider-write ownership,
idempotent same-team rewiring, cross-team fail-closed behavior, drift detection, and cleanup after
partial failure. They must also prove that retained provider resources produce no Cloudflare or
Convex calls during vault or account deletion, while an explicitly selected Worker deletion still
removes its triggers and then the Worker. Creation tests must prove pre-write claims,
response-confirmed origin, conservative same-name recovery, vault-wide claim cardinality, atomic
standalone completion, and claim-aware deletion behavior.

Live fixture validation must prove the intentional wildcard trigger policy, root-relative build
execution, write-only secret readback, one shared branch-named Convex preview, deployment URL
injection into both frontends, GitHub check counts, and each Worker's immutable versus branch-alias
preview URLs. It must include Admin-only, Web-only, mobile-only, and backend-only commits.

The app dashboard must be checked against the real connected fixture. Unit-only fixture UI is not
sufficient evidence for ownership placement or empty-app visibility.

## Non-Goals

- Inferring runtime dependencies between arbitrary clients and backends.
- Supporting another hosting provider or Cloudflare Pages.
- Persisting personal Convex development deployments or branch preview inventory as app
  infrastructure.
- Copying provider deployment history into Samebase.
- Showing closed pull requests or historical build attempts.

## Rollout

Before this schema is deployed, delete every existing vault and all vault-owned rows from the
production deployment and from any development deployment that will be reused. Verify those tables
are empty, then deploy the schema and reconnect the fixture and user vaults. This reset is a merge
prerequisite, not a migration. No legacy root-directory adapter, dual-read path, or data backfill is
required. The implementation replaces the old same-root assumption directly and deletes the obsolete
shape.
