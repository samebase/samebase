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

Convex project connection is a vault resource attachment. It is separate from provider credential
connection and separate from deployment configuration.

The dashboard resource rail should let a ready GitHub-connected vault:

- connect an existing Convex project from the connected Convex team
- create a new Convex project with a production deployment

Both flows attach the selected or created Convex project to `vaultConvexProjects`, keyed by app.
That row stores only the stable project coordinates and attachment provenance. Production,
development, and preview deployments remain live Convex resources rather than attachment fields.

## Goals

- Let an existing GitHub vault attach an existing Convex project.
- Let an existing GitHub vault create and attach a new Convex project.
- Store the attached Convex identity on the vault as the durable product state.
- Observe Convex dashboard/link metadata directly from Convex when it is needed.
- Keep attach/create as an explicit request whose dialog stays open until the provider operation and
  stable attachment write finish.
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

One Samebase app can attach at most one Convex project. A shared backend is represented once as its
own app rather than duplicated beneath each Worker app that consumes it.

No internal backwards-compatibility adapter is kept for older connected-row shapes. Local/operator
data can be cleared instead of carrying old `vault.convex` or `vaultInfrastructure` state forward.

`origin` answers how this vault attached to the Convex project:

- `provisioned` means Samebase created the project during an explicit create flow.
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
3. re-read the selected project server-side before attaching

The server must verify:

- the project belongs to the connected Convex team

The existing-project picker lists every project returned by Convex's team project inventory. The
create flow asks Convex to create the project with a production deployment, but the attachment
identity remains the project.

Project creation should:

1. validate the requested Convex project name
2. ensure no visible project in the connected team already has that name or slug
3. create the project with a production deployment
4. read the project back from Convex
5. attach the project with `origin: "provisioned"`

If a manual create action cannot attach the new project after the provider create call, it reports
that the provider create may have succeeded and leaves inspection or cleanup to Convex. It must not
automatically delete the project because another concurrent request may already have attached that
identity. Attaching a project selected from existing Convex inventory never deletes or otherwise
changes that project when the local attachment fails.

Managed app creation is different: its Workflow checkpoints the newly created project identity so a
retry can reuse it. The checkpoint is `{ teamId, projectId }`, matching the stable provider
identity. Samebase records the `created` checkpoint and stable `provisioned` project attachment in
one database transaction. A `creating` checkpoint is written before the provider request. If the
request may have completed but its result was not recorded, retry and cleanup stop for operator
inspection rather than adopting or deleting a same-named project.

An exact Convex project identity can be attached to only one Samebase app, even across Samebase
users. This matches the approved model where a shared backend is represented once as its own app,
not duplicated beneath every Worker that consumes it.

## Explicit Execution

Manual Convex attach/create runs as one explicit action:

1. verify or create the Convex project
2. write `vaultConvexProjects`
3. return success

The dialog remains open and disabled while the action runs. It closes by clearing `add-convex` only
after success and shows the returned error otherwise. Manual attachment does not create a
provisioning run or persist intermediate provider state.

## Missing Project Recovery

When a live Convex observation proves that the attached project no longer exists, the resource row
offers `Remove from Samebase`. The action reads Convex again and deletes only the unchanged
`vaultConvexProjects` attachment after it confirms the recorded project is still missing. It never
deletes a Convex project.

A failed or unavailable provider read does not authorize attachment removal. After removal, the
ordinary `?add-convex` flow can attach or create a project without a replacement-specific state
machine.

The active Convex provider connection must name the attachment's `teamId` before Samebase performs
the confirming read. A `404` obtained under another team is not proof that the project is missing.

If the project still exists but its default production deployment is missing, the project attachment
remains valid. Samebase reports the missing deployment and leaves repair or project deletion to
Convex.

## Route Semantics

`/vault/<org>/<repo>?add-convex` opens the Convex project connection dialog for the selected vault
route.

The dialog closes by clearing `add-convex` while preserving the selected vault route.

## Deployment Configuration

Deployment configuration is separate from Convex attach/create. The two provider configurations are:

- repository source to Convex functions/schema deployment
- Cloudflare Workers Builds to Convex build access through deploy keys

Attaching or creating a Convex project does not imply either provider configuration exists. If a
Worker already has connected Builds, Samebase can later run
`rotate_convex_deploy_keys_for_workers_builds` for one explicitly selected attached project. The
action mints deploy keys and writes them together with
`SAMEBASE_CONVEX_PROJECT=v1:<teamId>:<projectId>` to both Cloudflare triggers. It does not persist a
current deploy-key state or a Worker-to-project dependency row. The next dashboard read derives the
relationship from Cloudflare's live marker and variable names.
