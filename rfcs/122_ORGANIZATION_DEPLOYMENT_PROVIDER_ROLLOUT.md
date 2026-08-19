# 122 Organization Deployment Provider Rollout

## Document Control

- Status: Accepted
- Owner: Samebase backend
- Last updated: 2026-08-18
- Source of truth: `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
- Evidence: `research/2026-08-06-provider-connection-authorization-audit.md`
- Replaces: the temporary multi-row provider model in `rfcs/120_ORGANIZATION_OWNERSHIP_ROLLOUT.md`
- Supersedes: `archive/026_PROVIDER_CONNECTIONS_SPEC.md`

## Decision

During beta, one Samebase organization has at most one Convex team and one Cloudflare account. All
provider resources in that organization use its configured destination for that provider.

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
```

`teamSlug` is optional because Convex token details does not return it and an empty team has no
project response. Samebase stores it when a project response becomes available. Make it required
when Convex provides the slug through token details or a team lookup. Cloudflare account discovery
requires a non-empty provider-supplied `accountName`.

The nested objects prevent a display name without its stable ID. An organization stores no
credential row ID. The backend finds credentials through the credential row's required
`organizationId`.

### `organizationProviderCredentials`

One backend-only document contains the organization's current provider credentials:

```text
organizationId: Id<"organizations">

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

`organizationId` is required and immutable. Every document has at least one credential slot. One
organization has zero or one `organizationProviderCredentials` document, and no two documents can
name the same organization. The first provider connection creates the document. Disconnect deletes
the document when it clears the last credential slot. The table has `by_organization`,
`by_convex_connected_by_user`, and `by_cloudflare_connected_by_user` indexes. Backend functions
query `by_organization` with a unique result after they authorize the organization. Provider writes
preserve the zero-or-one-row invariant. No client accepts or returns the credential document ID.

`connectedByUserId` is credential provenance. It does not authorize use. The active organization
membership and operation permission authorize use.

### `vaults`

Samebase-managed vault lifecycle variants have these required fields. Existing-repository variants
make each field optional:

```text
convexTeamId: string
cloudflareAccountId: string
```

Samebase-managed creation copies both IDs from its organization and fails when either destination is
absent. Existing-repository connection requires only GitHub and copies each destination that is
configured. When a provider is connected later, the credential transaction fills that provider's
missing ID in the organization's existing vaults.

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

| Destination | Credential | Meaning                                |
| ----------- | ---------- | -------------------------------------- |
| absent      | absent     | Not configured                         |
| present     | present    | Connected                              |
| present     | absent     | Disconnected, exact reconnect required |
| absent      | present    | Invalid                                |

A Convex credential without `organizations.convexTeam` is invalid. A Cloudflare credential without
`organizations.cloudflareAccount` is also invalid.

## Authorization

- Any active organization member can start an authorized provider operation.
- Only an organization owner can connect, reauthorize, replace, disconnect, or reset a deployment
  destination.
- Credentials stay in backend-only functions.
- No Samebase user, including the connector, can retrieve raw credential material.
- A membership removal does not change an organization credential.

## Lifecycle

| Event                      | Exact result                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First Convex connect       | Verify the team, then set `convexTeam` and the Convex credential in one mutation.                                                                                   |
| First Cloudflare connect   | Require exactly one accessible account, then set `cloudflareAccount` and the credential in one mutation. Zero or several accounts fail without storing either fact. |
| Reauthorization            | Require exactly the retained team or account, then replace the credential, `connectedByUserId`, and `updatedAt`. A different external ID fails.                     |
| Another owner takes over   | Run same-destination reauthorization. The new credential and `connectedByUserId` replace the old values.                                                            |
| Disconnect                 | Clear only the local credential. Retain the destination, vaults, and provider resources. Tell the owner how to revoke upstream access manually.                     |
| Destination reset          | Require the credential to be disconnected and no row in `vaults.by_organization`. Clear only the destination. A later fresh connect can establish another.          |
| Membership departure       | Keep the credential and destination.                                                                                                                                |
| Connector account deletion | Clear only credentials whose current `connectedByUserId` is the deleting user. Keep destinations and resources. Do not block deletion for replacement.              |
| Upstream revoke or expiry  | Fail provider work closed. Keep local destinations and resource identities. An owner reconnects the same destination.                                               |

Destination reset requires Disconnect first so provider work cannot start during the reset. Reset
then needs one indexed vault existence check. It does not scan provisioning plans, locks, resources,
or deletion runs because all of those rows belong to a vault. Manual upstream revocation is
independent from the local reset. The current slice adds no reset endpoint or UI because there is no
present target-change use case.

## Cloudflare Account Authorization

Cloudflare account scope is selected in Cloudflare during OAuth authorization or user API token
creation. Samebase accepts a Cloudflare credential only when it exposes exactly one account. It does
not add a second account picker.

During first setup:

1. Exchange or verify the credential in a backend-only function and list its accessible accounts.
2. If there is exactly one account, store the credential and account in one mutation.
3. If there are no accounts or several accounts, store neither the credential nor a destination.
   Tell the owner to authorize or create a credential for one account only.

After an account exists, OAuth reconnect or API token replacement must expose exactly that one
account. A credential that also exposes another account fails, even if it can access the retained
account. It cannot change the destination.

## Running And Retried Work

- Queued work reads the immutable provider IDs from the vault.
- A provider step loads the current organization credential before it starts.
- A missing credential or destination mismatch stops the step without changing resource identity.
- A running action can keep a credential in action memory. It never persists a credential document
  ID as resource identity.
- A provider write checkpoint validates the vault and stable external destination. It does not need
  the old credential to remain after the external request finishes.
- A retry resolves the current management credential again. Same-destination reconnect restores
  management access without a vault or resource rewrite. A Cloudflare Worker whose separate Workers
  Builds token stopped working still requires an explicit token choice and trigger update.
- Observation and deletion use the same vault destination checks.
- Manual provider write locks do not need connector or credential identity. The destination cannot
  change while a vault exists.

Cloudflare refresh uses one explicit `tokenRefreshLease`. Completion writes only when both the full
credential and the lease still match. Disconnect clears the credential first, so an in-progress
refresh cannot restore it. Claim requires a current member. After Cloudflare can rotate the token,
the exact lease authorizes completion even if that member leaves. Refresh preserves
`connectedByUserId` and advances `updatedAt`.

OAuth callback state stores one hash of the current provider destination and credential snapshot. It
stores no raw credential. The final credential mutation verifies the exact unexpired callback row,
deletes it, and writes the credential atomically. It rejects a reused state or changed snapshot. If
Cloudflare exchanges a code but Samebase cannot store the result, Samebase does not revoke the grant
automatically. Cloudflare can return a grant that is also current for another connection, so
automatic cleanup could revoke valid access. The owner manages upstream access in Cloudflare
Connected Applications.

## UI

`/org/<owner>/providers` shows one Convex row and one Cloudflare row for the route organization. It
has no list, owner picker, selected badge, default control, or failover control.

Use these truthful conditions:

- `Not configured`
- `Connected to Convex team acme-platform`
- `Connected to Cloudflare account acme-production`
- `Disconnected. Reconnect Convex team acme-platform.`
- `Disconnected. Reconnect Cloudflare account acme-production.`

Owners see Connect, Reconnect, and Disconnect. Members can use connected credentials but cannot
manage them. After Disconnect, the page confirms that Samebase removed its local credential and
tells the owner to revoke upstream access manually if needed.

`/org/<owner>/new-app` has no provider selector. It shows the one Convex team and Cloudflare
account. It blocks when a destination or credential is missing. `/org/<owner>/connect-repo` requires
only the GitHub connection. Convex and Cloudflare can be connected and attached later.

## Why Not A More Flexible Model

| Model                                            | Current decision                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| One credential for each provider                 | Accepted with one durable destination for each provider.                     |
| One credential for each external team or account | Defer. It needs destination selection and per-destination lifecycle UI.      |
| Several independent credentials and failover     | Reject. There is no current failover use case.                               |
| Separate collections of destinations and grants  | Defer. Current cardinality would add joins and routing with no user benefit. |

A future several-destination design is possible because each provider-backed vault and resource
stores its stable provider ID. Before that UI exists, an accepted decision must define the user
need, new-vault selection, credential routing, disconnect behavior, and migration.

## Clean Reset And Deployment

This is a pre-beta narrow deployment. Backward compatibility is not required.

Before the final schema deploy:

1. Confirm the exact Convex deployment that will receive the schema.
2. If the organization-scoped folder schema from Spec 121 is not on that deployment, delete legacy
   `ui_vaultFolderAssignments` rows first and legacy `ui_vaultFolders` rows second. Confirm that no
   retained folder or assignment row lacks `organizationId`.
3. While the current provider credentials still work, delete all vaults through the product.
4. Confirm that `vaults`, `vaultConvexProjects`, `vaultCloudflareWorkers`,
   `workflow_vaultProvisioning_plans`, `workflow_vaultProvisioning_writeLocks`, active
   `workflow_vaultDeletion_runs`, and `ui_vaultFolderAssignments` for removed vaults are empty.
5. Record the manual Convex and Cloudflare revocation steps. Do not call an upstream revocation
   endpoint as part of the reset.
6. Clear `providerConnections`, `providerOAuthCallbackStates`,
   `organizations.selectedConvexProviderConnectionId`, and
   `organizations.selectedCloudflareProviderConnectionId`.
7. Deploy the final schema.
8. Reconnect Convex and Cloudflare, then recreate the vaults.

New organization provider fields are optional, so existing organization rows need no backfill.
Preserve organizations, memberships, billing rows, and valid organization-scoped empty folders. The
folder gate and the provider reset can use one maintenance window, but they are independent checks.

Do not run the production reset as an automatic migration. The operator must choose its time and
confirm the exact rows before the destructive step.

## Implementation Slices

1. Replace provider rows with organization destinations and the backend credential document. Adapt
   OAuth, refresh, account deletion, provider access, and focused lifecycle tests.
2. Add required provider IDs to managed vaults and optional provider IDs to existing-repository
   vaults. Remove duplicate plan IDs, account-selection side effects, provider connection IDs, and
   project-team reconciliation. Add destination-match tests.
3. Apply the clean reset, deploy the narrow schema, update the provider and creation UI, and run the
   complete organization-member creation check.

## Summary

The organization stores one Convex team and one Cloudflare account. One backend-only credential
document stores the replaceable grants. Managed vaults store both stable provider IDs.
Existing-repository vaults store a provider ID when that provider is configured. Disconnect removes
access but not destinations or resources. Reconnect proves the same destinations. Direct Cloudflare
OAuth remains required. The schema has no selected connection, provider list, failover policy, or
retained-resource dependency scan.
