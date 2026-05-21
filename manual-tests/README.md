# Manual Tests

This folder stores lightweight, human/AI executable test instructions.

Goal: keep manual verification simple and repeatable before adding automation.

## Structure

- `TEMPLATE.md`: required format for new manual tests.
- `MCP-*.md`: MCP OAuth and remote MCP server phase smoke tests.
- `TOOLS-*.md`: internal tooling smoke tests that require local operator setup.
- `worktree/`: worktree-specific tests (`WT-###`).
- `.runs/`: optional local run notes (ignored by git).

## Naming

- Use stable IDs: `WT-001`, `AUTH-001`, `OAUTH-001`, etc.
- File name format: `<ID>-<short-name>.md`.

## How to run

1. Open a specific test file (for example `worktree/WT-001-anon-worktree-isolation.md`).
2. Execute steps in order.
3. Mark pass/fail per expected result.
4. If needed, save local evidence in `manual-tests/.runs/`.

## Repo policy for run logs

- Do not commit run logs by default.
- If a run log is needed for PR evidence, include only one short summary in PR text instead of
  committing many run files.

## AI shortcut

If you ask: "check if worktree is working", default to running:

- `WT-001` (anonymous worktree isolation smoke)
