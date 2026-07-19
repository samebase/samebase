# Convex Manual Deployment Connection

## Document Control

- Status: Accepted
- Owner: Samebase provider resources, vault dashboard
- Created: 2026-05-23
- Related:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `specs/103_CONVEX_API_VALIDATION_SPEC.md`
  - `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`
  - `research/2026-05-19-existing-app-resource-adoption.md`
  - `research/2026-05-22-provider-resource-discovery-and-configuration.md`

## Summary

Convex deployment connection is a vault resource attachment. It is separate from provider credential
connection and separate from deployment wiring.

The dashboard resource rail should let a ready GitHub-connected vault:

- connect an existing Convex project from the connected Convex team
- create a new Convex project with a production deployment

Both flows attach the selected or created Convex project to `vaultConvexProjects`, keyed by app.
That row stores only the stable project coordinates and attachment provenance. Production,
development, and preview deployments remain live Convex resources rather than attachment fields.

## Goals

- Let an existing GitHub vault attach an existing Convex project.
- Let an existing GitHub vault create a new Convex project and attach its production deployment.
- Store the attached Convex identity on the vault as the durable product state.
- Observe Convex dashboard/link metadata directly from Convex when it is needed.
- Queue attach/create work as a durable Workflow run so the dialog only waits for submission and the
  vault header can show provider-specific progress.
- Preserve per-resource cleanup safety through an explicit resource origin.

## Non-goals

- Do not create deploy keys in this slice.
- Do not push schema, functions, environment variables, or migrations to the selected deployment.
- Do not connect GitHub to Convex.
- Do not connect Cloudflare Workers Builds to Convex deploy keys.
- Do not delete Convex projects that were selected as existing external resources.
- Do not auto-discover or auto-attach Convex projects from fuzzy repository signals.

## State Model

`vaultConvexProjects` owns the attached Convex project identity for one vault app:

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

No internal backwards-compatibility adapter is kept for older connected-row shapes. Local/operator
data can be cleared instead of carrying old `vault.convex` or `vaultInfrastructure` state forward.

`origin` answers how this vault attached to the Convex production deployment:

- `provisioned` means Samebase created the project/deployment during an explicit create flow.
- `selected_existing` means the user chose an existing project from Convex inventory.

Cleanup ownership is derived from `origin`: `provisioned` projects can be removed by managed cleanup
flows, while `selected_existing` projects are external.

Project and deployment existence, slugs, URLs, production, development and preview deployments, and
deploy keys remain owned by Convex. Samebase reads them as a bounded live observation for the
requested vault and does not write the result into the attachment row.

## Provider Scope

The Convex provider connection owns credentials and the currently connected team. It does not own a
vault resource.

Manual Convex connection uses the connected provider team's `teamId`. If the user needs a different
team, they must reconnect or switch the Convex provider connection before starting this flow.

When a project read returns `teamSlug`, Samebase should persist it to the Convex provider connection
for later dashboard links.

## Resource Selection

Existing project connection should:

1. list visible projects for the connected team
2. show deterministic inventory rows with project id, project name, project slug, and team slug
3. re-read the selected project and its default production deployment server-side before attaching

The server must verify:

- the project belongs to the connected Convex team
- the project's default production deployment exists
- the default deployment belongs to the selected project
- the default deployment is a cloud production deployment

The existing-project picker lists every project returned by Convex's team project inventory. The
create flow still creates and attaches the default production deployment for the new project.

Project creation should:

1. validate the requested Convex project name
2. ensure no visible project in the connected team already has that name or slug
3. create the project with a production deployment
4. immediately record the created project id on the Workflow run
5. read the project and default production deployment back from Convex
6. attach the resulting deployment with `origin: "provisioned"`

If a created project cannot be attached after the provider create call, the workflow should fail
closed with the created project id retained on the run. Automatic rollback deletion is not part of
this slice because project deletion is more destructive than deleting an empty Worker; cleanup
remains available through the explicit vault delete path for provisioned resources.

## Durable Execution

Manual Convex attach/create uses `workflow_vaultProvisioning_runs` with trigger
`connect_convex_deployment`.

The run is intentionally narrow:

1. claim provider work for the vault
2. verify or create the Convex project/deployment
3. write `vaultConvexProjects`
4. attach the project to the target app
5. mark the run complete

The modal submit action should return after the Workflow is queued. The modal closes by clearing
`add-convex`, and the vault header/resource rail shows the Convex row as running, failed, or ready
from subscribed dashboard state.

A failed manual Convex run should keep the Convex row failed while offering the same connection
dialog again, so the operator can choose an existing project or create a new project without waiting
for hidden state cleanup.

## Missing Deployment Replacement

When a live Convex observation reports that the attached project or production deployment is
missing, the same connection dialog can select or create its replacement. A failed or unavailable
provider read does not authorize replacement.

The server derives a one-run replacement intent from the current attachment row. Before queuing the
Workflow and again after claiming its write lock, it reads the recorded project and deployment from
Convex and confirms that their recorded identity is missing. The Workflow then compare-and-swaps the
exact recorded attachment snapshot and patches the same `vaultConvexProjects` row with the
replacement identity. A changed attachment snapshot cancels the run instead of overwriting newer
state.

The replacement intent is Workflow input, not durable provider state. Samebase does not persist the
missing observation, duplicate the Convex resource, or delete the attachment row while a replacement
is in progress.

## Route Semantics

`/vault/<org>/<repo>?add-convex` opens the Convex project connection dialog for the selected vault
route.

The dialog closes by clearing `add-convex` while preserving the selected vault route.

## Deployment Wiring

Deployment wiring is separate from Convex attach/create. The two wiring relationships are:

- repository source to Convex functions/schema deployment
- Cloudflare Workers Builds to Convex build access through deploy keys

Attaching or creating a Convex project does not imply either wiring relationship exists. If a Worker
already has connected Builds, Samebase can later run `wire_convex_build_access` for one explicitly
selected attached project. The action mints deploy keys and writes them together with
`SAMEBASE_CONVEX_PROJECT=v1:<teamId>:<projectId>` to both Cloudflare triggers. It does not persist a
current deploy-key state or a Worker-to-project dependency row. The next dashboard read derives the
relationship from Cloudflare's live marker and variable names.
