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
- Read templates/base/docs/cloudflare-workers-builds.md before writing
  Workers setup docs. Make `package.json` `build` match the Cloudflare
  dashboard default and delegate to the Cloudflare-aware build path. Do not
  hard-code the Worker `name` in `wrangler.jsonc`; use the template's pinned
  Wrangler version to read the Worker name from Workers Builds. Keep
  `build.command` out of the reusable `wrangler.jsonc` so Workers Builds and
  local Wrangler checks have one clear build owner each. Keep Node-invoked
  repository automation in erasable TypeScript runnable by plain `node`, and
  pin Node 24 with `.node-version` or `NODE_VERSION`. The core workflow must run
  natively on macOS, Linux, and Windows. Do not add Bash scripts, POSIX-only
  inline environment assignment, shell parameter expansion, or required
  Unix-only utilities; use Node process APIs and handle Windows `.cmd` entry
  points explicitly when needed.
- Use the native Worker Previews commands and deploy-key scopes documented in
  templates/base/docs/cloudflare-workers-builds.md. Do not restore the old
  two-key build script or the Wrangler deploy wrapper.
- Follow docs/worker-previews-migration.md when updating an existing app.
- Do not add server functions, Worker request handlers, SSR complexity, extra
  adapters, or demo routes unless the first app truly needs them.

The final history should read like a tutorial and proof that the stack is
simple, not like a generated scaffold dump or an exploratory work log.
```
