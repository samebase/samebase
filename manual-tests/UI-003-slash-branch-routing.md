# UI-003: Slash branch routing and URL encoding

## Purpose

Verify branch names containing `/` (for example `feature/mobile/smoke`) route
correctly from dashboard links into FileView without colliding with file paths.

## Preconditions

- `make anon` can run in the current checkout.
- A connected vault has a remote branch containing `/` in the branch name.
- Dashboard branch sync has completed for that vault.

## Steps

1. Start the app with `make anon`.
2. Open dashboard and locate the branch entry with `/` in its name.
3. Click that branch link.
4. Confirm the URL branch segment is percent-encoded (`%2F`) for the branch name
   rather than split into multiple route segments.
5. Open any file from the tree and confirm the route still points to the same
   slash branch.
6. Refresh the page and confirm the app resolves to the same branch (no fallback
   to default branch).
7. Navigate back to dashboard and open the default branch; confirm its URL and
   file tree are distinct from the slash branch route.

## Expected Results

1. Slash branch links resolve to the intended branch and remain stable across
   file navigation and page reloads.
2. No branch/file-path ambiguity occurs and no silent fallback to default branch
   happens for valid slash branches.

## Optional Evidence

- Screenshot showing encoded branch URL in the address bar.
- Screenshot of the same file opened on slash branch vs default branch.

## Cleanup

- Stop the local dev server (Ctrl+C).
