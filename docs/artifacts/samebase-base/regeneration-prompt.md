# Prompt: Regenerate samebase/base-style artifact

Use this prompt when asking an agent to recreate a clean public artifact history.

```text
You are regenerating a samebase/base-style public teaching artifact.

Important: the generated app repository is an artifact. Do not put prompt files,
research notes, or regeneration instructions inside it. Keep those in the Samebase
source repo under docs/artifacts/samebase-base/.

Before writing code:
1. Read docs/artifacts/samebase-base/README.md in the Samebase repo.
2. Inspect the current samebase/base main branch:
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
3. Run the complete toolchain comparison in the Toolchain Alignment section of
   docs/artifacts/samebase-base/README.md. Classify every difference between Samebase,
   the generated artifact, and the target before implementation.
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
9. For step 1, use the Vite+ app command, like samebase/base:

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
- Read docs/artifacts/samebase-base/cloudflare-workers-install.md before writing
  Workers setup docs. Make `package.json` `build` match the Cloudflare
  dashboard default and delegate to the Cloudflare-aware build path. Do not
  hard-code the Worker `name` in `wrangler.jsonc`; use Wrangler's native
  connected Worker name from the build environment. Keep
  `build.command` out of the reusable `wrangler.jsonc` so Workers Builds and
  local Wrangler checks have one clear build owner each. Keep Node-invoked
  repository automation in erasable TypeScript runnable by plain `node`, and
  pin Node 24 with `.node-version` or `NODE_VERSION`. The core workflow must run
  natively on macOS, Linux, and Windows. Do not add Bash scripts, POSIX-only
  inline environment assignment, shell parameter expansion, or required
  Unix-only utilities; use Node process APIs and handle Windows `.cmd` entry
  points explicitly when needed.
- Use `CONVEX_DEPLOY_KEY` on both Workers Builds triggers. Store the production
  deploy key on the production trigger and the project Preview deploy key on the
  preview trigger. Do not read `PREVIEW_CONVEX_DEPLOY_KEY` in active code.
- Treat `SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>` as Samebase's
  readable
  Cloudflare Builds marker. Write the marker only to the production trigger during
  Samebase-managed setup. The generated app must not consume it.
- Explain that Samebase-managed setup writes the canonical key separately through
  the Builds trigger API. Existing apps delete `PREVIEW_CONVEX_DEPLOY_KEY` through
  the starter changelog migration. Put the preview key under
  **Builds > Previews Base > Variables and secrets**, not under
  **Runtime variables and secrets**.
- Keep `build`, `deploy`, and `deploy:preview` as the stable Samebase repository
  interface. Make `deploy:preview` run `wrangler preview` directly. Pin a Wrangler
  release at least 4.135.0. For local use, pass `--worker-name <actual-worker-name>`.
  The `--name` option selects the Preview name. Worker Previews has no dry-run mode.
- Add `previews: {}` to `wrangler.jsonc` for the static-only app. Put any preview
  runtime variables and bindings in that block. Copy dashboard-generated settings
  into the file. Keep runtime secrets outside the file in Previews Base. Later
  Base secret changes affect new Previews only.
- Describe Worker Previews as a public open beta and the default for new Workers
  Builds projects. Existing Workers need the one-time switch in Settings > Builds.
  Explain that the switch cannot be reversed and replaces the Preview command.
  Restore `pnpm run deploy:preview` after the switch. Migrate an existing app on
  a branch, verify a real Preview, then verify production after the approved merge.
  Delete old preview keys and markers manually only after those checks pass.
- Document the current Convex permission split: production `CONVEX_DEPLOY_KEY`
  is a production deploy key with exactly `deployment:deploy`, `deployment:env:view`,
  `deployment:env:write`, and `deployment:data:view`; `deployment:data:write`,
  function-run permissions, logs, backups, and integrations are not needed. The
  preview trigger value is the separate project-level Preview deploy key.
- Do not add server functions, Worker request handlers, SSR complexity, extra
  adapters, or demo routes unless the first app truly needs them.

The final history should read like a tutorial and proof that the stack is
simple, not like a generated scaffold dump or an exploratory work log.
```
