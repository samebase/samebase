# Docs

`docs/` is for durable reference material that supports the repo but does not itself define current
product behavior.

Use `docs/` for:

- workflow runbooks
- compliance and policy artifacts
- operator or release reference material
- reference docs that agents or humans may need to consult, but that are not product specs or active
  proposals

Current key docs:

- `docs/agent-workflows.md` for deeper git/PR/worktree workflow rules
- `docs/repo-documentation-standard.md` for deciding whether material belongs in `specs/`, `rfcs/`,
  `research/`, `docs/`, `skills/`, `archive/`, or a PR body
- `docs/artifacts/samebase-base/` for regenerating the public `samebase/base` artifact history
- `docs/playwright-visual-testing.md` for Linux-canonical visual test workflow
- `docs/existing-app-cloudflare-workers-migration.md` for moving an adopted application from an old
  host to Cloudflare Workers with branch validation, cutover, monitoring, and rollback
- [Worker Previews](https://samebase.com/docs/cloudflare-previews-migration) for switching an
  existing Convex app to Worker Previews, separating build keys, and checking that repeated preview
  builds preserve data and sessions
- `apps/samebase/alchemy.run.ts` for the Samebase setup stack: the `samebase` Worker's Builds
  settings, its Convex project and deploy keys, and the `samebase-posthog-proxy` and
  `samebase-domains` Workers with their routes, deployed by `.github/workflows/infra.yml`
- `docs/compliance/` for compliance artifacts

Do not use `docs/` as a dumping ground for accepted behavior or open-ended research; put those in
`specs/`, `rfcs/`, or `research/` instead.
