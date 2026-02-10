# Convex Codegen CI Issue

`convex codegen` fails in CI since convex v1.28.0 now requires a deployment connection.
noter uses v1.31.7 (affected), chessmerge uses v1.24.3 (not affected).

- [Convex v1.28.0 changelog (breaking change)](https://github.com/get-convex/convex-js/blob/main/CHANGELOG.md#1280)
- [Convex docs: committing generated code](https://docs.convex.dev/understanding/best-practices/other-recommendations)
- [Convex docs: generated API](https://docs.convex.dev/generated-api/)

## Fix

Either commit `_generated/` and remove `convex codegen` from `lint`/`build` scripts,
or set `CONVEX_DEPLOYMENT` as a GitHub Actions secret.
