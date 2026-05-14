# Prompt: Regenerate notermd/app-Style Artifact

Use this prompt when asking an agent to recreate a clean public artifact history.

```text
You are regenerating a notermd/app-style public teaching artifact.

Important: the generated app repository is an artifact. Do not put prompt files,
research notes, or regeneration instructions inside it. Keep those in the Noter
source repo under docs/artifacts/notermd-app/.

Before writing code:
1. Read docs/artifacts/notermd-app/README.md in the Noter repo.
2. Inspect the current notermd/app main branch:
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
3. Produce a feature-parity checklist for the final app. Include small visible
   details like the QR share block.
4. Produce a numbered commit plan that mirrors REPO_HISTORY.md style.
5. Do not implement until the plan preserves both feature parity and the
   teaching-history shape.

When implementing:
1. Preserve the current generated attempt first, usually as v0 or the next
   obvious archive branch.
2. Create a new orphan main branch.
3. Commit `0: empty commit`.
4. Build the app in numbered steps.
5. Update REPO_HISTORY.md in the same commit that introduces each step.
6. Prefer CLI commands over hand-written scaffolding whenever a clean CLI exists.
7. For step 1, use the Vite+ app command, like notermd/app:

   vp create vite:application \
     --directory <target-directory> \
     --agent codex \
     --editor vscode \
     --hooks \
     --no-interactive \
     --verbose

8. Prefer Vite+ commands for stack changes:
   - vp add
   - vp add -D
   - vp dlx
   - vp exec
   - vp run

9. Do not use the TanStack Start CLI output as the artifact source. It may be
   used in a throwaway directory for research, but it adds too many files and
   can confuse package-manager expectations with Vite+.
10. Do not keep generator leftovers such as .cta.json or .cursorrules.
11. Run validation after meaningful steps.

For a Workers/TanStack Start version:
- Start from a Vite+ application and add TanStack Start manually.
- Use TanStack Start SPA mode.
- Keep Convex as the backend.
- Preserve the current app behavior, including the QR share block.
- Deploy with Cloudflare Workers Static Assets using wrangler.jsonc.
- Do not add server functions, Worker request handlers, SSR complexity, extra
  adapters, or demo routes unless the first app truly needs them.

The final history should read like a tutorial and proof that the stack is
simple, not like a generated scaffold dump or an exploratory work log.
```
