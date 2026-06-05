# Specs

`specs/` is for accepted, current source-of-truth behavior and active accepted rollout contracts
that the team intends to execute or has already shipped.

A document belongs here when it answers "what should the product do now?" or "what is the currently
accepted implementation contract?"

Use `specs/` for:

- current behavior contracts
- active accepted rollout contracts that need to guide more than one change
- validation expectations for shipped or accepted behavior
- accepted data model, API, auth, security, compliance, migration, or provider boundaries

Do not use `specs/` for:

- open-ended exploration
- competing proposals
- routine one-thread or one-PR implementation plans
- working logs, per-commit trackers, or status journals
- historical notes
- operator runbooks or compliance artifacts that do not define product behavior

When a proposal becomes accepted and active, extract the durable accepted contract into a spec
instead of promoting the whole planning document. When a spec no longer matches reality, move it to
`archive/` or replace it with the new source of truth. After a rollout ships, reduce the spec to the
current contract and validation expectations instead of appending more implementation history.

See `docs/repo-documentation-standard.md` for the full placement decision table, spec threshold, and
cleanup rules.
