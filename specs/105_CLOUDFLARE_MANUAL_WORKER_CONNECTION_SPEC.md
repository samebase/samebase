# Cloudflare Manual Worker Connection

## Document Control

- Status: Accepted
- Owner: Samebase provider resources, vault dashboard
- Last updated: 2026-07-21
- Related:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/115_VAULT_RESOURCE_ATTACHMENT_MODEL_SPEC.md`

## Current Contract

Cloudflare Worker connection is a vault-level resource attachment. It is separate from provider
credential connection and separate from deployment configuration.

`vaultCloudflareWorkers` stores only durable attachment identity and provenance:

```ts
{
  vaultId;
  userId;
  accountId;
  workerName;
  workerTag;
  origin;
  createdAt;
}
```

Worker existence, workers.dev URLs, GitHub repository connection, build triggers, root directory,
and Convex build variables are current Cloudflare observations. They are not mirrored into the
attachment.

### Existing Worker flow

`/vault/<org>/<repo>?add-cloudflare` opens one vault-level dialog.

1. The user selects a Cloudflare account.
2. Samebase reads the complete Worker inventory. If only legacy inventory is available, the scan is
   explicitly partial and cannot support a negative conclusion.
3. For each Worker, Samebase reads Workers Builds triggers and requires GitHub provider type plus an
   exact match to the vault's immutable GitHub repository ID.
4. A selectable Worker has one unambiguous normalized root across its active production and preview
   triggers. The root is displayed read-only.
5. The user may select several Workers. Samebase may also show their readable
   `SAMEBASE_CONVEX_PROJECT` evidence without persisting a relation.
6. Confirmation re-reads every selected identity, repository connection, root, and marker, then
   writes all attachments in one transaction. Any conflict rejects the whole confirmation.

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

Attaching a Worker does not imply that Samebase may rewrite an existing Worker. GitHub Builds setup
and Convex deploy-key rotation remain explicit operations.

When the user selects an attached Convex project for build access, Samebase writes the two secret
deploy keys and the readable
`SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>` marker to the production
and preview triggers. That live Cloudflare configuration is the relationship. Samebase does not
persist a Worker-to-project edge.

## Non-Goals

- Persisting Worker root, trigger, URL, marker, or deploy-key state.
- Inferring a Worker placement from repository folders.
- Attaching Workers from a different GitHub repository.
- Automatically deleting Workers or attachments after a provider read.

## Validation

- Provider tests cover pagination beyond 100 Workers, partial fallback, provider type, exact repo
  identity, ambiguous roots, production/preview disagreement, and marker disagreement.
- Mutation tests cover atomic batches, global identity conflicts, idempotency, and origin upgrade.
- UI tests cover vault-level routing, multiple selection, grouping by read-only live root, count
  copy, root drift, rootless Builds repair, and `Needs attention`.
