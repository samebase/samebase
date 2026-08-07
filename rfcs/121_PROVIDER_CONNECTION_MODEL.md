# 121 Organization Deployment Provider Rollout

## Document Control

- Status: Accepted
- Owner: Samebase backend
- Last updated: 2026-08-07
- Source of truth: `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
- Evidence: `research/2026-08-06-provider-connection-authorization-audit.md`
- Replaces: the temporary multi-row provider model in `rfcs/120_ORGANIZATION_OWNERSHIP_ROLLOUT.md`

## Decision

During beta, one Samebase organization has at most one Convex team and one Cloudflare account. All
vaults in that organization use those two deployment destinations.

This is a current product limit. It is not part of Samebase organization identity and it is not a
permanent provider limit. The current product has no provider picker and no use case that needs
several provider destinations in one organization.

Provider destination and provider credential are separate facts:

- The destination says where the organization deploys.
- The credential lets Samebase operate that destination.
- Disconnect removes the credential and keeps the destination.
- Reconnect must prove access to the same destination.

Direct Cloudflare OAuth remains a required product connection flow. The implementation keeps the
other current credential methods. Removing a credential method needs a separate accepted decision.

There is no selected or default provider connection. Delete the temporary selected connection IDs
and the `providerConnections` table.

## Schema

### `organizations`

Add these optional fields:

```text
convexTeam?: {
  teamId: string
  teamSlug?: string
}

cloudflareAccount?: {
  accountId: string
  accountName: string
}

providerCredentialsId?: Id<"organizationProviderCredentials">
```

The nested objects prevent a display name without its stable ID. The organization creates
`providerCredentialsId` on the first provider connection and never changes it. An empty credential
document is valid and remains after Disconnect.

### `organizationProviderCredentials`

One backend-only document contains the organization's current provider credentials:

```text
convex?: {
  auth: ConvexProviderAuth
  connectedByUserId: Id<"users">
  updatedAt: number
}

