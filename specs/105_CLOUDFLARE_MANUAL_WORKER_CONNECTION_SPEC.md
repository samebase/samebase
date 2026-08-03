# Cloudflare Manual Worker Connection

## Document Control

- Status: Accepted
- Owner: Samebase provider resources, vault dashboard
- Last updated: 2026-08-04
- Related:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/115_VAULT_RESOURCE_ATTACHMENT_MODEL_SPEC.md`
  - `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`

## Current Contract

Cloudflare Worker connection is a vault-level resource attachment. It is separate from provider
credential connection and separate from deployment configuration.

`vaultCloudflareWorkers` stores only durable attachment identity and provenance:

```ts
{
  vaultId;
  organizationId;
  accountId;
  workerName;
  workerTag;
  origin;
}
```

Convex `_creationTime` records when the attachment was created.

Worker existence, workers.dev URLs, GitHub repository connection, build triggers, root directory,
and Convex build variables are current Cloudflare observations. They are not mirrored into the
attachment.

### Existing Worker flow

`/vault/<org>/<repo>?add-cloudflare` opens one vault-level dialog.

1. The user selects a Cloudflare account.
2. Samebase reads the complete Worker inventory. If only legacy inventory is available, the scan is
   explicitly partial and cannot support a negative conclusion.
3. For each Worker, Samebase reads Workers Builds triggers and requires GitHub provider type plus an
   exact match to the vault's immutable GitHub repository ID for direct selection. A Worker with no
   active trigger is observed separately from a Worker connected to another repository.
4. A selectable Worker has one unambiguous normalized root across its active production and preview
   triggers. The root is displayed read-only.
5. Every selectable Worker starts selected because its exact repository connection has already been
   verified. The user may deselect any Worker before confirming. Samebase may also show their
   readable `SAMEBASE_CONVEX_PROJECT` evidence without persisting a relation.
6. Confirmation re-reads every selected identity, repository connection, root, and marker, then
   writes all attachments in one transaction. Any conflict rejects the whole confirmation.

When at least one Worker has no active Workers Builds triggers, the existing view offers
`Connect another Worker` instead of mixing account-wide unconnected Workers into the verified
checkbox list. The focused view asks for one Worker and its repository root, then confirms
`Connect and add`. Samebase re-reads the exact Worker identity and requires that it still has no
active triggers. It records the `selected_existing` attachment before configuring GitHub Builds,
then re-reads Cloudflare and requires the requested root. Each unconnected Worker is configured
individually because roots are per Worker and Cloudflare writes are not batch-atomic.

If Cloudflare reports an error after attachment, Samebase re-observes the Worker before it explains
what to do next. A Worker with no completed repository connection stays under `Needs attention`. A
Worker with a partial or complete connection appears under Cloudflare's observed root. The message
names the normal action for the observed state. The attachment always remains. A Worker with active
triggers for another repository is not available in this flow. Samebase never silently replaces that
connection.

The client never supplies a root as attachment authority.

### Create Worker flow

Creating a Worker may ask for a repository root because the same operation configures that root in
Cloudflare Workers Builds. Samebase creates the Worker and records its exact provider checkpoint and
`provisioned` attachment together before configuring Builds. It then writes the GitHub Builds
configuration and re-reads the resulting repository and root evidence.

If Builds configuration fails, the Worker stays attached under `Needs attention`, which preserves
cleanup ownership and lets the user retry the explicit configuration. When no live root exists, the
same Cloudflare dialog asks for the root as input to the provider write. When one unambiguous live
root exists, retry reuses that observation without asking the user. The root is never copied into
the attachment. If provider creation succeeds but its identity cannot be checkpointed, Samebase
reports the ambiguous external state and does not delete the Worker automatically.

### Identity and ownership

An exact account and Worker identity can be attached to only one vault. Idempotent confirmation for
the same vault preserves the attachment ID and only upgrades `origin` from `selected_existing` to
`provisioned` when a managed operation proves ownership.

Managed cleanup may delete only `provisioned` Workers. Removing an attachment selected as existing
never deletes the Cloudflare Worker.

### Drift and removal

A Worker root change automatically moves the row to the newly derived root group. An unavailable,
missing, or ambiguously placed Worker remains attached under `Needs attention`.

`Remove from vault` is an explicit user-intent mutation. It deletes only the unchanged local
attachment and never deletes the provider resource. Provider absence may explain the attention
state, but is not removal authority.

### Deployment configuration

Attaching a Worker does not imply that Samebase may rewrite an existing Worker. `Connect and add`
explicitly authorizes initial GitHub Builds setup only after Samebase verifies that the Worker has
no active Builds triggers. GitHub Builds repair and Convex deploy-key rotation remain explicit
operations.

When build access has no trustworthy attached target, `Use <project> for Workers Builds` names each
available destination explicitly. When a Worker's marker already names an attached project but its
keys are incomplete or its team coordinate is stale, `Repair keys for <project>` offers only that
project. A healthy attached target offers no write action.

After the user chooses the exact attached Convex project, Samebase writes the two secret deploy keys
and the readable `SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>` marker to
the production and preview triggers. That live Cloudflare configuration is the relationship.
Samebase does not persist a Worker-to-project edge.

### Operation safety

Cloudflare attachment mutations use the shared exclusion check in spec 003. Cloudflare provider
actions use the claim, expiry, no-replay, and freshness rules in spec 003.

Creating a Worker, connecting an unconnected Worker, and configuring Workers Builds affect
Cloudflare observations. Deploy-key rotation affects Convex and Cloudflare observations.

After a failed or silent provider action, Samebase gets fresh observations. The user or agent then
uses the normal action for that state:

- An uncheckpointed created Worker appears in the normal account scan. The user can attach or
  connect that existing Worker. Samebase does not adopt it automatically.
- An attached Worker with incomplete Builds configuration uses the normal Configure Workers Builds
  action.
- Incomplete Convex build access uses the normal key repair action for the observed attached
  project. Repeating this action replaces the deterministic deploy keys and writes one complete
  production and preview configuration.

## Non-Goals

- Persisting Worker root, trigger, URL, marker, or deploy-key state.
- Inferring a Worker placement from repository folders.
- Attaching Workers from a different GitHub repository.
- Automatically deleting Workers or attachments after a provider read.

## Validation

- Provider tests cover pagination beyond 100 Workers, partial fallback, zero-trigger Workers,
  different-repository Workers, provider type, exact repo identity, ambiguous roots,
  production/preview disagreement, and marker disagreement.
- Mutation tests cover atomic batches, global identity conflicts, idempotency, and origin upgrade.
- Operation tests cover the Cloudflare action mapping and the normal next action after a failed or
  silent provider action.
- Write-time tests prove that Cloudflare-only actions update only Cloudflare and deploy-key rotation
  updates both providers.
- UI tests cover vault-level routing, default multiple selection, grouping by read-only live root,
  the focused unconnected-Worker root flow, count copy, exact Convex action targets, root drift,
  rootless Builds repair, and `Needs attention`.
