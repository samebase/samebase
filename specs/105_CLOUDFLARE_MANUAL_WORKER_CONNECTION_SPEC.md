# Cloudflare Manual Worker Connection

## Document Control

- Status: Accepted
- Owner: Samebase provider resources, repository dashboard
- Last updated: 2026-08-18
- Related:
  - `specs/003_REPOSITORY_INFRA_PROVISIONING_SPEC.md`
  - `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
  - `specs/115_REPOSITORY_RESOURCE_ATTACHMENT_MODEL_SPEC.md`

## Current Contract

Cloudflare Worker connection is a repository-level resource attachment. It is separate from provider
credential connection and separate from deployment configuration.

`repositoryCloudflareWorkers` stores durable attachment identity, user-approved repository
placement, and provenance:

```ts
{
  organizationId;
  repositoryId;
  accountId;
  workerName;
  workerTag;
  rootDirectory;
  origin;
}
```

Convex `_creationTime` records when the attachment was created.

`workerTag`, `workerName`, and `rootDirectory` use the identity and approved-coordinate rules in
spec 115. This spec defines how the manual connection flow first establishes those values.

`organizationId` must equal the parent repository's organization. `accountId` must equal the parent
repository's required `cloudflareAccountId`. Provider reads and writes load the organization's
current Cloudflare credential and fail closed if it is absent or cannot access that exact account.
This flow does not select or change the organization's Cloudflare account.

Worker existence, workers.dev URLs, GitHub repository connection, build triggers, build-token UUIDs,
build status, domains, and Convex build variables remain current Cloudflare observations. Samebase
fetches each build-token name from Cloudflare and does not store it.

### Existing Worker flow

`/repo/<owner>/<repository>?add-cloudflare` opens one repository-level dialog.

1. Samebase loads the repository's `cloudflareAccountId` and the organization's current credential.
2. Samebase reads the complete Worker inventory for that account. If only legacy inventory is
   available, the scan is explicitly partial and cannot support a negative conclusion.
3. For each Worker, Samebase reads Workers Builds triggers and requires GitHub provider type plus an
   exact match to the repository's immutable GitHub repository ID for direct selection. A Worker
   with no active trigger is observed separately from a Worker connected to another repository.
4. A selectable Worker has one unambiguous normalized root across its active production and preview
   triggers. The root is displayed read-only and becomes the approved attachment root.
5. Every selectable Worker starts selected because its exact repository connection has already been
   verified. The user may deselect any Worker before confirming. Samebase may also show their
   readable `SAMEBASE_CONVEX_PROJECT` evidence without persisting a relation.
6. Confirmation re-reads every selected identity, repository connection, root, and marker, then
   writes every attachment with its verified name and root in one transaction. Any conflict rejects
   the whole confirmation.

When at least one Worker has no active Workers Builds triggers, the existing view offers
`Connect another Worker` instead of mixing account-wide unconnected Workers into the verified
checkbox list. The focused view asks for one Worker and its repository root, then confirms
`Connect and add`. Samebase re-reads the exact Worker identity and requires that it still has no
active triggers. It records the `selected_existing` attachment with the user-approved root before
configuring GitHub Builds, then re-reads Cloudflare and requires the requested root. Each
unconnected Worker is configured individually because roots are per Worker and Cloudflare writes are
not batch-atomic.

`Connect and add` also requires one Workers Builds token selected from the exact repository account.
Samebase re-lists the account records before the write and applies the selected UUID to both
triggers. After both trigger writes succeed, that UUID becomes the organization account's last-used
Builds token.

If Cloudflare reports an error after attachment, Samebase re-observes the Worker before it explains
what to do next. The Worker stays under its stored root and can show `Needs attention`. The message
names the normal action for the observed state. The attachment always remains. A Worker with active
triggers for another repository is not available in this flow. Samebase never silently replaces that
connection.

For an already configured Worker, a client value never supplies attachment authority. Samebase
stores only the root from its fresh verified provider read. For a new or unconnected Worker, the
explicit root selected for the Builds write is the approved attachment coordinate. A provider
re-read then checks that Cloudflare accepted the same root.

### Create Worker flow

Creating a Worker asks for a repository root because the same operation configures that root in
Cloudflare Workers Builds. Samebase creates the Worker and records its exact provider checkpoint,
approved root, and `provisioned` attachment together before configuring Builds. It then writes the
GitHub Builds configuration and re-reads the resulting repository and root evidence.

The dialog blocks a name that appears in the current account Worker list. If the create request
loses a name race, the dialog shows the same conflict in the Worker name field and gives a numbered
name suggestion.

If Samebase changes the entered text to meet Cloudflare Worker name rules, the dialog shows the
final name as information and keeps Create Worker available. The create request uses that final
name. Selecting the displayed name replaces the entered text and removes the information. The dialog
blocks only when no valid Worker name can be produced or the final name conflicts.

Create Worker configures Builds without requiring or changing a Convex attachment. It changes only
Cloudflare freshness. A tokenless managed app uses this same action after the user completes
first-time token setup. The separate `Use <project> for Workers Builds` action then installs the
Convex deploy keys for the selected attached project and starts the production build.

The create flow requires the same visible token selection. A current Worker's observed token has
priority during repair. Otherwise, the client selects the organization account's last-used token
when it remains in the current list, then the first record. Samebase orders the account token list
by name from Z to A without case sensitivity, with UUID as the stable tie-breaker. This keeps
Cloudflare's default timestamped names in newest-name-first order without parsing the timestamp. A
later refresh does not replace an existing or user-selected UUID. Provider writes never infer a
token from a name, list position, or another Worker's current binding. They validate the exact
selected UUID again. A successful write of both triggers updates the organization default. A failed
write does not update it.

If Builds configuration fails, the Worker stays attached under its stored root with
`Needs attention`. This preserves cleanup ownership and lets the user retry the explicit
configuration with the approved root. If provider creation succeeds but its identity cannot be
checkpointed, Samebase reports the ambiguous external state and does not delete the Worker
automatically.

### Identity and ownership

An exact account and Worker identity can be attached to only one repository. Idempotent confirmation
for the same repository preserves the attachment ID and only upgrades `origin` from
`selected_existing` to `provisioned` when a managed operation proves ownership.

The attachment's organization and account never change. A Cloudflare account change is an
organization destination reset, which is unavailable while any repository remains in that
organization.

Managed cleanup may delete only `provisioned` Workers. Removing an attachment selected as existing
never deletes the Cloudflare Worker.

### Drift and removal

Spec 115 defines Worker name and root drift and explicit updates.

An unavailable or missing Worker remains attached under its stored root with `Needs attention`.
Neither a warning nor a provider read authorizes a stored coordinate change.

`Remove from repository` is an explicit user-intent mutation. It deletes only the unchanged local
attachment and never deletes the provider resource. Provider absence may explain the attention
state, but is not removal authority.

### Deployment configuration

Attaching a Worker does not imply that Samebase may rewrite an existing Worker. `Connect and add`
explicitly authorizes initial GitHub Builds setup only after Samebase verifies that the Worker has
no active Builds triggers. GitHub Builds repair and standalone Convex deploy-key rotation remain
explicit operations.

`Configure Workers Builds` uses the attachment's saved approved root. It does not replace that input
with a different live root. The member must use `Update root` first when the current provider root
is the intended coordinate.

Repository settings shows the current token name when both triggers use the same listed UUID. It
reports when the two trigger UUIDs differ or a bound UUID is no longer in Cloudflare's list. These
are observations, not token-health claims. `Change API token` opens the same explicit configuration
flow. Confirmation writes the chosen UUID to both triggers and starts a production build.

When build access has no trustworthy attached target, `Use <project> for Workers Builds` names each
available destination explicitly. When a Worker's marker already names an attached project but its
keys are incomplete or its team coordinate is stale, `Repair keys for <project>` offers only that
project. A healthy attached target offers no write action.

After the user chooses the exact attached Convex project, Samebase writes one secret deploy key to
each trigger. It writes the readable
`SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>` marker only to the
production trigger. That live Cloudflare configuration is the relationship. Samebase does not
persist a Worker-to-project edge.

### Operation safety

Cloudflare attachment mutations use the shared exclusion check in spec 003. Cloudflare provider
actions use the claim, expiry, no-replay, and freshness rules in spec 003.

Creating a Worker, connecting an unconnected Worker, and configuring Workers Builds affect only
Cloudflare observations. Deploy-key rotation affects Convex and Cloudflare observations.

After a failed or silent provider action, Samebase gets fresh observations. The user or agent then
uses the normal action for that state:

- An uncheckpointed created Worker appears in the normal account scan. The user can attach or
  connect that existing Worker. Samebase does not adopt it automatically.
- An attached Worker with incomplete Builds configuration uses the normal Configure Workers Builds
  action.
- A Worker whose build-token record is missing or whose triggers disagree uses the normal Change API
  token action.
- Incomplete Convex build access uses the normal key repair action for the observed attached
  project. Repeating this action replaces the deterministic deploy keys and writes one complete
  production and preview configuration.

## Non-Goals

- Automatically accepting a provider name or root change.
- Persisting trigger, URL, domain, build status, build-token name, marker, or deploy-key state.
- Inferring a Worker placement from repository folders.
- Attaching Workers from a different GitHub repository.
- Selecting or changing a Cloudflare account in a repository flow.
- Automatically deleting Workers or attachments after a provider read.

## Validation

- Provider tests cover pagination beyond 100 Workers, partial fallback, zero-trigger Workers,
  different-repository Workers, provider type, exact GitHub repository identity, exact repository
  account, missing or mismatched organization credentials, ambiguous roots, production/preview
  disagreement, and marker disagreement.
- Mutation tests cover organization and account destination checks, atomic batches, global identity
  conflicts, idempotency, origin upgrade, stored roots, and stable `workerTag` resolution after a
  provider rename.
- Operation tests cover the Cloudflare action mapping and the normal next action after a failed or
  silent provider action.
- Write-time tests prove that Cloudflare-only actions update only Cloudflare and deploy-key rotation
  updates both providers.
- UI tests cover repository-level routing, default multiple selection, grouping by stored root, the
  focused unconnected-Worker root flow, count copy, exact Convex action targets, stored-root Builds
  repair, and `Needs attention`.
- UI tests cover token loading, empty and failed lists, visible default and changed selections, live
  token names, missing records, trigger disagreement, and token change.
