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

- [Contributing](../CONTRIBUTING.md) for the public contributor entry point and setup limits
- [Samebase development](samebase-development.md) for maintainer startup, deployment, and sign-in
- [Public launch checklist](public-launch-checklist.md) for repository publication and launch work

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
- `alchemy.run.ts` for the Samebase stack: the Convex project, its production deployment and pull
  request previews, and the `samebase-posthog-proxy` Worker with its route, and
  `apps/sidebars-example/alchemy.run.ts` for the sidebars example Worker, both deployed by
  `.github/workflows/alchemy.yml`
- `docs/compliance/` for compliance artifacts

Do not use `docs/` as a dumping ground for accepted behavior or open-ended research; put those in
`specs/`, `rfcs/`, or `research/` instead.
