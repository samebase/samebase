# Convex Public Function Access Inventory

Date: 2026-06-17

This is a migration worksheet for the access-wrapper rollout from
`rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`.

The readable grouped inventory is generated at
`research/2026-06-17-convex-public-function-access-inventory.generated.ts`. Regenerate it with:

```sh
pnpm run generate:convex-public-function-access-inventory
```

The script uses Convex codegen output in `apps/noter/convex/_generated/api.d.ts` as the public
function surface, then verifies every public route has exactly one temporary access assignment.
Those temporary assignments live in `scripts/generate-convex-public-function-access-inventory.ts`
only for the migration. After a route moves to the app access wrapper, the wrapper `access` field
should be treated as the durable source of truth.
