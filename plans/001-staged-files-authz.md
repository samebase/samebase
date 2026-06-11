# Plan 001: Enforce vault ownership on `fileStaging.listStagedFiles`

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat b75f8480a..HEAD -- apps/noter/convex/fileStaging.ts apps/noter/convex/toolRuntime/executors.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `b75f8480a`, 2026-06-11

## Why this matters

`listStagedFiles` is a **public Convex query** that returns full staged file documents — including
`content` and `initialContent` — for any `vaultId` the caller passes. It performs no authentication
and no ownership check. Vaults are strictly owner-scoped in this app (there is no sharing or
public-vault model in the staging domain), and every sibling function in the same file enforces
ownership. Any client that learns a vault ID (IDs appear in app URLs, logs, and screenshots) can
subscribe to another user's staged file contents. This closes that hole and aligns the query with
the file's own convention.

## Current state

All paths relative to the repo root.

- `apps/noter/convex/fileStaging.ts` — the staging module.
  - The vulnerable query, lines 480–494:

    ```ts
    // List all files currently in staging for a vault
    export const listStagedFiles = query({
      args: listStagedFilesArgsValidator,
      returns: stagedFileListValidator,
      handler: async (ctx, args) => {
        const files = await ctx.db
          .query("fileStaging")
          .withIndex("by_vault_and_branch", (q) =>
            q.eq("vaultId", args.vaultId).eq("branch", args.branch),
          )
          .collect();

        return args.includeUnchanged ? files : files.filter(hasStagedFileChanges);
      },
    });
    ```

  - The sibling query that shows the exact authorization pattern to copy, lines 496–518
    (`listStagedFilesBranchSummaries`):

    ```ts
    handler: async (ctx, args) => {
      const userId = await getUserId(ctx);
      const vault = await ctx.db.get(args.vaultId);
      if (
        !canAccessVaultStaging({
          vaultOwnerId: vault?.userId,
          requesterUserId: userId,
        })
      ) {
        return [];
      }
      // ... query and return rows
    ```

  - `canAccessVaultStaging` helper, lines 224–229 (owner equality check).
  - `getUserId` is imported at the top from `./common`; it **throws `"User not authenticated"`** for
    anonymous callers.
  - The internal twin `listAllStagedFiles`, lines 520–542: an `internalQuery` with args
    `{ vaultId, branch (optional), includeUnchanged (optional) }` and the **same return validator**
    (`stagedFileListValidator`). Internal queries cannot be called by clients.

- `apps/noter/convex/toolRuntime/executors.ts` — AI tool executors. Line 576 calls the **public**
  query through an `ActionCtx` that carries no user identity (tools can run from workpool/scheduled
  actions):

  ```ts
  const stagedFiles = await context.ctx.runQuery(api.fileStaging.listStagedFiles, {
    vaultId: vault._id,
    branch,
    includeUnchanged: true,
  });
  ```

  This callsite is already ownership-safe by construction: `context.vault` is resolved in
  `apps/noter/convex/toolRuntime/runtime.ts:82-94` via
  `internal.toolRuntime.queries.getVaultContextForUser` keyed by `{ userId, vaultId }`. But because
  the `ActionCtx` has no auth identity, adding `getUserId` to the public query would break this
  callsite — it must be switched to the internal twin first.

- Frontend subscribers of `api.fileStaging.listStagedFiles` (all are authenticated owner-only
  surfaces; none need changes):
  - `apps/noter/src/components/EditedFilesCategories.tsx:328`
  - `apps/noter/src/components/VaultSyncStatus.tsx:174`
  - `apps/noter/src/components/FileView/FileView.tsx:891`
  - `apps/noter/src/components/FileView/fileViewShared.ts:99` (type-only use)
  - The public landing (`PublicLandingAccountSection.tsx`) does NOT use this query — verified; it
    only queries `api.users.viewer` and `api.users.getViewerAuthProviders`.

- Repo conventions that apply:
  - Queries in this file fail soft (`return []`) for non-owners after `getUserId` succeeds;
    mutations throw `"Unauthorized"`. Match the query convention.
  - No `any`, no type assertions (see `AGENTS.md` "Code Guardrails").
  - Convex guidelines live at `apps/noter/convex/_generated/ai/guidelines.md` — read them before
    editing Convex code.

## Commands you will need

| Purpose                                 | Command                          | Expected on success |
| --------------------------------------- | -------------------------------- | ------------------- |
| Install                                 | `pnpm install --frozen-lockfile` | exit 0              |
| Typecheck + lint (no deployment needed) | `pnpm check:ci`                  | exit 0              |
| All unit tests                          | `pnpm test`                      | exit 0, all pass    |
| Convex project tests only               | `pnpm test:convex`               | exit 0, all pass    |

Note: plain `pnpm check` runs `convex codegen` and needs a bootstrapped local deployment
(`pnpm dev:worktree:once` in a worktree). This plan does not change function signatures, so
`check:ci` (which skips codegen) is sufficient.

## Scope

**In scope** (the only files you should modify):

