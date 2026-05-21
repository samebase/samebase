# Convex Codegen in CI

## Context

`convex codegen` behavior changed in Convex `v1.28.0+` to require deployment context in CI
environments.

## Current Repo State (2026-02-13)

- `apps/noter/package.json` currently pins `convex` to `1.27.5`.
- Current scripts still run `convex codegen` during lint/build.

## If/When Upgrading Convex to `>=1.28.0`

Plan for one of these approaches:

1. Configure CI with `CONVEX_DEPLOYMENT` and required Convex credentials.
2. Commit generated `_generated/` artifacts and remove codegen from CI lint/build steps.

## References

- [Convex changelog v1.28.0](https://github.com/get-convex/convex-js/blob/main/CHANGELOG.md#1280)
- [Convex docs: generated API](https://docs.convex.dev/generated-api/)
- [Convex docs: recommendations around generated code](https://docs.convex.dev/understanding/best-practices/other-recommendations)
