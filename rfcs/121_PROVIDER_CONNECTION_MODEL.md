# 121 Provider Connection Model

## Document Control

- Status: Proposed
- Owner: Samebase backend
- Last updated: 2026-08-06
- Accepted organization contract: `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
- Evidence: `research/2026-08-06-provider-connection-authorization-audit.md`
- Replaces after approval: the temporary multi-row decision recorded in
  `rfcs/120_ORGANIZATION_OWNERSHIP_ROLLOUT.md`

## Decision Requested

Use model A now:

- One Samebase organization can have zero or one Convex connection.
- One Samebase organization can have zero or one Cloudflare connection.
- A connection row binds one external deployment target to the current replaceable credential for
  that target.
- The Convex target is one `teamId`.
- The Cloudflare target is one `accountId`.
- Convex and Cloudflare both use direct provider OAuth. Keeping the Cloudflare OAuth connection flow
  is a product invariant.
- All vaults in the organization use these same two targets.
- There is no selected provider connection. Remove both selected connection fields from
  `organizations`.
- Existing resources keep their stable external identities. A credential replacement for the same
  target does not rewrite a resource row.

This one-target limit is a beta product rule. It does not follow from the accepted organization
identity model, and it is not a permanent claim about either provider. The present product and UI
already expect one Convex team and one Cloudflare account for an organization, so the database
should make that current limit explicit.

The limit is on the provider target, not on resources. One connected Convex team can contain a
different Convex project for each vault. One connected Cloudflare account can contain a different
Worker for each vault.

This is one connection for the organization. It is not one connection for each member. Any member
can start an authorized provider operation. Only an organization owner can establish or change the
connection.

## Why This Model Fits The Product Now

The present use case is the shared deployment account:

1. An organization owner connects Convex and Cloudflare once through provider OAuth.
2. Another Samebase organization member creates or operates an app.
3. Samebase checks that member's organization access.
4. A backend-only function uses the organization credential.
5. The member never receives the raw provider credential.

The product has no current beta flow that deploys one organization across several Convex teams or
several Cloudflare accounts. The current UI also has no multi-connection management. More rows add
hidden credentials, target routing, default selection, disconnect choices, and failover rules that
do not support a current user action.

Cloudflare gives a provider-specific reason for its limit. Cloudflare says that a GitHub account
should point to only one Cloudflare account and recommends limiting the Cloudflare GitHub App to the
repositories that it needs. Each Samebase organization already maps to one stable GitHub repository
owner, and Samebase uses Cloudflare Workers Builds for repositories under that owner. Binding the
organization to one Cloudflare `accountId` follows that recommendation. See
[Cloudflare GitHub organizational access](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/#organizational-access).

This Cloudflare statement is a security recommendation, not a documented platform constraint. It
supports the beta choice but does not make the Cloudflare account part of Samebase organization
identity. Cloudflare can still host Git repositories from several owners in one account.

Convex has no equivalent GitHub relationship. One Convex `teamId` is a Samebase beta limit based on
the present product flow and UI. It is not a Convex requirement and it is not derived from the
GitHub owner model.

## Product Mental Model

A provider connection is both of these facts in one row:

1. The organization's one external deployment target for that provider.
2. The current credential grant that Samebase can use for that target.

The target is durable while provider resources depend on it. The credential is replaceable.

A Cloudflare OAuth grant can permit access to more than one Cloudflare account. Samebase still binds
the connection to one exact `accountId`. The grant reach does not become product routing.

The one-target rule can change after beta without redefining a Samebase organization. Stable vault
resource rows already retain `teamId` or `accountId`, so a later multi-target model can route by
those external IDs. That future model still needs an accepted target-selection and lifecycle design.

This does not mean that the target and credential are the same concept. They have different
lifecycles. They stay in one row because the product permits one target and one current credential.
A split into two tables would create a one-to-one join with no current benefit.

## Exact Answers

| Question                                                       | Proposed answer                                                                                                                                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is a provider connection?                                 | One external team or account plus the current credential grant for it.                                                                                                             |
| How many connections can one organization have?                | At most one Convex row and at most one Cloudflare row.                                                                                                                             |
| Is selected durable?                                           | No. It is a temporary UI and storage workaround. Remove it.                                                                                                                        |
| What if one Cloudflare credential can access several accounts? | The owner connects one exact account. Samebase does not treat all visible accounts as the organization connection.                                                                 |
| Which Cloudflare credential method does Samebase use?          | Direct Cloudflare OAuth. This is a product invariant.                                                                                                                              |
| Can one organization deploy to several teams or accounts?      | No during beta. All retained targets for one provider must agree. This is a product limit, not organization identity.                                                              |
| Does a vault bind to a provider target?                        | Yes. Plans and resource rows keep stable `teamId` or `accountId` values for future writes and retries.                                                                             |
| What happens when the credential changes?                      | If the external target is unchanged, existing resources continue without row rewrites.                                                                                             |
| What happens when the provider target changes?                 | The change is blocked while retained resources, plans, or retry state depend on the old target.                                                                                    |
| What does Disconnect do?                                       | It removes Samebase access and keeps provider resources. It tells an authorized provider actor how to remove the upstream grant.                                                   |
| Can a connection survive connector departure?                  | It survives a Samebase role change or Samebase membership removal. It does not survive deletion of the connector's Samebase account unless another owner first replaces the grant. |
| What does account deletion do?                                 | It does not block for provider takeover. It removes rows whose current `connectedByUserId` is the deleting user. The organization can have a temporary deployment outage.          |
| Who can manage a connection?                                   | Only an organization owner can connect, reauthorize, replace, change the target, or disconnect.                                                                                    |
| Who can use a connection?                                      | Any active organization member can start an operation that the product authorizes.                                                                                                 |
| What audit data is useful now?                                 | Target, `connectedByUserId`, grant time, and the initiating Samebase user for modifying operations.                                                                                |
| What is required before multi-connection UI?                   | An accepted use case, a target and grant model, explicit routing, lifecycle rules, audit rules, and route-level UI tests.                                                          |

## Provider Credential Methods

### Convex

Use a team-scoped OAuth Application Token for the product connection.

- The OAuth flow selects one team.
- `/token_details` supplies the `teamId`.
- A reconnect must return the current row's `teamId`.
- The token stays in backend-only functions.
- The token continues to use the external permissions of the Convex member who authorized it.

Do not accept a personal access token. Remove the normal customer UI for a manual Convex team token.
A development seed can use a development-only setup path, but it must not create a second customer
credential model.

Do not add a service-account flow or deployment-key connection now. Convex does not document a
team-owned service principal for project creation. A deployment key is too narrow to create new
projects.

Production use has an external launch condition. Samebase must get written Convex confirmation for
cross-member initiation and production use of the Beta Platform and Management APIs.

### Cloudflare

Use direct Cloudflare Authorization Code OAuth. Keeping this flow is a product invariant. Samebase
did not adopt Cloudflare before Cloudflare offered OAuth, because a manual provider-token setup is
not an acceptable primary connection experience.

Request only the scopes required by current operations:

- `workers-scripts.read`
- `workers-scripts.write`
- `workers-ci.read`
- `workers-ci.write`
- `account-settings.read`
- `offline_access`, so Samebase receives a refresh token

The backend keeps the OAuth client secret, access token, and refresh token. It never returns these
values to a Samebase user.

The Cloudflare authorization can cover one account, several accounts, or all accounts. Samebase
still connects one exact account:

- If the grant exposes one account, use it.
- If the grant exposes several accounts during a new connection, require the owner to choose one.
- If retained resources already require an `accountId`, require the grant to include that account
  and keep it as the target.
- Never route an operation to another visible account automatically.

The OAuth grant acts on behalf of the Cloudflare user who authorized it. A Cloudflare membership
change, role change, or grant revocation can stop organization operations. This is an accepted cost.
Another Samebase owner can reauthorize through a Cloudflare user who can access the same account.

Remove generic `api_key` and `mcp_oauth` from the Cloudflare product connection model. Do not add an
account API token as a second customer connection method now. Account API tokens have better
connector-departure behavior, but they do not satisfy the required OAuth setup experience. MCP OAuth
is a transport-specific credential and does not add a present product capability.

Broad commercial use has an external launch condition. Samebase must get written Cloudflare
confirmation for member-started actions when a Samebase member is not a Cloudflare account member.

## Proposed Schema

### `providerConnections`

Keep one table with a discriminated union.

Common fields:

| Field                | Rule                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `organizationId`     | Required. The organization owns the connection.                                                                                     |
| `kind`               | Required. Only `convex` or `cloudflare`. Put this discriminant first in each variant.                                               |
| `connectedByUserId`  | Required. The Samebase owner who established the current grant. This is provenance and lifecycle data, not operation authorization. |
| `createdAt`          | Required. Time when this target connection row was first created.                                                                   |
| `grantEstablishedAt` | Required. Time when an owner installed the current grant.                                                                           |
| `grantGeneration`    | Required positive integer. Starts at 1 and increases by 1 for each credential replacement.                                          |

Convex variant:

| Field      | Rule                                                  |
| ---------- | ----------------------------------------------------- |
| `auth`     | Exactly `{ method: "oauth", credential: string }`.    |
| `teamId`   | Required stable external target.                      |
| `teamSlug` | Optional display metadata. It never selects a target. |

Cloudflare variant:

| Field                   | Rule                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `auth`                  | Exactly `{ method: "oauth", credential: string, refreshCredential: string, credentialExpiresAt: number }`. |
| `accountId`             | Required stable external target.                                                                           |
| `accountName`           | Required display metadata. It never selects a target or proves grant access.                               |
| `tokenRefreshStartedAt` | Optional short-lived refresh lease. It is operational control, not connection identity.                    |
| `lastTokenRefreshAt`    | Optional refresh-throttle time. It is operational control, not connection identity.                        |

Remove the MCP-specific `tokenHealth` field with the `mcp_oauth` path. Derive token expiry from
`auth.credentialExpiresAt`. Use a live access check when the UI or an operation needs current
provider access status.

Indexes:

- `by_organization_and_kind` on `organizationId`, `kind`
- `by_connected_by_user` on `connectedByUserId`

All writes query `by_organization_and_kind` with `.unique()`. The same mutation creates or updates
the one row. Convex has no database unique constraint for this table shape, so write functions and
tests enforce the invariant transactionally.

Delete `by_organization_and_kind_and_team_id`. Resource resolution loads the one organization row
and compares its target ID. Delete `by_kind_method` unless a concrete operational query still uses
it after implementation.

### `organizations`

Delete:

- `selectedConvexProviderConnectionId`
- `selectedCloudflareProviderConnectionId`

The absence of a `providerConnections` row means disconnected. The presence of one row means that
the provider is connected to the target in that row.

### `providerOAuthCallbackStates`

This is short-lived OAuth control state for both providers, not resource identity. Use an explicit
intent:

- `connect`, when no row existed at OAuth start
- `replace`, with the transient row ID, expected target ID, and expected `grantGeneration`

A connect callback must still find no row. A replace callback must still find the row, target, and
grant generation from OAuth start. It must not overwrite a newer connection after a stale callback.

For a new Cloudflare connection, the callback can expose several authorized accounts. Keep the
pending OAuth credentials only in backend-only, short-lived setup state until the owner chooses one
account. Return only account IDs and names to the setup UI. Create `providerConnections` only after
the exact `accountId` is selected and verified. Delete expired or completed setup state and its
pending credentials.

### Stable Resource And Retry Tables

Keep the accepted design:

- `vaultConvexProjects` keeps `organizationId`, `teamId`, and `projectId`.
- `vaultCloudflareWorkers` keeps `organizationId`, `accountId`, `workerName`, and `workerTag`.
- `workflow_vaultProvisioning_plans` keeps stable target IDs and resource checkpoints.
- `workflow_vaultDeletion_runs` keeps stable external delete targets.
- None of these rows stores `providerConnections._id`.

### `workflow_vaultProvisioning_writeLocks`

Do not add a connection ID.

Add `userId` to the manual lock owner. The managed owner already points to a run with `userId`.
Actor identity supports account-deletion coordination and Samebase audit. A connection ID would make
valid credential replacement harder and would turn a replaceable credential row into retained
operation identity.

## Cross-Table Invariants

1. One organization has zero or one row for each provider kind.
2. A connected Cloudflare row always has an `accountId`. There is no connected
   `defaultAccount.state = "not_selected"` state.
3. All retained Convex targets in one organization have one `teamId`.
4. All retained Cloudflare targets in one organization have one `accountId`.
5. If a provider connection exists, its target matches every retained target for that provider in
   the organization.
6. A credential replacement cannot change `teamId` or `accountId`.
7. A target change is permitted only when the organization has no retained dependency for the old
   target and no active provider write for that provider.
8. A display name or slug change never changes target identity.
9. Each credential replacement increments `grantGeneration` in the same transaction that installs
   the new secret.
10. A Cloudflare token refresh does not change `accountId`, `connectedByUserId`,
    `grantEstablishedAt`, or `grantGeneration`.
11. A Cloudflare grant can reach more accounts than `accountId`, but Samebase uses it only for the
    stored `accountId`.
12. A raw credential is never returned through a public query, action result, log, test fixture,
    screenshot, or audit row.
13. Current organization membership authorizes use. `connectedByUserId` does not authorize use.

Retained target dependencies include:

- `vaultConvexProjects` or `vaultCloudflareWorkers`
- a retained `workflow_vaultProvisioning_plans` target
- a queued, running, or retryable provider-deletion target
- an active provider write lock whose vault uses the target

If current disposable data has more than one retained target for one organization and provider, do
not add compatibility routing. Reset that disposable organization data.

## New Resource Selection

New resources do not select a provider connection.

1. Load the one row for `organizationId` and `kind`.
2. Verify current organization membership for the initiating user.
3. Verify the credential can access the row target.
4. Put the target `teamId` or `accountId` in the provisioning plan.
5. Use that same target for provider calls and stable resource checkpoints.

All organization vaults therefore use one Convex team and one Cloudflare account. Each vault can
still have its own Convex project and Cloudflare Worker within those targets. A new app page has no
provider-connection selector.

## Existing Resource Resolution

Use one symmetrical rule for both providers:

1. Read the resource's stable external target.
2. Load the organization's one current connection for that provider.
3. Require an exact `teamId` or `accountId` match.
4. Resolve the current secret.
5. Make the provider request.

Do not search hidden rows. Do not use a Cloudflare credential against another account only because
the credential can see that account.

A replacement credential for the same target restores operations without changing the resource row.
A connection for a different target cannot operate the resource.

## Roles And Authorization

Organization owner actions:

- Connect a provider.
- Choose the initial Convex team or Cloudflare account.
- Reauthorize or replace the credential for the same target.
- Disconnect.
- Change the target after all target dependencies are removed.

Organization member actions:

- View connection status without secret data.
- Run a live access check.
- Create an app when both organization connections are usable.
- Discover, attach, create, update, observe, and delete provider resources when the product action
  permits it.

Every user-started provider operation checks current organization membership when it starts. A
managed retry uses its recorded run actor and requires that actor's current membership. A system
observation is read-only and organization-scoped. The provider's own permissions can still reject an
action.

## Useful Audit Data Now

Keep only audit facts that answer a current operator question:

- Which organization target did the action use?
- Which Samebase owner established the current grant?
- When did that owner establish it?
- Which Samebase member started a modifying operation?
- Which stable external resource did the operation change?

Use `workflow_vaultProvisioning_runs.userId` for managed work. Add `userId` to manual write locks.
Do not add connection IDs to runs or locks. Do not add a provider connection event table now.

Both provider OAuth grants act through the authorizing provider user. Provider audit data does not
identify the Samebase member who started the operation. Samebase therefore needs its own operation
actor.

## Lifecycle Rules

### Connect

1. Require organization owner role.
2. Start and complete the provider OAuth flow with backend-only credential handling.
3. For Convex, read the exact team from the provider. For Cloudflare, discover the accounts that the
   OAuth grant exposes and require one exact account choice.
4. If retained targets exist, require the new target to match all of them.
5. Insert the one row. Do not create a row until Cloudflare has one exact account choice.
6. For Cloudflare, verify access to the selected account and run non-modifying Workers Scripts and
   Workers CI access probes.
7. Set `connectedByUserId` and `grantEstablishedAt` to the acting owner and current time. Set
   `grantGeneration` to 1.

### Reauthorize Or Replace

1. Require organization owner role.
2. Verify the new credential before changing the row.
3. Require the same `teamId` or `accountId`.
4. Require the same `grantGeneration` that the replace operation read before credential
   verification.
5. Replace the secret in the same row.
6. Set `connectedByUserId` to the acting owner and update `grantEstablishedAt`.
7. Increment `grantGeneration`.
8. Do not rewrite resource, plan, retry, or write-lock rows.

For Cloudflare, the replacement OAuth grant can expose several accounts. Require it to include the
row's current `accountId`. Do not change the target or show the account selector during
reauthorization.

Do not revoke the previous Cloudflare refresh credential after the replacement is stored until
Cloudflare confirms whether that revoke can affect a newer authorization for the same OAuth client.
The replacement removes the previous credential from Samebase, but upstream removal is not
confirmed.

Do not tell the previous Convex connector to revoke the old OAuth grant after replacement. Convex
does not document whether repeated authorization creates independent tokens or one application
authorization. A manual revoke can also revoke the new grant. Until Convex confirms the safe flow,
replace the local secret and report that upstream removal of the old token is not confirmed.

### Automatic Cloudflare Token Refresh

Automatic refresh maintains the current grant. It is not a new connection or a reauthorization.

1. Resolve the one Cloudflare row and record its `grantGeneration`.
2. Claim the short-lived refresh lease.
3. Use the refresh credential only in a backend-only action.
4. Atomically store the returned access token, refresh token, and expiry only if the row and
   `grantGeneration` are unchanged.
5. Clear the refresh lease. A stale refresh result must not overwrite a later reauthorization.
6. Do not change `connectedByUserId`, `grantEstablishedAt`, or `grantGeneration`.

A definitive invalid-refresh result keeps the row and marks the connection as needing owner
reauthorization. A network or provider error is not proof that the grant is invalid.

### Target Change

A different team or account is not reauthorization.

- An owner can always disconnect for security.
- A new target is rejected while retained target dependencies exist.
- Reconnect to the same target restores use.
- To use a different target, remove or reset all old provider resources, plans, and retry state
  first.
- After the dependencies are gone, disconnect the old target and create a new row with
  `grantGeneration = 1`. Do not update a target in place.
- Do not move resources silently and do not rewrite stable IDs only to make a new credential fit.

The current explicit Convex project-transfer reconciliation remains a verified resource operation.
It cannot introduce a second organization team. A future transfer flow can change the one
organization team only when every retained Convex target can move to the same verified team in one
controlled operation. That flow is not required in the first implementation.

### Disconnect

Disconnect has this exact promise:

- It removes the local provider connection and secret.
- New operations and retries cannot resolve a credential after local removal.
- It does not detach or delete a vault resource.
- It does not change a provisioning plan or deletion retry target.
- It does not cancel a provider request that already started.
- Existing resources become unavailable in Samebase until an owner reconnects the same target.

Provider-specific upstream result:

| Method           | Upstream action                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Convex OAuth     | No app-side revoke endpoint is documented. Remove local access and show the Convex manual-revoke action.                                                                                   |
| Cloudflare OAuth | Call the documented revoke endpoint with the current refresh token before local removal. Report whether Cloudflare confirmed revocation. If not, tell the connector to revoke it manually. |

Local removal is the guaranteed result. Upstream revocation is method-specific. The UI must not say
that a provider revoked access when Samebase cannot confirm it.

### Connector Role Change Or Organization Departure

Do not remove the connection.

- `connectedByUserId` remains provenance for the current grant.
- Other members continue to use the connection if the provider still accepts it.
- Another Samebase organization owner can replace the credential for the same target. That owner
  must use a provider user who can authorize the same Convex team or Cloudflare account.
- That replacement changes `connectedByUserId` to the new owner.

Provider permissions follow the external connector. A team or account membership removal, a role
reduction, or an upstream grant revocation can make the OAuth credential fail. The row and stable
resource data remain until an owner reauthorizes or disconnects.

### Samebase Account Deletion

Do not block account deletion until provider takeover.

1. Keep the existing last-organization-owner guard.
2. Warn the deleting user when a current organization connection has that user in
   `connectedByUserId`.
3. Let another owner replace the grant before deletion if uninterrupted service matters.
4. If no takeover occurs, remove that connection during deletion with the normal disconnect rules.
5. Preserve organizations, memberships of other users, vaults, resources, plans, and retry data.
6. The organization is temporarily unable to use that provider until an owner reconnects the same
   target.

For Cloudflare, attempt upstream OAuth revocation before local removal. Do not block Samebase
account deletion if Cloudflare cannot confirm revocation. Tell the deleting user to revoke the
authorization from the Cloudflare profile. This avoids an orphan provenance reference and does not
make account deletion depend on another person.

### Revoked, Expired, Or Reduced Upstream Access

- Keep the row and stable resource data.
- Fail provider operations closed.
- Try normal Cloudflare token refresh when the access token expires.
- Show that the connection needs owner attention.
- Let an owner replace the credential for the same target.
- Do not automatically change the target or delete resources.
- Do not treat a transient provider error as proof that the grant is revoked.

### Samebase And Provider State Disagree

| State                                              | Recovery                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Local row exists, provider rejects credential      | Keep the row. Mark access as needing attention. Owner replaces the grant for the same target.                                                |
| Local row is absent, upstream grant still exists   | Samebase is disconnected. A provider actor with revoke authority removes the upstream grant, or a Samebase owner reconnects the same target. |
| Local target and provider credential target differ | Reject the credential. Do not change resource rows. Owner supplies a credential for the retained target.                                     |
| Provider resource is missing                       | Keep the attachment until the existing verified observation or detach flow resolves it. Do not change the connection target.                 |
| Convex project moved teams                         | Use the accepted verified reconciliation rules, subject to the one-team invariant. Do not infer a move from one failed request.              |
| Cloudflare Worker is in another account            | Treat it as a different external resource. Do not use a multi-account grant to hide the mismatch.                                            |

## Current Operation Rules After The Change

| Operation state               | Required rule                                                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queued                        | Keep only stable target IDs in the plan. Resolve the current one-row credential when the provider step starts.                                                                                                          |
| Running before provider write | Verify current membership, operation lock, credential, and exact target.                                                                                                                                                |
| Provider request in progress  | Credential replacement or disconnect cannot remove the token already held in action memory. The request can succeed or fail.                                                                                            |
| Provider request completed    | Write the stable checkpoint with the run or action lock and returned external IDs. Do not require the connection row to still exist. This prevents an untracked external create after disconnect.                       |
| Retry                         | Resolve the current row again. A same-target replacement works. A missing row or target mismatch stops the retry without deleting its state.                                                                            |
| Observation                   | Resolve the current row for the resource target. Return a connection-required or access-required result when it is missing or unusable.                                                                                 |
| Resource deletion             | Resolve the current row from the retained external target on every attempt. Keep the deletion retry state when access is missing.                                                                                       |
| Account deletion              | Wait for active operations that the deleting user started. A different member's in-progress request can checkpoint with stable IDs even if the credential row is removed. Later steps require a replacement credential. |

An action can carry `providerConnections._id` while it uses a resolved credential. A checkpoint
mutation must validate the external target and operation owner. It must not require that the
replaceable row still exists after the provider call.

## Minimum UI Recommendation

The provider page needs two provider rows. It does not need a connection list, default markers, or
summary cards.

Connected status:

- `Convex team acme-platform`
- `Cloudflare account acme-production`

Owner actions:

- `Check access`
- `Reauthorize` for Convex
- `Reauthorize` for Cloudflare
- `Disconnect`

Member action:

- `Check access`

If management controls are absent for a member, use one short line only when needed:

`An organization owner manages this connection.`

`Connect Cloudflare` always starts the direct OAuth flow. If the new grant exposes several accounts,
show one account picker as the final setup step. Remove `Select account` and `Manage account` after
the connection exists. Also remove selected badges and selected-connection language. The account
chosen during connect becomes the connection target.

Do not ask for or display a Cloudflare API token.

The disconnect confirmation must state the local result and the provider-specific upstream action.
It must also state that projects, Workers, and vault attachments remain.

App creation has no provider selector. Before create, show one compact destination line:

`Creates in Convex team acme-platform and Cloudflare account acme-production.`

When a connection is missing, show the one required action:

- Owner: `Connect Convex to create an app.`
- Member: `An organization owner must connect Convex before you can create an app.`

Use the same form for Cloudflare. Do not add global organization navigation in this task.

A missing connection can still have retained resource or retry targets. In this state, do not show a
generic Connect action. Show the retained target and require an exact reconnect:

- `Disconnected. Reconnect Convex team ID <teamId>.`
- `Disconnected. Reconnect Cloudflare account <accountId>.`

Only an owner sees `Reconnect`. App creation stays blocked. Existing resources and retries stay
visible, but their provider actions need the same-target connection.

## Concrete Model Comparison

### Model A: One Connection For Each Provider

Exact invariant:

- Zero or one row for `(organizationId, kind)`.
- The row contains one external target and one current grant.
- All retained targets for that provider in the organization agree.

User view:

- One Convex team and one Cloudflare account.
- One status and one set of owner controls for each provider.

New and existing resources:

- New resources use the one target.
- Existing resources load the one row and require an exact target match.

Reconnect, replace, and disconnect:

- A replacement must keep the target.
- Disconnect removes local access and keeps resources.
- A different target is blocked while dependencies exist.

Departure, deletion, revocation, and takeover:

- Organization departure does not remove the row.
- Samebase account deletion removes a row still established by that user.
- Another owner can take over by replacing the same-target grant.
- Revocation keeps resource state and asks for owner action.

Recovery:

- Reconnect a usable credential for the stored target.
- State disagreement fails closed and does not move resources.

Cost and fit:

- Lowest current schema, UI, routing, and lifecycle cost.
- Supports the shared organization credential and all current app flows.
- Expresses the current beta product limit. It does not redefine organization identity.
- Stable resource target IDs make a later multi-target migration direct, but that migration must add
  explicit target selection and lifecycle rules.

Decision: Recommend.

### Model B: One Connection For Each External Team Or Account

Exact invariant:

- One row for each unique organization, provider, and external target.
- One separate default target is required for new resources.
- Existing resources resolve the row whose target matches their stable target.

User view:

- A list of teams or accounts, with one default.
- Owner controls for each target and a default-change action.

New and existing resources:

- New resources use the default or need an explicit target selector.
- Existing resources use their matching target row.

Reconnect, replace, and disconnect:

- Replacement stays within one target row.
- Disconnect affects one target and strands only its resources.
- Changing the default does not move existing resources.

Departure, deletion, revocation, and takeover:

- Each row needs its own connector lifecycle.
- Account deletion can remove some rows and not others.
- Another owner takes over each affected target separately.
- Revocation state is per target.

Recovery:

- Reconnect each missing target.
- The UI must show which vaults depend on each target before disconnect.

Cost and fit:

- Adds a durable default, target list UI, per-target lifecycle, and mixed-target tests.
- Supports several Convex teams or Cloudflare accounts.
- Samebase has no current accepted use case for that behavior.
- Extension from model A is direct: add a provider-target collection and an explicit new-resource
  choice after a real use case exists.

Decision: Reject now.

### Model C: Several Independent Credentials With Selection And Failover

Exact invariant:

- Several grants can exist for the same provider and possibly the same target.
- Routing needs priority, health, compatibility, and failover rules.
- Each operation must record why one grant was selected.

User view:

- Credential list, target scope, priority, health, and revoke controls.
- The user must understand which credential will run the next action.

New and existing resources:

- New resources need a routing policy.
- Existing resources need target matching, grant selection, and safe failover.

Reconnect, replace, and disconnect:

- Reconnect can add or replace one grant.
- Disconnect needs a decision about fallback and resource impact.
- Old grants can stay live without a visible target.

Departure, deletion, revocation, and takeover:

- Every grant has separate provenance and lifecycle.
- Account deletion and member departure can change routing.
- Takeover can add another grant without removing the first.
- Revocation can cause automatic failover with a different external actor.

Recovery:

- Requires deterministic failover and audit of the selected grant.
- Samebase and provider health can disagree for each grant.

Cost and fit:

- Highest current security, audit, UI, and concurrency cost.
- Supports credential redundancy and failover.
- There is no current use case for provider credential failover.

Decision: Reject.

### Model D: Separate External Targets And Credential Grants

Exact invariant:

- A provider-target table stores each external team or account.
- A grant table stores one or several credentials and their target reach.
- A routing relation selects one grant for each target.

User view:

- Separate account or team management and credential management.
- The user sees which grants can operate each target.

New and existing resources:

- New resources choose a target.
- Existing resources resolve their target, then a usable grant.

Reconnect, replace, and disconnect:

- Credential rotation does not replace target rows.
- Disconnect can remove a grant, a target, or their relation. The UI must distinguish these actions.

Departure, deletion, revocation, and takeover:

- Connector lifecycle belongs to grants.
- Resource lifecycle belongs to targets.
- Another owner can add a grant for an existing target.
- Revocation affects a grant and can leave the target without access.

Recovery:

- The split gives the clearest model when several grants or targets are real.
- It also creates empty-target, unbound-grant, and ambiguous-routing states now.

Cost and fit:

- Best extension shape for a proven multi-target or multi-grant product.
- Current cardinality would be one target row and one grant row for each provider. That is a
  one-to-one join with no current product benefit.

Decision: Reject now. Reconsider only after an accepted multi-target or multi-grant use case.

## Requirements Before Future Multi-Connection UI

Do not add a second row or connection picker until a later accepted decision defines:

1. The real user action that needs several teams, accounts, or grants, such as a vault that must use
   a different provider target from the other organization vaults.
2. Whether multiplicity is in external targets, credential grants, or both.
3. How a new resource selects a target.
4. How every existing resource resolves a grant.
5. Disconnect, revocation, connector departure, account deletion, and takeover for each row.
6. Whether failover is automatic or owner-selected.
7. Audit identity for the Samebase actor, external target, and grant.
8. Route-level provider page and app-creation tests.
9. A migration from the one-target invariant.

Model D is the likely starting point only if that evidence shows that targets and grants need
independent multiplicity.

## Reset Plan

Use a clean pre-beta reset. Do not preserve the hidden-row shape.

1. Stop new provider writes during the reset.
2. Revoke current direct Cloudflare OAuth grants through the direct revoke endpoint while refresh
   tokens are available. The operator will reconnect through the same direct OAuth flow after the
   reset.
3. Revoke current Cloudflare MCP OAuth grants through their separate revoke path.
4. Tell the owner of each current Cloudflare API token to revoke it.
5. Tell current Convex OAuth connectors to revoke the application authorization in Convex. Tell the
   Convex team member who created a current team token to revoke that token.
6. Clear `providerConnections` and `providerOAuthCallbackStates`.
7. Remove both selected connection fields from `organizations`.
8. Inspect retained provider targets for each organization.
9. If one organization has more than one Convex `teamId` or Cloudflare `accountId`, clear its
   disposable vault, provider-resource, provisioning, and deletion-retry rows. Do not add
   compatibility routing.
10. Preserve stable resource rows only when all targets already satisfy the new invariant.
11. Reconnect the exact retained targets with the new methods.

For the current single-operator development system, a full disposable product-data reset is the
preferred path if any target conflict exists.

## Later Implementation Slices

### Slice 1: One-Row Data Model And Resolution

- Apply the proposed `providerConnections` union and indexes.
- Remove organization selected IDs and selected-row helpers.
- Make Convex and Cloudflare resource resolution use the same target-match rule.
- Remove connection-row validation from post-provider checkpoints.
- Apply the clean reset and add invariant tests.

### Slice 2: Credential And Lifecycle Rules

- Keep Convex team OAuth only for product setup.
- Keep direct Cloudflare OAuth as the only Cloudflare product connection path.
- Keep access-token refresh and remove generic API-key and MCP OAuth product paths.
- Implement replace, disconnect, upstream-result reporting, account deletion, and same-target
  takeover rules.
- Add `userId` to manual provider write locks and cover credential changes during operations.

### Slice 3: Minimum UI And Live Validation

- Update the provider page and app creation with the minimum copy in this RFC.
- Remove selected and manage-account controls.
- Add route-level screenshots and owner/member interaction tests.
- Validate one owner connects, one member creates an app, another owner takes over, and same-target
  reconnect restores an existing resource.
- Get written Convex and Cloudflare confirmation before broad production use.

## Confirmed Review Direction

For beta, enforce zero or one Convex connection and zero or one Cloudflare connection for each
Samebase organization. This is a current product and UI limit. Cloudflare's GitHub App guidance is
supporting evidence for the Cloudflare account limit. Neither limit becomes part of organization
identity.

## Decisions That Still Need User Approval

1. Approve removing the redundant selected connection fields and resetting hidden extra rows.
2. Approve removing the manual Cloudflare API-key and MCP OAuth product paths. Direct Cloudflare
   OAuth remains as the required Cloudflare connection method.
3. Approve the lifecycle: membership departure keeps the OAuth connection while the provider still
   accepts it, Samebase account deletion removes a grant still established by that user without
   blocking deletion, and Disconnect always removes local access without deleting resources.

The provider confirmation questions are external launch conditions. They do not change the schema
recommendation.

## Summary

Use one provider connection of each kind for one organization during beta. This is a product limit,
not organization identity. The row binds one stable external target to one current replaceable
credential. One team or account can contain a separate project or Worker for each vault. Remove
selected IDs. Keep provider resources and retry state bound to stable external IDs. Use Convex team
OAuth and direct Cloudflare OAuth. Keeping the Cloudflare OAuth setup flow is a product invariant.
Let all organization members use the backend-only credential, while only owners manage it. Reconnect
to the same target restores operations. Disconnect removes local access and keeps resources. Add
multi-connection behavior only after a real use case proves that the product needs independent
targets or grants.
