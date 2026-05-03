# Daytona Data Cleanup

This runbook executes Phase 4 of `specs/091_DAYTONA_RETIREMENT_SPEC.md`.

Run it only after the production deployment no longer reads from or writes to
the legacy Daytona vault fields or the `daytonaSnapshots` table.

## Functions

- `legacyDaytonaDataCleanup:clearVaultDaytonaFields` unsets legacy Daytona
  fields on `vaults`.
- `legacyDaytonaDataCleanup:deleteDaytonaSnapshots` deletes `daytonaSnapshots`
  rows.
- `legacyDaytonaDataCleanup:runAll` runs both migrations in order through the
  `@convex-dev/migrations` component.
- `legacyDaytonaDataCleanup:inspect` verifies whether any cleanup target data
  remains.

## Production Run

From the repo root with production Convex credentials available:

```bash
pnpm --filter noter exec convex run legacyDaytonaDataCleanup:inspect --prod
pnpm --filter noter exec convex run legacyDaytonaDataCleanup:clearVaultDaytonaFields '{"dryRun": true}' --prod
pnpm --filter noter exec convex run legacyDaytonaDataCleanup:deleteDaytonaSnapshots '{"dryRun": true}' --prod
pnpm --filter noter exec convex run legacyDaytonaDataCleanup:runAll --prod
pnpm --filter noter exec convex run --component migrations lib:getStatus --prod --watch
pnpm --filter noter exec convex run legacyDaytonaDataCleanup:inspect --prod
```

The final `inspect` result must return `complete: true` before the next narrow
deploy removes the Daytona fields and `daytonaSnapshots` table from the schema.

Do not run the production mutation from a worktree unless that worktree is using
the intended production Convex environment.
