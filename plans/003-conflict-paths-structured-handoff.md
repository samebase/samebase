# Plan 003: Make the upstream-conflict path handoff comma-safe

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat b75f8480a..HEAD -- apps/noter/convex/fileStagingActions.ts apps/noter/src/components/FileView/fileViewShared.ts apps/noter/shared/stagingErrors.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b75f8480a`, 2026-06-11

## Why this matters

When a commit hits upstream conflicts, the backend throws an error whose message embeds the
conflicting file paths joined with `", "`, and the frontend reconstructs the list by splitting the
message on `","`. Any file path containing a comma is split into bogus entries, so the conflict UI
shows wrong paths and users can be misled while resolving conflicts. The bug is acknowledged in the
repo's own `TODO.md` (lines 9–11): "replace the delimiter-based handoff between `fileStagingActions`
and `fileViewShared` with a structured payload."

## Current state

All paths relative to the repo root.

- Producer — `apps/noter/convex/fileStagingActions.ts`:
  - Line 811:

    ```ts
    function formatUpstreamConflictError(paths: string[]): string {
      const uniquePaths = Array.from(new Set(paths)).sort();
      return `Commit conflicts with upstream changes. Resolve and retry: ${uniquePaths.join(", ")}`;
    }
    ```

  - Line 1100 (the only usage; the message is thrown, not persisted):

    ```ts
    throw new Error(formatUpstreamConflictError(inspection.conflicts.map((file) => file.filePath)));
    ```

- Consumer — `apps/noter/src/components/FileView/fileViewShared.ts` lines 169–182:

  ```ts
  const UPSTREAM_CONFLICT_ERROR_PREFIX =
    "Commit conflicts with upstream changes. Resolve and retry: ";

  export function parseUpstreamConflictPaths(message: string | null): string[] {
    if (!message || !message.startsWith(UPSTREAM_CONFLICT_ERROR_PREFIX)) {
      return [];
    }

    return message
      .slice(UPSTREAM_CONFLICT_ERROR_PREFIX.length)
      .split(",")
      .map((path) => path.trim())
      .filter((path) => path.length > 0);
  }
  ```

- Frontend callers of `parseUpstreamConflictPaths` (only consume the returned `string[]`; no changes
  needed): `apps/noter/src/components/FileView/FileView.tsx:1598`, `:1669`, `:1747`. No test file
  currently asserts on this message format (verified:
  `grep -rn "Resolve and retry" apps/noter --include='*.test.*'` is empty).

- Shared-module precedent: `apps/noter/shared/` already holds code imported by BOTH `convex/` and
  `src/`:
  - `apps/noter/shared/stagingErrors.ts` — staging error-message helpers (tagged error codes); has a
    sibling `stagingErrors.test.ts`.
  - Import path precedents: `convex/githubOAuth.ts` imports `"../shared/githubOAuth"`;
    `fileViewShared.ts` itself already imports from the shared staging module
    (`getSharedStagedFileStatus` — check its import line near the top of `fileViewShared.ts` and
    copy that path style).

- Repo conventions that apply: one source of truth for format+parse (no duplicated prefix constants
  in two files); no `any`/assertions; write a short JSDoc naming the constraint (paths may contain
  commas; JSON encoding makes the handoff lossless); tests assert app behavior directly.

## Commands you will need

| Purpose          | Command                          | Expected on success |
| ---------------- | -------------------------------- | ------------------- |
| Install          | `pnpm install --frozen-lockfile` | exit 0              |
| Typecheck + lint | `pnpm check:ci`                  | exit 0              |
| All tests        | `pnpm test`                      | exit 0, all pass    |

## Scope

**In scope** (the only files you should modify):

- `apps/noter/shared/stagingErrors.ts` (add format + parse pair)
- `apps/noter/shared/stagingErrors.test.ts` (add cases)
- `apps/noter/convex/fileStagingActions.ts` (use the shared formatter)
- `apps/noter/src/components/FileView/fileViewShared.ts` (delegate to the shared parser)

**Out of scope** (do NOT touch):

- `apps/noter/src/components/FileView/FileView.tsx` — its three callsites keep the same
  `parseUpstreamConflictPaths` API.
- Any persistence/schema change — the message is an ephemeral thrown error.
- The conflict _detection_ logic in `fileStagingActions.ts` (`inspectStagedFilesAgainstLatestHead`).

## Git workflow

- Branch: `advisor/003-conflict-paths-structured-handoff`
- One commit; subject e.g. `Make upstream-conflict path handoff comma-safe`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the shared format/parse pair

In `apps/noter/shared/stagingErrors.ts`, add (keeping the existing exports untouched):

```ts
const UPSTREAM_CONFLICT_ERROR_PREFIX =
  "Commit conflicts with upstream changes. Resolve and retry: ";

