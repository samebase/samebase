# Codespaces Value And Retirement Audit

## Status

- Date: 2026-07-24
- Scope: GitHub Codespaces lifecycle, embedded UI, Convex integration, OAuth scope, deletion
  workflow, devcontainer startup, and the Codespaces-resident command agent
- Project context: pre-beta, with the operator as the only real user and no compatibility commitment
  to external data
- Outcome: product implementation retired; generic devcontainer support preserved

## Decision

Remove GitHub Codespaces from the active product and codebase.

The feature had been hard-disabled since 2026-05-17 and had no planned release. Keeping it still
required a complete vertical slice: a Convex table and lifecycle domain, GitHub API permissions,
routes and UI, vault deletion branches, a public forwarded port, and a command and filesystem agent
inside each Codespace.

The resident agent also carried an unacceptable dormant security shape. Port `3000` was public so
Convex could call it, while a first request could establish its bearer token. Retiring the feature
removes that exposure instead of preserving or hardening an unused execution system.

## Implementation Removed

The retirement change removes:

1. Codespaces routes, components, URL parsing, route metadata, and screenshot or unit coverage
2. the Convex Codespaces table, lifecycle functions, executor, port reconciliation, vault
   integration, OAuth scope, and generated API references
3. Codespaces branches from vault deletion options, plans, steps, cleanup registries, progress copy,
   and writer gates
4. `activeCodespaceId` and the final `access_machines` owner
5. `.codespace-agent`, its package dependencies, runtime token state, and root lint or ignore wiring
6. devcontainer startup of the agent, public port `3000`, callback port `1455`, global Codex
   install, and Codespaces-only `WORKSPACE_DIR` plumbing
7. active Codespaces specifications, RFCs, roadmap claims, privacy copy, and public generated docs

The root `.devcontainer` remains as a generic development environment. It runs the same worktree
bootstrap as local development and forwards only the Vite port.

## Transferable Lessons

The implementation proved several useful requirements for any future hosted execution product:

1. execution must have an authenticated control plane before the first reachable request
2. command, filesystem, and preview capabilities need separate least-privilege boundaries
3. provider resources need durable ownership and deletion records
4. runtime readiness and port reachability need explicit state rather than optimistic polling
5. a hosted runtime should be selected from current product requirements, not inherited from an
   editor integration

These lessons do not justify preserving the Codespaces schema, routes, agent protocol, or provider
abstractions. A future hosted runtime should start from a new accepted contract.

## External Cleanup

The retirement audit found and cleaned the following persistent state:

1. GitHub returned zero Codespaces for the operator account.
2. GitHub returned zero user-level Codespaces secrets.
3. Production Convex contained zero Codespaces rows, zero `activeCodespaceId` values, zero
   `devcontainerConfig` values, and no active deletion run or retained plan using Codespaces.
4. Eight historical `workflow_vaultDeletion_events` rows used the retired `delete_codespaces` step.
   A bounded one-shot production mutation deleted all eight, and an immediate second run returned
   zero.
5. MCP authorizations, grants, access tokens, and production-read request tables contained no
   `access_machines` entries.

The app no longer requests the `codespace` OAuth scope. Existing GitHub authorization was left
untouched at the operator's direction.

No running development container residue existed in the current worktree: `.codespace-agent` had no
local token or dependencies. Previously created containers and generated vault repositories were not
enumerated because no external inventory for them exists.

## Completion Checks

Retirement is complete only when:

1. GitHub shows no Codespaces or user-level Codespaces-only secrets
2. persistent Convex deployments have no Codespaces rows, table, vault pointer, deletion-plan
   variants, or generated functions
3. provider authorization no longer requests `codespace`
4. active code and product contracts contain no Codespaces behavior
5. remaining references are explicitly historical, including this audit, recovered notes, and Git
   history
