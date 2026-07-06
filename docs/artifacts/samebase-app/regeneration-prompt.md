# Prompt: Regenerate samebase/app-Style Artifact

Use this prompt when asking an agent to recreate a clean public artifact history.

```text
You are regenerating a samebase/app-style public teaching artifact.

Important: the generated app repository is an artifact. Do not put prompt files,
research notes, or regeneration instructions inside it. Keep those in the Samebase
source repo under docs/artifacts/samebase-app/.

Before writing code:
1. Read docs/artifacts/samebase-app/README.md in the Samebase repo.
2. Inspect the current samebase/app main branch:
   - git log --oneline --reverse main
   - REPO_HISTORY.md
   - README.md
   - package.json
   - vite.config.ts
   - src/routes
   - src/components/ui
   - convex
   - scripts
   - docs/logos
3. Compare Samebase and the generated artifact toolchain pins. Keep Node, pnpm,
   Wrangler, Convex, Vite+, TanStack Start, TypeScript, React, and related
   shared deploy tooling aligned unless the plan explicitly explains a temporary
   divergence.
4. Produce a feature-parity checklist for the final app. Include small visible
   details like the QR share block.
5. Produce a numbered commit plan that mirrors REPO_HISTORY.md style.
6. Do not implement until the plan preserves both feature parity and the
   teaching-history shape.

When implementing:
1. Preserve the current generated attempt first, usually as v0 or the next
   obvious archive branch.
2. Create a new orphan main branch.
3. Commit `0: empty commit`.
4. Build the app in numbered steps.
5. Update REPO_HISTORY.md in the same commit that introduces each step.
6. Never reconstruct REPO_HISTORY.md at the end. It must evolve with the
   history: step 1 creates it, step 2 appends or updates step 2, and so on.
7. Prefer exact command blocks in REPO_HISTORY.md when a step is created by a
   CLI. The command shown must be the command that actually ran.
8. Prefer CLI commands over hand-written scaffolding whenever a clean CLI exists.
9. For step 1, use the Vite+ app command, like samebase/app:

   vp create vite:application \
     --directory <target-directory> \
     --agent codex \
     --editor vscode \
     --hooks \
     --no-interactive \
     --verbose

10. The first numbered commit must include REPO_HISTORY.md with the exact
    Vite+ create command above, using the real target directory name.
11. Prefer Vite+ commands for stack changes:
   - vp add
   - vp add -D
   - vp dlx
   - vp exec
   - vp run

12. Do not use the TanStack Start CLI output as the artifact source. It may be
   used in a throwaway directory for research, but it adds too many files and
   can confuse package-manager expectations with Vite+.
13. Do not keep generator leftovers such as .cta.json or .cursorrules.
14. Run validation after meaningful steps.

For a Workers/TanStack Start version:
- Start from a Vite+ application and add TanStack Start manually.
- Use TanStack Start SPA mode.
- Keep Convex as the backend.
- Preserve the current app behavior, including the QR share block.
- Deploy with Cloudflare Workers Static Assets using wrangler.jsonc.
- Read docs/artifacts/samebase-app/cloudflare-workers-install.md before writing
  Workers setup docs. Make `package.json` `build` match the Cloudflare
  dashboard default and delegate to the Cloudflare-aware build path. Do not
  hard-code the Worker `name` in `wrangler.jsonc`; use repo-owned deploy scripts
  to pass the connected Cloudflare Worker name to Wrangler. Keep
  `build.command` out of the reusable `wrangler.jsonc` so Workers Builds and
  local Wrangler checks have one clear build owner each. If Node-invoked
  deploy/build helpers are TypeScript, pin Node 24 with `.node-version` or
  `NODE_VERSION`; otherwise use plain ESM JavaScript helpers or an explicit
  TypeScript runner.
- Use the split Convex deploy-key contract: `PROD_CONVEX_DEPLOY_KEY` for the
  production branch, `PREVIEW_CONVEX_DEPLOY_KEY` for non-production branches,
  and no generic `CONVEX_DEPLOY_KEY` in the parent Workers build environment.
- In the generated template docs, explain the Cloudflare Workers Builds UI
  limitation that motivates those split names: the API supports per-trigger
  build variables for production and preview triggers, but the dashboard setup
  path does not expose a Pages-style production/preview selector for build
  variables. Explain that the build script reads `WORKERS_CI_BRANCH`, picks the
  right split secret, and passes only the selected value to the deploy child
  process.
- Document the current Convex permission split: production `PROD_CONVEX_DEPLOY_KEY`
  is a production deploy key with exactly `deployment:deploy`, `deployment:env:view`,
  `deployment:env:write`, and `deployment:data:view`; `deployment:data:write`,
  function-run permissions, logs, backups, and integrations are not needed. `PREVIEW_CONVEX_DEPLOY_KEY`
  is the separate project-level Preview deploy key.
- Do not add server functions, Worker request handlers, SSR complexity, extra
  adapters, or demo routes unless the first app truly needs them.

The final history should read like a tutorial and proof that the stack is
simple, not like a generated scaffold dump or an exploratory work log.
```
