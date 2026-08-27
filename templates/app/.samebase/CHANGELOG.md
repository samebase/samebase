# Samebase template changelog

This file lists upstream template changes that can affect locally edited files. Read each entry
after the baseline in `template.json`, apply the entries in order, and keep local product changes.

## v1977

### Changes

- Adds `.samebase/template.json`, this changelog, and a source-build marker to each TypeScript file
  in `scripts/`.
- Moves the public prerender page and route-alias contract to `prerender.config.ts`. Vite and the
  Cloudflare redirect generator now read the same contract.

### Update together

- Apply `prerender.config.ts`, `vite.config.ts`, `scripts/generate-cloudflare-redirects.ts`, and its
  test as one change. Delete `scripts/cloudflare-prerender-pages.ts`, then regenerate
  `public/_redirects`.
- Apply `scripts/generate-dev-launcher-version.ts`, `scripts/run-context-dev.ts`,
  `scripts/run-primary-dev.ts`, and `scripts/run-worktree-dev.ts` as one change. The source-build
  marker is line 1, and the shared launcher hash is line 2 in the three launcher files.

No environment or provider configuration changes are required.

### Verify

```sh
pnpm install
pnpm run check
```
