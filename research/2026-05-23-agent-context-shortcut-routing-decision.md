# Agent Context Shortcut Routing Decision

## Document Control

- Status: Routing decision
- Date: 2026-05-23
- Related:
  - `AGENTS.md`
  - `docs/agent-workflows.md`
  - `packages/agent-context/overlays/noter-operator-workflows.md`
  - `packages/agent-context/manifests/noter.md`

## Decision

Keep shortcut recognition in always-loaded `AGENTS.md` for now. Detailed semantics can live in
`docs/agent-workflows.md` and `packages/agent-context/overlays/noter-operator-workflows.md`, but
bare commands such as `commit`, `ship`, `wait`, and `clean` need a compact always-loaded command
table or router until the runtime guarantees the Noter operator overlay is loaded before
interpreting user commands.

## Evidence

The current `AGENTS.md` command table is the only guaranteed always-loaded routing surface for bare
operator commands. `docs/agent-workflows.md` already contains the full shorthand table and detailed
workflow rules, but a user saying only `ship` or `clean` does not necessarily trigger a docs load
before the agent decides how to respond.

The packaged `noter-operator-workflows` overlay is the right destination for detailed shortcut
semantics, but before this decision it had only partial shortcut coverage. The overlay now carries
the complete shortcut table so a future loader can route to it without losing command meanings.

## Migration Rule

Before shrinking the shortcut section in live `AGENTS.md`:

- prove the runtime loads `noter-operator-workflows` before resolving bare repo shortcuts, or keep
  the compact command table in always-loaded context
- keep detailed PR, CI, cleanup, and merge behavior in `docs/agent-workflows.md` and
  `noter-operator-workflows`
- use `pr-workflow-review` for PR/CI/review-heavy shortcuts
- use `exact-resource-cleanup` for `archive`, `clean vaults`, and `clean`

Until that loader guarantee exists, shortcut recognition is `keep-short`, not removable.
