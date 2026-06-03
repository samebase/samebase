# Tracked File Paths

`scripts/generated/trackedFilePaths.generated.ts` is a typechecking aid for static file references
in repo scripts. It is not a freshness gate for every tracked file in the repository.

When adding hard-coded references to tracked repo files in scripts, try to wrap the literal in
`trackedFilePath(...)` or a scoped wrapper such as `noterAppFilePath(...)` before falling back to an
untyped string path.

The invariant is:

1. Script checks regenerate the tracked-file union before TypeScript runs.
2. Paths wrapped in `trackedFilePath(...)` or `noterAppFilePath(...)` must fail typechecking when
   the referenced file is removed or renamed.
3. Stale generated output is warning-only in CI because unreferenced file-tree churn should not
   force a generated-file update.
4. `pnpm run generate:tracked-file-paths` refreshes the committed snapshot when a branch wants that
   diff, and `pnpm run verify:tracked-file-paths` remains the hard freshness check.
