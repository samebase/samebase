# 075 Anon Killport Spec

## Status

- Accepted
- Last updated: 2026-03-30

## Related Specs

- `specs/013_WORKTREE_AUTO_PROVISIONING_SPEC.md`

## Summary

Replace the root `make kill-port` target with a single `make killport` target.

`make killport` must support two operator flows:

1. `make killport <port>` kills the explicitly provided listening port
2. `make killport` reads the current worktree's stored anonymous local backend port from
   `apps/noter/.env.local` and kills that port if it is listening

`make anon` and `make anon-once` must run `make killport` before starting the anonymous Convex
bootstrap flow.

## Goals

1. Remove the need to manually look up the stale local backend port
2. Remove the need to manually type the stale local backend port
3. Keep the recovery path explicit and easy to understand
4. Avoid output parsing or retry wrappers around the whole `make anon` flow

## Non-Goals

1. Do not infer ports from worktree hashing or other fallbacks in `killport`
2. Do not parse Convex CLI error output to discover the port
3. Do not retry `make anon` automatically
4. Do not keep both `kill-port` and `killport`

## Source Of Truth

For the no-argument path, `make killport` must use only:

- `apps/noter/.env.local`

It must read the first local backend port from:

- `VITE_CONVEX_URL`, or
- `CONVEX_URL`

If `apps/noter/.env.local` does not exist, or neither variable contains a local port,
`make killport` must exit successfully without killing anything.

## Required Behavior

### `make killport`

1. If an explicit positional port argument is present, use it
2. Otherwise, read the current worktree port from `apps/noter/.env.local`
3. If no port is available, exit successfully without doing anything
4. If the port is known but nothing is listening on it, exit successfully
5. If one or more processes are listening on that port, send `SIGTERM`

### `make anon` and `make anon-once`

1. Run `make killport` first
2. Continue with the existing anonymous bootstrap flow after that no-op/cleanup

## Notes

This design intentionally prefers a small, explicit operator primitive over a broader automation
layer. The fix is "stop the previously known anon backend for this worktree before starting a new
one," not "inspect Convex failures and retry startup generically."