cloudflare?: {
  auth: CloudflareProviderAuth
  connectedByUserId: Id<"users">
  updatedAt: number
  tokenHealth?: McpTokenHealth
  tokenRefreshLease?: {
    startedAt: number
    expiresAt: number
  }
  lastTokenRefreshAt?: number
}
```

The table has indexes on each nested `connectedByUserId`. No client accepts or returns
`providerCredentialsId`. Backend functions load it from the authorized organization.

`connectedByUserId` is credential provenance. It does not authorize use. The active organization
membership and operation permission authorize use.

### `vaults`

Every vault lifecycle variant has these required fields:

```text
convexTeamId: string
cloudflareAccountId: string
```

Every vault creation path copies both IDs from its organization in the same transaction. This
includes the existing-repository connection path. Creation fails when either organization
destination is absent. It does not require a live credential when it only records the vault.

Delete the duplicate `teamId` and `accountId` fields from `workflow_vaultProvisioning_plans`. Keep
project and Worker names, provider resource checkpoints, configuration paths, root directories,
lifecycle conditions, and times.

Keep the stable provider identities:

- `vaultConvexProjects.teamId` and `projectId`
- `vaultCloudflareWorkers.accountId`, `workerName`, and `workerTag`
- the same stable values in deletion retry snapshots

An attached resource must match its vault's `convexTeamId` or `cloudflareAccountId`.

## Allowed Provider Conditions

The data itself expresses the provider condition. Do not add a general status field.

| Destination       | Credential         | Meaning                                            |
| ----------------- | ------------------ | -------------------------------------------------- |
| absent            | absent             | Not configured                                     |
| present           | present            | Connected                                          |
| present           | absent             | Disconnected, exact reconnect required             |
| Cloudflare absent | Cloudflare present | Initial OAuth finished, account selection required |

A Convex credential without `organizations.convexTeam` is invalid. Cloudflare permits a credential
without an account only during first account selection.

## Authorization

- Any active organization member can start an authorized provider operation.
- Only an organization owner can connect, choose the first Cloudflare account, reauthorize, replace,
  disconnect, or reset a deployment destination.
- Credentials stay in backend-only functions.
- No Samebase user, including the connector, can retrieve raw credential material.
- A membership removal does not change an organization credential.

## Lifecycle

| Event                        | Exact result                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First Convex connect         | Verify the team, then set `convexTeam` and the Convex credential in one mutation.                                                                                 |
| First Cloudflare OAuth       | Store the credential. Set the account when exactly one account is available. Otherwise require owner account selection.                                           |
| Cloudflare account selection | Verify access with the current credential, then set the first `cloudflareAccount`. It cannot replace an existing account.                                         |
| Reauthorization              | Verify the retained team or account, then replace the credential, `connectedByUserId`, and `updatedAt`. A different external ID fails.                            |
| Another owner takes over     | Run same-destination reauthorization. The new credential and `connectedByUserId` replace the old values.                                                          |
| Disconnect                   | Clear the local credential and retain the destination, vaults, and provider resources. Attempt supported upstream revocation and report when it is not confirmed. |
| Destination reset            | Require no row in `vaults.by_organization`. Clear the destination and its credential. A later fresh connect can establish another destination.                    |
| Membership departure         | Keep the credential and destination.                                                                                                                              |
| Connector account deletion   | Clear only credentials whose current `connectedByUserId` is the deleting user. Keep destinations and resources. Do not block deletion for replacement.            |
| Upstream revoke or expiry    | Fail provider work closed. Keep local destinations and resource identities. An owner reconnects the same destination.                                             |

Target reset needs one indexed vault existence check. It does not scan provisioning plans, locks,
resources, or deletion runs because all of those rows belong to a vault.

## Cloudflare OAuth Account Selection

Direct Cloudflare OAuth can authorize several accounts. Samebase connects the credential first, but
the product binds the organization to one exact account.

During first setup:

1. Store the backend-only OAuth credential.
2. List the accounts that the grant can access.
3. If there is one account, store it on the organization.
4. If there are several accounts, let an owner select one.
5. If there are no accounts, do not establish a destination.

After an account exists, OAuth reconnect must prove access to that account. It cannot open account
selection or change the account.

## Running And Retried Work

- Queued work reads the immutable provider IDs from the vault.
- A provider step loads the current organization credential before it starts.
- A missing credential or destination mismatch stops the step without changing resource identity.
- A running action can keep a credential in action memory. It never persists a credential document
  ID as resource identity.
- A provider write checkpoint validates the vault and stable external destination. It does not need
  the old credential to remain after the external request finishes.
- A retry resolves the current credential again. Same-destination reconnect restores work without a
  vault or resource rewrite.
- Observation and deletion use the same vault destination checks.
- Manual provider write locks do not need connector or credential identity. The destination cannot
  change while a vault exists.

Cloudflare refresh uses one explicit `tokenRefreshLease`. Completion writes only when both the full
credential and the lease still match. Disconnect clears the credential first, so an in-progress
refresh cannot restore it. Refresh preserves `connectedByUserId` and advances `updatedAt`.

OAuth callback state stores one hash of the current provider destination and credential snapshot. It
stores no raw credential. The callback rejects a changed snapshot before it writes a new credential.

## UI

The provider page shows one Convex row and one Cloudflare row. It has no list, selected badge,
default control, or failover control.

Use these truthful conditions:

- `Not configured`
- `Connected to Convex team acme-platform`
- `Connected to Cloudflare account acme-production`
- `Disconnected. Reconnect Convex team acme-platform.`
- `Disconnected. Reconnect Cloudflare account acme-production.`
- `Select the Cloudflare account for this organization.`

Owners see Connect, Reconnect, Disconnect, and first-account selection. Members can use connected
credentials but cannot manage them.

App creation has no provider selector. It shows the one Convex team and Cloudflare account. It
blocks when a destination or credential is missing. The existing-repository flow also requires both
destinations because the resulting vault must have stable provider IDs.

## Why Not A More Flexible Model

| Model                                            | Current decision                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| One credential for each provider                 | Accepted with one durable destination for each provider.                     |
| One credential for each external team or account | Defer. It needs destination selection and per-destination lifecycle UI.      |
| Several independent credentials and failover     | Reject. There is no current failover use case.                               |
| Separate collections of destinations and grants  | Defer. Current cardinality would add joins and routing with no user benefit. |

A future several-destination design is possible because each vault and resource already stores its
stable provider IDs. Before that UI exists, an accepted decision must define the user need,
new-vault selection, credential routing, disconnect behavior, and migration.

## Clean Reset And Deployment

This is a pre-beta narrow deployment. Backward compatibility is not required.

Before the final schema deploy:

1. Delete all vaults through the current product flow.
2. Verify that vaults, attached provider resources, provisioning plans and locks, and active vault
   deletion work are empty.
3. Revoke or clear current provider credentials.
4. Clear `providerConnections`, `providerOAuthCallbackStates`, and both selected connection IDs.
5. Verify that every removed table and field is empty.

Then deploy the final schema in one change. New organization provider fields are optional, so
existing organization rows need no backfill. After deployment, reconnect both providers and create
the vaults again.

Do not run the production reset as an automatic migration. The operator must choose its time and
confirm the exact rows before the destructive step.

## Implementation Slices

1. Replace provider rows with organization destinations and the backend credential document. Adapt
   OAuth, refresh, account deletion, provider access, and focused lifecycle tests.
2. Add required provider IDs to vaults. Remove duplicate plan IDs, account-selection side effects,
   provider connection IDs, and project-team reconciliation. Add destination-match tests.
3. Apply the clean reset, deploy the narrow schema, update the provider and creation UI, and run the
   complete organization-member creation check.

## Summary

The organization stores one Convex team and one Cloudflare account. One backend-only credential
document stores the replaceable grants. Every vault stores both stable provider IDs. Disconnect
removes access but not the destinations or resources. Reconnect proves the same destinations. Direct
Cloudflare OAuth remains required. The schema has no selected connection, provider list, failover
policy, or retained-resource dependency scan.