- `apps/noter/convex/fileStaging.ts` (the `listStagedFiles` handler only)
- `apps/noter/convex/toolRuntime/executors.ts` (the one `runQuery` callsite)
- `apps/noter/convex/fileStaging.convex.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):

- `listStagedFilesBranchSummaries`, `listAllStagedFiles`, and every other function in
  `fileStaging.ts` — they are already correct.
- The frontend subscriber components listed above — their calls keep working because they only ever
  pass vaults the signed-in owner is viewing.
- `apps/noter/convex/fileStaging.test.ts` — the existing pure-unit test file; add the new
  Convex-backend tests in a separate `.convex.test.ts` file (repo convention:
  `users.convex.test.ts`, `infraRead.convex.test.ts`).
- Any change to `stagedFileListValidator` or the query's args/return shape.

## Git workflow

- Branch: `advisor/001-staged-files-authz` (repo renames `codex/*` autogen branches; any descriptive
  branch name is acceptable — do not put build labels in branch names).
- One commit; subject style: short imperative, e.g. `Enforce vault ownership on listStagedFiles`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Switch the toolRuntime callsite to the internal query

In `apps/noter/convex/toolRuntime/executors.ts` line 576, change:

```ts
const stagedFiles = await context.ctx.runQuery(api.fileStaging.listStagedFiles, {
```

to:

```ts
const stagedFiles = await context.ctx.runQuery(internal.fileStaging.listAllStagedFiles, {
```

The args (`vaultId`, `branch`, `includeUnchanged: true`) and the return type are unchanged
(`listAllStagedFiles` takes the same fields, with `branch` optional). Check the file's existing
imports: if `internal` from `./_generated/api` (path relative to `toolRuntime/` is
`../_generated/api`) is not yet imported, add it; if `api` is now unused, remove it.

**Verify**: `pnpm check:ci` → exit 0.

### Step 2: Add the ownership check to `listStagedFiles`

In `apps/noter/convex/fileStaging.ts`, change the `listStagedFiles` handler to match
`listStagedFilesBranchSummaries` exactly:

```ts
export const listStagedFiles = query({
  args: listStagedFilesArgsValidator,
  returns: stagedFileListValidator,
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const vault = await ctx.db.get(args.vaultId);
    if (
      !canAccessVaultStaging({
        vaultOwnerId: vault?.userId,
        requesterUserId: userId,
      })
    ) {
      return [];
    }
    const files = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch),
      )
      .collect();

    return args.includeUnchanged ? files : files.filter(hasStagedFileChanges);
  },
});
```

`getUserId` and `canAccessVaultStaging` are already in scope in this file.

**Verify**: `pnpm check:ci` → exit 0.

### Step 3: Add Convex contract tests

Create `apps/noter/convex/fileStaging.convex.test.ts`. Model the structure on
`apps/noter/convex/users.convex.test.ts` (imports `makeConvexTest` from `./test.setup`, uses `t.run`
to seed rows and `t.withIdentity` for authenticated calls). For the vault row shape, copy the insert
used in `apps/noter/convex/infraRead.convex.test.ts:14`. For the `fileStaging` row, satisfy the
table validator (see `stagedFileValidator` near the top of `fileStaging.ts`): `ownerId`, `vaultId`,
`fileDeleted: false`, `filePath`, `initialFilePath`, `content`, `initialContent`,
`parentCommitSha: null`, `lastEditTime`, `lastEditUserId`, `branch`, `version` (check the live
validator for any fields added since).

Identity pattern (from `users.convex.test.ts:40-43`):

```ts
const asUser = t.withIdentity({
  subject: `${userId}|test-session`,
  tokenIdentifier: `test:${userId}`,
});
```

Three test cases:

1. **Anonymous caller is rejected**:
   `await expect(t.query(api.fileStaging.listStagedFiles, { vaultId, branch: "main" })).rejects.toThrowError("User not authenticated")`
2. **Authenticated non-owner gets an empty list**: seed owner + vault + one staged file; query as a
   different user; expect `[]`.
3. **Owner sees staged rows**: same seed; query as the owner; expect one row with the seeded
   `filePath`.

**Verify**: `pnpm test:convex` → exit 0, the 3 new tests pass.

### Step 4: Full gate

**Verify**: `pnpm test` → exit 0. `pnpm check:ci` → exit 0.

## Test plan

Covered by Step 3 (the three cases above) in `apps/noter/convex/fileStaging.convex.test.ts`, modeled
on `users.convex.test.ts`. Run with `pnpm test:convex`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check:ci` exits 0
- [ ] `pnpm test` exits 0; the 3 new tests in `fileStaging.convex.test.ts` exist and pass
- [ ] `grep -n "canAccessVaultStaging" apps/noter/convex/fileStaging.ts` shows a hit inside the
      `listStagedFiles` handler (between lines for `export const listStagedFiles` and the next
      `export`)
- [ ] `grep -rn "api.fileStaging.listStagedFiles" apps/noter/convex/` returns no matches (the
      toolRuntime callsite now uses `internal.fileStaging.listAllStagedFiles`)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `listStagedFiles` handler already contains `getUserId` or `canAccessVaultStaging` (someone
  fixed it since `b75f8480a`).
- `grep -rn "api.fileStaging.listStagedFiles" apps/noter/src` shows callers other than
  `EditedFilesCategories.tsx`, `VaultSyncStatus.tsx`, `FileView.tsx`, and `fileViewShared.ts` — a
  new consumer may run unauthenticated and needs review.
- `listAllStagedFiles` no longer exists or its args/return shape no longer matches
  `listStagedFiles`.
- Any existing test fails after Step 2 — particularly anything under
  `apps/noter/convex/toolRuntime/` — and the failure is not fixed by Step 1.

## Maintenance notes

- Any future public query/mutation in `fileStaging.ts` must start with the same `getUserId` +
  `canAccessVaultStaging` preamble; reviewers should reject additions without it.
- If vault sharing or public vaults are ever introduced, `canAccessVaultStaging` is the single choke
  point to extend.
- Deferred (out of this plan): the unbounded `.collect()` in this query and its siblings (audit
  finding #8) — pagination is a separate, client-visible change.
