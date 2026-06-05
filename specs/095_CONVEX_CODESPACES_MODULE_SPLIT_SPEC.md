# Convex Codespaces Module Split Spec

## Document Control

- Status: Accepted
- Owner: Noter backend
- Last updated: 2026-05-06
- Related files:
  - `apps/noter/convex/schema.ts`
  - `apps/noter/convex/codespaces/model.ts`
  - `apps/noter/convex/codespaces/index.ts`
  - `apps/noter/convex/codespaces/mutations.ts`
  - `apps/noter/convex/codespaces/executor.ts`
  - `apps/noter/convex/codespaces/ports.ts`
  - `apps/noter/convex/codespaces/vaultIntegration.ts`
  - `specs/001_CODESPACE_CONNECTION_SPEC.md`
  - `rfcs/008_CHAT_ONLY_CODESPACE_MODE_SPEC.md`
  - `rfcs/009_CODESPACE_PORT_VISIBILITY_SPEC.md`

## Summary

Codespaces is a standalone Convex backend domain. It owns the GitHub Codespace lifecycle, database
record mutations, agent executor calls, port visibility reconciliation, and vault-to-codespace
integration.

The domain should live under `apps/noter/convex/codespaces/` so the backend tree shows that shape
directly. Root `schema.ts` should still define the app schema because Convex expects the app schema
there, but it should import the codespaces table from the domain model so the root file reads as a
map of tables instead of a place for all table implementation details.

## Module Shape

The accepted module map is:

- `codespaces/model.ts`: `CodespaceState` validator and `codespacesTable`.
- `codespaces/index.ts`: public lifecycle actions such as create, start, stop, delete, and
  connection lookup.
- `codespaces/mutations.ts`: internal record queries/mutations plus public read queries for
  active/connected codespaces.
- `codespaces/executor.ts`: Codespace agent HTTP execution and Codex runtime actions.
- `codespaces/ports.ts`: GitHub/Dev Tunnels port visibility reconciliation.
- `codespaces/vaultIntegration.ts`: vault-level orchestration that creates, rebuilds, and ensures a
  ready Codespace.

Do not add root-level re-export shim files for these modules. Current callsites should import or
reference the owning module path directly.

## Schema Contract

`apps/noter/convex/schema.ts` remains the single app schema entrypoint.

The `codespaces` table definition belongs in `codespaces/model.ts` and is imported into root schema
as:

```ts
codespaces: codespacesTable,
```

This keeps the Convex guideline intact while removing table-level Codespaces details from the root
schema file.

Domain-owned validators that are only used by Codespaces should live beside that model. Validators
shared by unrelated domains should stay in the nearest appropriate shared module rather than being
pulled into `codespaces/`.

## Function Reference Contract

Codespaces function references use the folder path:

- `api.codespaces.index.*`
- `api.codespaces.mutations.*`
- `api.codespaces.executor.*`
- `api.codespaces.ports.*`
- `api.codespaces.vaultIntegration.*`
- `internal.codespaces.mutations.*`

This makes the Convex API mental model match the folder structure. Avoid preserving old root names
such as `api.codespacesMutations.*` through wrappers.

## Non-Goals

- Turning Codespaces into a Convex Component. It references app-owned `users` and `vaults`, so
  component isolation would add the wrong boundary.
- Moving generic GitHub, vault, provider connection, or staging behavior into `codespaces/`.
- Hiding the domain behind barrel exports.