/**
Conflict paths are JSON-encoded after the stable prefix so file paths that
contain commas (or any other delimiter) survive the error-message handoff
from fileStagingActions to the FileView conflict UI.
*/
export function formatUpstreamConflictError(paths: string[]): string {
  const uniquePaths = Array.from(new Set(paths)).sort();
  return `${UPSTREAM_CONFLICT_ERROR_PREFIX}${JSON.stringify(uniquePaths)}`;
}

export function parseUpstreamConflictPaths(message: string | null): string[] {
  if (!message || !message.startsWith(UPSTREAM_CONFLICT_ERROR_PREFIX)) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(message.slice(UPSTREAM_CONFLICT_ERROR_PREFIX.length));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((path): path is string => typeof path === "string");
}
```

(If the repo's shared `notEmpty` style or lint prefers a different filter idiom, match the
surrounding file.)

**Verify**: `pnpm check:ci` → exit 0.

### Step 2: Add shared tests

In `apps/noter/shared/stagingErrors.test.ts`, add a `describe` block with:

1. round-trip of `["a.md", "b.md"]` → parse(format(...)) returns both paths
2. round-trip of `["feature, WIP.md", "normal.md"]` → exactly these two paths (the comma case from
   `TODO.md`)
3. round-trip of a path containing a double quote and a backslash
4. duplicate inputs are deduped and sorted by `format`
5. `parseUpstreamConflictPaths(null)` → `[]`
6. unrelated message → `[]`
7. message with the prefix but non-JSON remainder (the legacy `", "` format, e.g.
   `"...Resolve and retry: a.md, b.md"`) → `[]`

**Verify**: `pnpm test` → exit 0, new tests pass.

### Step 3: Switch the producer

In `apps/noter/convex/fileStagingActions.ts`: delete the local `formatUpstreamConflictError`
(line 811) and import it from `"../shared/stagingErrors"` instead (match the existing
`"../shared/..."` import style in `convex/githubOAuth.ts`). The throw at line 1100 stays unchanged.

**Verify**: `pnpm check:ci` → exit 0.

### Step 4: Switch the consumer

In `apps/noter/src/components/FileView/fileViewShared.ts`: delete the local
`UPSTREAM_CONFLICT_ERROR_PREFIX` and `parseUpstreamConflictPaths` (lines 169–182) and instead
re-export the shared one:

```ts
export { parseUpstreamConflictPaths } from "<same path style used for the existing shared import in this file>";
```

(FileView.tsx imports `parseUpstreamConflictPaths` from `fileViewShared`, so re-exporting keeps the
three callsites untouched. The repo's "no re-export shims" rule targets whole pass-through files; a
named re-export from an existing module hub like `fileViewShared` matches its current role. If lint
flags it anyway, update the three `FileView.tsx` imports to the shared module directly and delete
the re-export.)

**Verify**: `pnpm check:ci` → exit 0. `pnpm test` → exit 0.

## Test plan

Step 2's seven cases in `apps/noter/shared/stagingErrors.test.ts`, following the file's existing
`describe/it` structure (`vite-plus/test`). The comma filename case (#2) is the regression this plan
exists for.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check:ci` exits 0
- [ ] `pnpm test` exits 0; the 7 new cases pass
- [ ] `grep -rn "join(\", \")" apps/noter/convex/fileStagingActions.ts` returns no matches
- [ ] `grep -c "UPSTREAM_CONFLICT_ERROR_PREFIX" apps/noter/src/components/FileView/fileViewShared.ts`
      returns 0 (single source of truth lives in `shared/stagingErrors.ts`)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated; also tick the corresponding `TODO.md` line ONLY if the
      operator asked you to maintain TODO.md — otherwise leave TODO.md alone and mention it in your
      report

## STOP conditions

Stop and report back (do not improvise) if:

- `grep -rn "Resolve and retry" apps/noter --include='*.ts' --include='*.tsx'` shows
  producers/consumers beyond `fileStagingActions.ts:811/:1100` and `fileViewShared.ts` — another
  handoff exists and needs the same change.
- You find the conflict message being **persisted** anywhere (chat approval cards, staging rows,
  audit tables) — old-format messages would then survive in storage and parsing must keep a legacy
  fallback; that is a design decision for the maintainer.
- Importing `"../shared/stagingErrors"` from `convex/` fails the Convex bundler/typecheck
  (shared-module path constraints changed).

## Maintenance notes

- The error prefix is now load-bearing API between backend and frontend; if it changes, change it in
  `shared/stagingErrors.ts` only.
- If a richer conflict payload is ever needed (e.g. per-path conflict type), extend the JSON shape
  in the shared module — both sides pick it up.
- Reviewer focus: confirm no remaining `.split(",")` on the message path and that the legacy
  non-JSON message parses to `[]` rather than garbage.
