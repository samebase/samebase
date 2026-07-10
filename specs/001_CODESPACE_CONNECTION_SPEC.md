# Dormant Codespaces Backend Contract

## Status

GitHub Codespaces is not part of the Samebase product surface. `CODESPACES_ENABLED` is hard-coded to
`false`, and there is no Codespaces route, embedded editor, status UI, or vault-deletion option.
Connected machines provide the active remote workspace path.

The Codespaces backend and data model remain temporarily for compatibility with any existing rows
and GitHub resources. Their presence does not imply that the feature is available.

## Disabled Behavior

- GitHub OAuth does not request the `codespace` scope.
- User-invoked creation, lifecycle, port-management, and agent-execution functions fail closed
  through `assertCodespacesEnabled`.
- User-facing Codespaces queries return `null`, `0`, or an empty result while the feature is
  disabled.
- The shipped vault-deletion UI always requests `removeCodespaces: false`. Vault deletion fails
  closed if a non-deleted Codespace record still exists, so local cleanup cannot erase the GitHub
  resource identity while leaving a potentially billable resource running.
- Samebase exposes no browser route or UI control that can create, open, reconnect, or delete a
  Codespace.

## Retained Data Boundary

The `codespaces` table records the owning vault and user, GitHub resource identifiers, lifecycle
state, optional web and agent endpoints, optional agent health metadata, and the branch and commit
used to create the resource. A vault may retain an `activeCodespaceId` reference.

Agent tokens are credentials. When Codespaces is enabled, the authenticated connection action may
return the token to its authorized caller so it can reach the agent. Token values and prefixes must
not be logged or included in fixtures and documentation.

## Implementation Map

- `apps/samebase/shared/featureFlags.ts`: disabled flag and fail-closed assertion.
- `apps/samebase/shared/githubOAuth.ts`: conditionally excludes the GitHub Codespaces scope.
- `apps/samebase/convex/codespaces/model.ts`: retained table and lifecycle state model.
- `apps/samebase/convex/codespaces/index.ts`: GitHub Codespaces lifecycle actions.
- `apps/samebase/convex/codespaces/vaultIntegration.ts`: vault-to-Codespace orchestration.
- `apps/samebase/convex/codespaces/ports.ts`: forwarded-port visibility management.
- `apps/samebase/convex/codespaces/executor.ts`: HTTP agent client.
- `apps/samebase/convex/codespaces/mutations.ts`: retained records and disabled user reads.
- `.codespace-agent/server.ts`: legacy agent server used inside a Codespace.

## Retirement Or Revival

Backend removal requires an explicit audit of production `codespaces` rows,
`vaults.activeCodespaceId` references, and matching GitHub resources. After cleanup, remove the
schema fields and table through a Convex migration before deleting the backend modules and agent
server.

Reviving Codespaces is a new product decision. It requires an accepted spec for the user workflow,
OAuth scope, cost and lifecycle ownership, observability, resource cleanup, and a newly designed UI.
The deleted iframe and floating-chat surfaces are not a compatibility contract.

## Related Specs

- `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`: active Convex and Cloudflare provisioning.
- `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`: approval-first production access.
